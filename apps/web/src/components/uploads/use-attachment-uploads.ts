"use client";

import { useRef } from "react";
import { upload } from "@vercel/blob/client";
import { useFileUpload } from "@chakra-ui/react";
import { useUser } from "@/components/auth/user-provider";
import type { Attachment, AttachmentKind } from "@/lib/attachments";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, uploadPrefix } from "@/lib/image-uploads";
import { toaster } from "@/components/ui/toaster";
import {
  sa_createAttachment,
  sa_deleteAttachment,
  sa_markAttachmentError,
  sa_markAttachmentReady,
  sa_retryAttachment,
} from "./actions";
import type { AttachmentRows } from "./use-attachment-rows";

/**
 * The stamps for a row the field just made, before the server lists it: the
 * moment it was added, so a newest-first list puts it where it belongs.
 */
export function justNow(): Pick<Attachment, "createdAt" | "updatedAt"> {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now };
}

function rejectionMessage(rejection: { errors: string[] } | undefined): string {
  const errors = rejection?.errors ?? [];
  if (errors.includes("FILE_INVALID_TYPE")) {
    return "Only PNG, JPEG, WebP or GIF images are accepted.";
  }
  if (errors.includes("FILE_TOO_LARGE")) {
    return "That image is larger than the 10 MB limit.";
  }
  return "That file could not be added.";
}

type Options = {
  kind: AttachmentKind;
  idExternal: number | null;
  rows: AttachmentRows;
  /** The field's own error line, for a failure the user has to act on. */
  setFieldError: (message: string | null) => void;
};

/**
 * The uploads behind AttachmentListField: the dropzone's machine, and for
 * each file picked a row made at once (sa_createAttachment), the bytes sent
 * to the blob store, and the row marked ready, or discarded if the upload
 * failed. The files and the attempts are kept here so Retry can resend and
 * a slow attempt cannot overwrite a newer one; `forget` and `restore` are
 * for the field's removal, which has to take a row's file and attempt with
 * it and put them back if the delete is refused.
 */
export function useAttachmentUploads({ kind, idExternal, rows, setFieldError }: Options) {
  const { id: userId } = useUser();
  const { rowsRef, commit, addRow, updateRow, removedIds } = rows;

  // The file behind each row still being uploaded or retried, kept in memory
  // so Retry can resend it -- sa_retryAttachment only flips the row's status
  // server-side, it does not itself have a copy of the bytes.
  const filesByAttachment = useRef(new Map<number, File>());
  // Which attempt is the current one for a given attachment id. A retry
  // starts a new attempt for the same id, and only the latest attempt for
  // that id is allowed to write its result -- otherwise a slow first attempt
  // landing after a faster retry (or after the row was removed) would
  // overwrite the newer state. Keyed per attachment because uploads for
  // different rows run independently of one another.
  const ticketsByAttachment = useRef(new Map<number, number>());
  // zag's FileUpload machine hands onFileAccept the whole cumulative
  // acceptedFiles array on every selection, not just the files newly added
  // by that selection (context.set("acceptedFiles", (prev) => [...prev,
  // ...files])). File objects already seen keep their identity across that
  // array, so tracking them by reference is what stops a second selection
  // from re-uploading the first one all over again.
  const startedFiles = useRef(new Set<File>());

  // Built with useFileUpload + FileUpload.RootProvider rather than plain
  // FileUpload.Root so the field's removal can reach fileUpload.deleteFile():
  // that API is only available to a component that owns the machine
  // instance, not to one merely rendering <FileUpload.Root> as a descendant
  // of itself.
  const fileUpload = useFileUpload({
    accept: [...ALLOWED_IMAGE_TYPES],
    maxFileSize: MAX_IMAGE_BYTES,
    // No ceiling on how many a holder carries. zag's own default is one
    // file, so a list has to say so.
    maxFiles: Infinity,
    onFileAccept: (details) => handleFilesAccepted(details.files),
    onFileReject: (details) => setFieldError(rejectionMessage(details.files[0])),
  });

  function beginAttempt(id: number): number {
    const ticket = (ticketsByAttachment.current.get(id) ?? 0) + 1;
    ticketsByAttachment.current.set(id, ticket);
    return ticket;
  }

  function isCurrentAttempt(id: number, ticket: number): boolean {
    return ticketsByAttachment.current.get(id) === ticket;
  }

  async function runUpload(id: number, file: File) {
    const ticket = beginAttempt(id);
    try {
      const blob = await upload(`${uploadPrefix(userId)}${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      if (!isCurrentAttempt(id, ticket)) return;
      await sa_markAttachmentReady(id, blob.url);
      if (!isCurrentAttempt(id, ticket)) return;
      updateRow(id, { status: "READY", url: blob.url });
    } catch {
      if (!isCurrentAttempt(id, ticket)) return;
      await discardFailedUpload(id, file);
    }
  }

  /**
   * A failed upload says so in a toast and its row goes, rather than staying
   * in the list as an ERROR card: the row holds no file, so there is nothing
   * in it to keep, and a stuck card was all the storyteller was left with.
   * The file is released from both ledgers, so picking it again starts a
   * fresh upload.
   *
   * Taken off screen first and recorded in removedIds, as the field's
   * removal does, so a list fetch landing meanwhile cannot bring it back.
   * Only if the delete itself is refused does the row come back, as ERROR,
   * where its Retry and remove buttons are.
   */
  async function discardFailedUpload(id: number, file: File) {
    const index = rowsRef.current.findIndex((row) => row.idAttachment === id);
    if (index === -1) return;
    const failedRow = rowsRef.current[index];

    toaster.create({ title: `${file.name} could not be uploaded.`, type: "error" });
    removedIds.current.add(id);
    ticketsByAttachment.current.delete(id);
    filesByAttachment.current.delete(id);
    startedFiles.current.delete(file);
    fileUpload.deleteFile(file);
    commit(rowsRef.current.filter((row) => row.idAttachment !== id));

    try {
      await sa_deleteAttachment(id);
    } catch {
      removedIds.current.delete(id);
      filesByAttachment.current.set(id, file);
      try {
        await sa_markAttachmentError(id);
      } catch {
        // Swallowed deliberately: the row comes back as ERROR below either
        // way, with its remove button. The server-side status stays
        // UPLOADING until a retry or the sweep corrects it.
      }
      if (!rowsRef.current.some((row) => row.idAttachment === id)) {
        const restored = [...rowsRef.current];
        restored.splice(Math.min(index, restored.length), 0, { ...failedRow, status: "ERROR" });
        commit(restored);
      }
    }
  }

  async function startUpload(file: File) {
    let created: { idAttachment: number; status: string };
    try {
      created = await sa_createAttachment({
        kind,
        idExternal,
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size,
      });
    } catch {
      // No row was created, so there is nothing on screen for runUpload to
      // report against: without this the file would simply vanish, with an
      // unhandled rejection in the console the only trace. An expired
      // session, a database failure, or an edit form whose story changed
      // hands since it was opened all land here.
      setFieldError("That file could not be added. Please try again.");
      // Both ledgers were charged for a row that never existed. startedFiles
      // is what stops the same File being uploaded twice, so releasing it
      // lets the user simply pick the file again; zag's own accepted-files
      // list never shrinks by itself, so the file is taken out of it too,
      // as a removal does for a row that goes.
      startedFiles.current.delete(file);
      fileUpload.deleteFile(file);
      return;
    }
    filesByAttachment.current.set(created.idAttachment, file);
    addRow({
      idAttachment: created.idAttachment,
      idStory: null,
      kind,
      idExternal,
      idAttachmentUse: null,
      status: created.status,
      url: null,
      isUploaded: true,
      fileName: file.name,
      isCover: false,
      tags: [],
      ...justNow(),
    });
    await runUpload(created.idAttachment, file);
  }

  function handleFilesAccepted(files: File[]) {
    for (const file of files) {
      if (startedFiles.current.has(file)) continue;
      startedFiles.current.add(file);
      void startUpload(file);
    }
  }

  async function retry(id: number) {
    // An ERROR row always has its file cached -- it can only have been set by
    // startUpload, and removal clears both the row and the cache together --
    // but the guard comes first anyway so a future caller of this function
    // can never leave the row saying UPLOADING with nothing behind it to send.
    const file = filesByAttachment.current.get(id);
    if (!file) return;
    try {
      await sa_retryAttachment(id);
    } catch {
      // The row stays ERROR with its Retry button, which is exactly the
      // state to be in when the retry itself could not be started. Going on
      // to runUpload regardless would show UPLOADING for a row the server
      // still has as ERROR, and sa_markAttachmentReady would then be asked
      // to make a transition the workflow refuses.
      setFieldError("That upload could not be retried. Please try again.");
      return;
    }
    updateRow(id, { status: "UPLOADING" });
    await runUpload(id, file);
  }

  /** What a row carried here, taken as the row goes; `restore` puts it back. */
  type Carried = { ticket: number | undefined; file: File | undefined };

  /**
   * A row is going: its attempt is invalidated first, so an upload or retry
   * already in flight for it cannot resurrect it once the user has asked for
   * it to be gone, and its file is released. zag's own accepted-files list
   * only ever grows (nothing else tells it a file left), so the file is
   * taken out of it here, and the list it keeps stays the files actually on
   * screen.
   */
  function forget(id: number): Carried {
    const ticket = ticketsByAttachment.current.get(id);
    const file = filesByAttachment.current.get(id);
    ticketsByAttachment.current.delete(id);
    filesByAttachment.current.delete(id);
    if (file) fileUpload.deleteFile(file);
    return { ticket, file };
  }

  /**
   * The removal was refused: the row's attempt and file go back. zag's
   * accepted-files list is the one thing not put back: deleteFile has no
   * inverse, and nothing reads that list but zag.
   */
  function restore(id: number, carried: Carried) {
    if (carried.ticket !== undefined) ticketsByAttachment.current.set(id, carried.ticket);
    if (carried.file) filesByAttachment.current.set(id, carried.file);
  }

  return { fileUpload, retry, forget, restore };
}
