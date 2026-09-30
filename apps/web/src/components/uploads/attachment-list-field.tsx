"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { attachmentUrlSchema } from "@/lib/attachment-schemas";
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

// Twenty is the owner's answer to "how many pictures may one story, sitting
// or scene carry at any one time" -- a ceiling on what exists at once, not a
// budget spent by uploading, so removing a row hands its place straight back.
//
// Also the cap on concurrent uploads zag's own FileUpload ledger enforces
// (see fileUpload.deleteFile in handleRemove, which keeps that ledger in
// step with the rows actually on screen). zag's ledger only ever counts
// files accepted through the dropzone, though -- a link added through
// handleAddUrl never touches it -- so it is not authoritative for the
// total the user can actually see, and cannot be trusted alone to enforce
// this cap when the two kinds of row mix. rowsRef.current.length is: both
// handleAddUrl and handleFilesAccepted check it directly before adding
// anything, rather than leaning on zag's own count.
const MAX_ATTACHMENTS = 20;

const MAX_ATTACHMENTS_MESSAGE = `You can have at most ${MAX_ATTACHMENTS} attachments at once here. Remove one first.`;

// A client-only sentinel, never a status the server sends. It marks a row
// this field only knows by id -- seeded from `value` after a remount with a
// null idExternal, the one situation with no sa_listAttachments to ask
// instead (see the Props doc comment). Rendering it as READY would claim a
// row is fine when this field has no idea whether it is; rendering it as
// ERROR would claim a failure that may not exist. It gets its own neutral
// rendering: no thumbnail, no Retry (there is no cached File to resend and
// no server status to justify offering one), just a name and Remove.
const UNKNOWN_STATUS = "UNKNOWN";

type Props = {
  kind: AttachmentKind;
  /** Null on a create form, before the parent row exists. */
  idExternal: number | null;
  /**
   * The attachment ids the form will claim, in display order.
   *
   * Read only once, as the initial state, and only when idExternal is null:
   * a create form that remounts (e.g. after a failed submit that reset the
   * tree) has no sa_listAttachments to recover its rows from, since nothing
   * with a null idExternal is findable that way -- `value`, coming from the
   * form's own state, is the only surviving record. Those ids render with
   * UNKNOWN_STATUS (see above) rather than an invented READY.
   *
   * When idExternal is non-null this field ignores `value` completely and
   * hydrates its rows -- with their real statuses -- from
   * sa_listAttachments instead, which is authoritative where `value` is not
   * (a status this field never recorded is not something `value` could ever
   * carry, since it is just ids).
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
    return MAX_ATTACHMENTS_MESSAGE;
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
 * for a non-null idExternal (see the Props doc comment for why), plus
 * whatever this session has added on top. An effect below loads the real
 * rows once on mount when there is a real idExternal to load them for.
 */
export function AttachmentListField({ kind, idExternal, value, onChange }: Props) {
  const { id: userId } = useUser();
  const [rows, setRows] = useState<Attachment[]>(() =>
    idExternal === null
      ? value.map((id) => ({
          idAttachment: id,
          kind,
          idExternal,
          status: UNKNOWN_STATUS,
          url: null,
          isUploaded: false,
          fileName: null,
        }))
      : [],
  );
  const rowsRef = useRef(rows);
  // Kept current in an effect, not written during render: an async upload
  // or retry started under one render's onChange prop must still report to
  // whichever onChange the parent has wired up by the time it finishes.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [loadError, setLoadError] = useState<string | null>(null);
  // A load in flight, guarding loadAttachments() against a second click on
  // Try Again starting an overlapping fetch -- the later-resolving one
  // would otherwise win even if it read rowsRef before the earlier one's
  // merge applied.
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const isLoadingRef = useRef(false);

  // Ids sa_deleteAttachment has been asked to remove this session, kept
  // separately from rowsRef because rowsRef only says what is on screen
  // *now* -- it cannot tell a merge "this id used to be here and must stay
  // gone" once handleRemove has already taken it out. The delete is a
  // separate round trip from the removal itself (commit() runs first,
  // sa_deleteAttachment is awaited after), so a list fetch's SELECT can run
  // in between and still see the row: without this, fetchMergedAttachments
  // would treat that as a legitimate server row and bring it back, and
  // commit() would report the resurrected id to the parent as if the user
  // had never removed it. An id leaves this set again in exactly one place:
  // when sa_deleteAttachment rejects and handleRemove puts the row back, at
  // which point the row really is still there and a later merge is right to
  // report it. A successful delete keeps its id here for good, and a
  // re-upload of the same file gets a brand new id from sa_createAttachment
  // rather than reusing this one.
  const removedIds = useRef(new Set<number>());

  /**
   * Fetches this field's real rows for a real parent and merges them
   * against whatever is already showing, rather than replacing outright:
   * `loaded` is authoritative for the ids it contains, but a row this
   * session has already added locally (a link typed or a file picked while
   * this request was still in flight) did not exist when the server query
   * ran, so it cannot be in `loaded` and must not be erased by it. Ids in
   * removedIds are dropped regardless of which side they came from, for
   * the same reason in reverse: a removal already asked for must not be
   * undone by a select that ran before the delete committed. Does not
   * touch state itself -- callers decide what to do with the result, which
   * is what keeps the actual setState calls inline in whichever caller runs
   * them (see the two call sites below for why that matters).
   */
  const fetchMergedAttachments = useCallback(async (): Promise<Attachment[]> => {
    // Only called with a non-null idExternal; see both call sites.
    const loaded = await sa_listAttachments(kind, idExternal as number);
    const loadedIds = new Set(loaded.map((row) => row.idAttachment));
    const localOnly = rowsRef.current.filter((row) => !loadedIds.has(row.idAttachment));
    return [...loaded, ...localOnly].filter((row) => !removedIds.current.has(row.idAttachment));
  }, [kind, idExternal]);

  // The Try Again button below calls this directly: a fresh, user-requested
  // load with no earlier effect run that could race it. isLoadingRef (not
  // just the isLoadingAttachments state the button's aria-disabled reads)
  // is what actually stops a second click from starting an overlapping
  // fetch: state updates are not visible synchronously, so a click that
  // lands before React re-renders the disabled button would otherwise slip
  // through.
  async function loadAttachments(): Promise<void> {
    if (idExternal === null || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoadingAttachments(true);
    try {
      const merged = await fetchMergedAttachments();
      setLoadError(null);
      commit(merged);
    } catch {
      // sa_listAttachments calls requireUser() and runs a db.select, either
      // of which can reject. Left unhandled, rows would stay [] forever
      // with nothing on screen to say why -- on an edit form that reads as
      // "this story has no pictures", which invites the user to re-upload
      // everything that is really still there.
      setLoadError("Could not load this story's attachments.");
    } finally {
      isLoadingRef.current = false;
      setIsLoadingAttachments(false);
    }
  }

  // Not routed through loadAttachments() above: react-hooks/set-state-in-effect
  // flags any setState reached from an effect through a named function call,
  // since it cannot see past the call to confirm the state update happens
  // only after the await inside it. Inlined here instead, where the await
  // before every setState call is visible in the same function body.
  useEffect(() => {
    if (idExternal === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const merged = await fetchMergedAttachments();
        if (cancelled) return;
        setLoadError(null);
        commit(merged);
      } catch {
        if (cancelled) return;
        setLoadError("Could not load this story's attachments.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idExternal, fetchMergedAttachments]);

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
      try {
        await sa_markAttachmentError(id);
      } catch {
        // Swallowed deliberately: the upload has already failed, and the one
        // thing the user needs is the ERROR row below with its Retry button.
        // Rethrowing (or awaiting this unguarded) would skip that update and
        // leave the row saying UPLOADING for ever, which is the one state
        // with nothing the user can do about it. The row's server-side
        // status stays UPLOADING until the retry or the sweep corrects it.
      }
      if (!isCurrentAttempt(id, ticket)) return;
      updateRow(id, { status: "ERROR" });
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
      // count never shrinks by itself, so a file left in it would keep its
      // place against maxFiles for the rest of the session even though no
      // row was ever added. handleRemove releases both for the same reason.
      startedFiles.current.delete(file);
      fileUpload.deleteFile(file);
      return;
    }
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
    // A synchronous counter, not a repeated rowsRef.current.length check:
    // each accepted file's row only lands in rowsRef once its
    // sa_createAttachment call resolves, so a whole batch dropped at once
    // would otherwise all see the same pre-batch count and all pass, even
    // once the batch itself would push the total over the cap. It is only
    // ever this one batch's budget: the next call recounts rowsRef, so a
    // file whose sa_createAttachment fails costs nothing beyond its own
    // batch (startUpload hands its place in the two lasting ledgers back).
    let available = MAX_ATTACHMENTS - rowsRef.current.length;
    for (const file of files) {
      if (startedFiles.current.has(file)) continue;
      startedFiles.current.add(file);
      if (available <= 0) {
        setFieldError(MAX_ATTACHMENTS_MESSAGE);
        continue;
      }
      available -= 1;
      void startUpload(file);
    }
  }

  async function handleAddUrl() {
    const url = urlValue.trim();
    if (!url) return;
    // Checked against rowsRef.current.length, not zag's own ledger: zag
    // never sees a link added through this path, so its count and the
    // true visible total can drift once the two kinds of row mix (see the
    // comment on MAX_ATTACHMENTS above).
    if (rowsRef.current.length >= MAX_ATTACHMENTS) {
      setFieldError(MAX_ATTACHMENTS_MESSAGE);
      return;
    }
    // Checked client-side against the same schema sa_createAttachment runs
    // server-side, rather than letting a bad url reach the network and
    // relying on the thrown error's message surviving the server action
    // boundary intact. attachmentUrlSchema's own message is the one
    // surfaced, so there is exactly one wording for "not a valid url" to
    // keep in sync, not two that can drift apart.
    const parsed = attachmentUrlSchema.safeParse(url);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Please enter a valid URL.");
      return;
    }
    setFieldError(null);
    try {
      const created = await sa_createAttachment({ kind, idExternal, url: parsed.data });
      addRow({
        idAttachment: created.idAttachment,
        kind,
        idExternal,
        status: created.status,
        url: parsed.data,
        isUploaded: false,
        fileName: null,
      });
      setUrlValue("");
    } catch {
      // Genuinely unexpected at this point -- the url and the cap were
      // already checked above -- so this is a network or server failure
      // rather than something the message could name more specifically.
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

  async function handleRemove(id: number) {
    // Everything undone below is captured first, because a refused delete
    // has to put the row back exactly where it was: the row itself and its
    // position, the cached file Retry would resend, and the in-flight
    // attempt's ticket.
    const index = rowsRef.current.findIndex((row) => row.idAttachment === id);
    if (index === -1) return;
    const removedRow = rowsRef.current[index];
    const ticket = ticketsByAttachment.current.get(id);
    const file = filesByAttachment.current.get(id);

    // Recorded before anything else: a list fetch's SELECT can land between
    // this function's synchronous commit() below and the sa_deleteAttachment
    // it then awaits, and would otherwise still see -- and bring back -- a
    // row this call is in the middle of removing.
    removedIds.current.add(id);
    // Invalidate first: an upload or retry already in flight for this row
    // must not resurrect it once the user has asked for it to be gone.
    ticketsByAttachment.current.delete(id);
    filesByAttachment.current.delete(id);
    // zag's own accepted-files ledger only ever grows (nothing else tells it
    // a file left); left alone, an add/remove/re-add cycle burns through
    // MAX_ATTACHMENTS even though the visible list holds far fewer rows.
    // Removing it here is what keeps "how many uploads zag will still take"
    // matching "how many rows are actually on screen".
    if (file) fileUpload.deleteFile(file);
    commit(rowsRef.current.filter((row) => row.idAttachment !== id));
    try {
      await sa_deleteAttachment(id);
    } catch {
      // The row went off screen synchronously above and the parent has
      // already been told it left, so a refusal that only logged itself
      // would leave the user believing an attachment is gone that is still
      // attached -- and, on a story, still its cover. Everything the removal
      // did is undone and the failure is named inline, next to the field
      // rather than in a toast, because it is a failure the user has to act
      // on. zag's ledger is the one thing not put back: deleteFile has no
      // inverse, and undercounting there is harmless since rowsRef is what
      // actually enforces the cap.
      removedIds.current.delete(id);
      if (ticket !== undefined) ticketsByAttachment.current.set(id, ticket);
      if (file) filesByAttachment.current.set(id, file);
      if (!rowsRef.current.some((row) => row.idAttachment === id)) {
        const restored = [...rowsRef.current];
        restored.splice(Math.min(index, restored.length), 0, removedRow);
        commit(restored);
      }
      setFieldError("That attachment could not be removed. Please try again.");
    }
  }

  return (
    <Field.Root invalid={!!fieldError || !!loadError}>
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

      {loadError && (
        <HStack>
          <Field.ErrorText>{loadError}</Field.ErrorText>
          <Button
            size="xs"
            type="button"
            aria-disabled={isLoadingAttachments}
            onClick={() => void loadAttachments()}
          >
            Try again
          </Button>
        </HStack>
      )}

      <Stack role="list" aria-label="Current attachments" direction={{ base: "column", sm: "row" }} gap="3" wrap="wrap">
        {rows.map((row) => {
          const label = row.fileName ?? row.url ?? `Attachment ${row.idAttachment}`;
          const placeholder =
            row.status === "ERROR" ? "Failed" : row.status === UNKNOWN_STATUS ? "Attachment" : "Uploading…";
          return (
            <Box role="listitem" key={row.idAttachment} borderWidth="1px" rounded="md" p="2" w={{ base: "full", sm: "40" }}>
              {row.url ? (
                <Image src={row.url} alt={label} boxSize="16" objectFit="cover" rounded="md" />
              ) : (
                <Box boxSize="16" rounded="md" bg="bg.muted" display="flex" alignItems="center" justifyContent="center">
                  <Text fontSize="xs" color="fg.muted">
                    {placeholder}
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
