"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Box, Button, Field, FileUpload, HStack, Image, Input, Stack, Text } from "@chakra-ui/react";
import { useUser } from "@/components/auth/user-provider";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, uploadPrefix } from "@/lib/image-uploads";
import {
  sa_createAttachment,
  sa_deleteAttachment,
  sa_markAttachmentError,
  sa_markAttachmentReady,
  sa_retryAttachment,
} from "./actions";
import type { Attachment, AttachmentKind } from "@/lib/attachments";

type Props = {
  kind: AttachmentKind;
  /** Null on a create form, before the parent row exists. */
  idExternal: number | null;
  /** The attachment ids the form will claim, in display order. */
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
 * rows is local state, not derived from `value`: sa_listAttachments needs a
 * real idExternal, which a create form does not have yet, and there is no
 * per-id lookup action. So this field only knows about attachments added
 * during the current session; an initial non-empty `value` renders as bare
 * rows (no file name or thumbnail) that can still be removed.
 */
export function AttachmentListField({ kind, idExternal, value, onChange }: Props) {
  const { id: userId } = useUser();
  const [rows, setRows] = useState<Attachment[]>(() =>
    value.map((id) => ({
      idAttachment: id,
      kind,
      idExternal,
      status: "READY",
      url: null,
      isUploaded: false,
      fileName: null,
    })),
  );
  const rowsRef = useRef(rows);
  // Kept current in an effect, not written during render: an async upload
  // or retry started under one render's onChange prop must still report to
  // whichever onChange the parent has wired up by the time it finishes.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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

  function commit(next: Attachment[]) {
    rowsRef.current = next;
    setRows(next);
    onChangeRef.current(next.map((row) => row.idAttachment));
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
    filesByAttachment.current.delete(id);
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

      <FileUpload.Root
        accept={[...ALLOWED_IMAGE_TYPES]}
        maxFileSize={MAX_IMAGE_BYTES}
        maxFiles={20}
        onFileAccept={(details) => handleFilesAccepted(details.files)}
        onFileReject={(details) => setFieldError(rejectionMessage(details.files[0]))}
      >
        <FileUpload.HiddenInput />
        <FileUpload.Dropzone>
          <FileUpload.DropzoneContent>
            <Text>Drag images here or click to browse</Text>
          </FileUpload.DropzoneContent>
        </FileUpload.Dropzone>
      </FileUpload.Root>

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
                  <Button size="xs" type="button" onClick={() => void handleRetry(row.idAttachment)}>
                    Retry
                  </Button>
                </>
              )}
              <Button
                size="xs"
                variant="ghost"
                type="button"
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
