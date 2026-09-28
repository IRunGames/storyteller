"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  Box,
  Button,
  Field,
  FileUpload,
  HStack,
  Image,
  Input,
  Stack,
  Text,
  useFileUpload,
} from "@chakra-ui/react";
import { useUser } from "@/components/auth/user-provider";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, uploadPrefix } from "@/lib/image-uploads";
import {
  sa_createAttachment,
  sa_deleteAttachment,
  sa_listAttachments,
  sa_markAttachmentError,
  sa_markAttachmentReady,
  sa_retryAttachment,
} from "./actions";
import type { Attachment, AttachmentKind } from "@/lib/attachments";

// Also the cap on concurrent uploads zag's own FileUpload ledger enforces
// (see fileUpload.deleteFile in handleRemove, which keeps that ledger in
// step with the rows actually on screen).
const MAX_ATTACHMENTS = 20;

type Props = {
  kind: AttachmentKind;
  /** Null on a create form, before the parent row exists. */
  idExternal: number | null;
  /**
   * The attachment ids the form will claim, in display order. This field
   * does not read it back: for a non-null idExternal it hydrates its own
   * rows -- with their real statuses -- from sa_listAttachments on mount,
   * and for a null idExternal (a create form) there is nothing to load, so
   * it starts empty. Treating `value` as a rendering source would mean
   * inventing a status for an id this field has no information about; an id
   * that is actually ERROR would then render as a plain, healthy row with
   * no way to tell it apart or retry it.
   */
  value: number[];
  onChange: (ids: number[]) => void;
};

function rejectionMessage(rejection: { errors: string[] } | undefined): string {
  const errors = rejection?.errors ?? [];
  if (errors.includes("FILE_INVALID_TYPE")) {
    return "Only PNG, JPEG, WebP or GIF images are accepted.";
  }
  if (errors.includes("FILE_TOO_LARGE")) {
    return "That image is larger than the 10 MB limit.";
  }
  if (errors.includes("TOO_MANY_FILES")) {
    return `You can have at most ${MAX_ATTACHMENTS} attachments at once here. Remove one first.`;
  }
  return "That file could not be added.";
}

/**
 * A controlled list of attachment ids for a story, session or scene. Unlike
 * ImageUploadField's single value, each row is its own attachment row from
 * the moment a link is typed or a file is picked, so kind/idExternal are
 * handed to sa_createAttachment straight away -- an edit form's rows are
 * already attached to their parent at creation, and a create form's rows
 * simply carry a null idExternal until Task 9's create action claims them.
 * This field never calls sa_claimAttachments itself.
 *
 * rows is local state, hydrated from the server rather than from `value`
 * (see the Props doc comment for why), plus whatever this session has added
 * on top. It starts empty and, for a non-null idExternal, an effect below
 * loads the real rows once on mount.
 */
export function AttachmentListField({ kind, idExternal, onChange }: Props) {
  const { id: userId } = useUser();
  const [rows, setRows] = useState<Attachment[]>([]);
  const rowsRef = useRef(rows);
  // Kept current in an effect, not written during render: an async upload
  // or retry started under one render's onChange prop must still report to
  // whichever onChange the parent has wired up by the time it finishes.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Loads this field's real rows -- with their real statuses -- once kind
  // and idExternal identify an actual parent. A null idExternal is a create
  // form with nothing claimed yet, so there is nothing to load; rows only
  // start appearing there as this session creates them.
  useEffect(() => {
    if (idExternal === null) return;
    let cancelled = false;
    void (async () => {
      const loaded = await sa_listAttachments(kind, idExternal);
      if (cancelled) return;
      rowsRef.current = loaded;
      setRows(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, idExternal]);

  const [urlValue, setUrlValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

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
  // FileUpload.Root so handleRemove below can reach fileUpload.deleteFile():
  // that API is only available to a component that owns the machine
  // instance, not to one merely rendering <FileUpload.Root> as a descendant
  // of itself.
  const fileUpload = useFileUpload({
    accept: [...ALLOWED_IMAGE_TYPES],
    maxFileSize: MAX_IMAGE_BYTES,
    maxFiles: MAX_ATTACHMENTS,
    onFileAccept: (details) => handleFilesAccepted(details.files),
    onFileReject: (details) => setFieldError(rejectionMessage(details.files[0])),
  });

  function commit(next: Attachment[]) {
    const prevIds = rowsRef.current.map((row) => row.idAttachment);
    const nextIds = next.map((row) => row.idAttachment);
    rowsRef.current = next;
    setRows(next);
    // A status or url change (upload finishing, an error, a retry) rewrites
    // a row in place without touching which ids are present -- onChange
    // only needs to fire when the id set or its order actually moved.
    const idsChanged =
      prevIds.length !== nextIds.length || prevIds.some((id, i) => id !== nextIds[i]);
    if (idsChanged) onChangeRef.current(nextIds);
  }

  function addRow(row: Attachment) {
    commit([...rowsRef.current, row]);
  }

  function updateRow(id: number, patch: Partial<Attachment>) {
    commit(
      rowsRef.current.map((row) => (row.idAttachment === id ? { ...row, ...patch } : row)),
    );
  }

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
      await sa_markAttachmentError(id);
      if (!isCurrentAttempt(id, ticket)) return;
      updateRow(id, { status: "ERROR" });
    }
  }

  async function startUpload(file: File) {
    const created = await sa_createAttachment({
      kind,
      idExternal,
      fileName: file.name,
      contentType: file.type,
      byteSize: file.size,
    });
    filesByAttachment.current.set(created.idAttachment, file);
    addRow({
      idAttachment: created.idAttachment,
      kind,
      idExternal,
      status: created.status,
      url: null,
      isUploaded: true,
      fileName: file.name,
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

  async function handleAddUrl() {
    const url = urlValue.trim();
    if (!url) return;
    setFieldError(null);
    try {
      const created = await sa_createAttachment({ kind, idExternal, url });
      addRow({
        idAttachment: created.idAttachment,
        kind,
        idExternal,
        status: created.status,
        url,
        isUploaded: false,
        fileName: null,
      });
      setUrlValue("");
    } catch {
      setFieldError("That link could not be added. Please try again.");
    }
  }

  async function handleRetry(id: number) {
    // An ERROR row always has its file cached -- it can only have been set by
    // startUpload, and removal clears both the row and the cache together --
    // but the guard comes first anyway so a future caller of this function
    // can never leave the row saying UPLOADING with nothing behind it to send.
    const file = filesByAttachment.current.get(id);
    if (!file) return;
    await sa_retryAttachment(id);
    updateRow(id, { status: "UPLOADING" });
    await runUpload(id, file);
  }

  async function handleRemove(id: number) {
    // Invalidate first: an upload or retry already in flight for this row
    // must not resurrect it once the user has asked for it to be gone.
    ticketsByAttachment.current.delete(id);
    const file = filesByAttachment.current.get(id);
    filesByAttachment.current.delete(id);
    // zag's own accepted-files ledger only ever grows (nothing else tells it
    // a file left); left alone, an add/remove/re-add cycle burns through
    // MAX_ATTACHMENTS even though the visible list holds far fewer rows.
    // Removing it here is what keeps "how many uploads zag will still take"
    // matching "how many rows are actually on screen".
    if (file) fileUpload.deleteFile(file);
    commit(rowsRef.current.filter((row) => row.idAttachment !== id));
    await sa_deleteAttachment(id);
  }

  return (
    <Field.Root invalid={!!fieldError}>
      {/* Not Field.Label: this Field.Root holds two controls (the link input
          and the dropzone's hidden file input), and a label can only bind to
          one of them. Each control names itself instead. */}
      <Text fontWeight="medium">Attachments</Text>

      <HStack>
        <Input
          aria-label="Attachment link"
          placeholder="https://…"
          value={urlValue}
          onChange={(event) => setUrlValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleAddUrl();
            }
          }}
        />
        <Button
          type="button"
          aria-disabled={!urlValue.trim()}
          onClick={() => {
            if (urlValue.trim()) void handleAddUrl();
          }}
        >
          Add link
        </Button>
      </HStack>

      <FileUpload.RootProvider value={fileUpload}>
        <FileUpload.HiddenInput />
        <FileUpload.Dropzone>
          <FileUpload.DropzoneContent>
            <Text>Drag images here or click to browse</Text>
          </FileUpload.DropzoneContent>
        </FileUpload.Dropzone>
      </FileUpload.RootProvider>

      <Stack role="list" aria-label="Current attachments" direction={{ base: "column", sm: "row" }} gap="3" wrap="wrap">
        {rows.map((row) => {
          const label = row.fileName ?? row.url ?? `Attachment ${row.idAttachment}`;
          return (
            <Box role="listitem" key={row.idAttachment} borderWidth="1px" rounded="md" p="2" w={{ base: "full", sm: "40" }}>
              {row.url ? (
                <Image src={row.url} alt={label} boxSize="16" objectFit="cover" rounded="md" />
              ) : (
                <Box boxSize="16" rounded="md" bg="bg.muted" display="flex" alignItems="center" justifyContent="center">
                  <Text fontSize="xs" color="fg.muted">
                    {row.status === "ERROR" ? "Failed" : "Uploading…"}
                  </Text>
                </Box>
              )}
              <Text fontSize="sm" truncate>
                {label}
              </Text>
              {row.status === "ERROR" && (
                <>
                  <Text fontSize="xs" color="fg.error">
                    That file could not be uploaded.
                  </Text>
                  <Button
                    size="xs"
                    type="button"
                    aria-label={`Retry ${label}`}
                    onClick={() => void handleRetry(row.idAttachment)}
                  >
                    Retry
                  </Button>
                </>
              )}
              <Button
                size="xs"
                variant="ghost"
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => void handleRemove(row.idAttachment)}
              >
                Remove
              </Button>
            </Box>
          );
        })}
      </Stack>

      <Field.ErrorText>{fieldError}</Field.ErrorText>
    </Field.Root>
  );
}
