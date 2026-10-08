"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  Button,
  Field,
  FileUpload,
  Grid,
  HStack,
  Input,
  Stack,
  Text,
  useFileUpload,
} from "@chakra-ui/react";
import { Image as ImageIcon } from "lucide-react";
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
  sa_setAttachmentCover,
  sa_setAttachmentTags,
} from "./actions";
import { AttachmentCard } from "./attachment-card";
import { MAX_ATTACHMENTS, type Attachment, type AttachmentKind } from "@/lib/attachments";

// MAX_ATTACHMENTS (lib/attachments.ts) is also the cap on concurrent uploads zag's own FileUpload ledger enforces
// (see fileUpload.deleteFile in handleRemove, which keeps that ledger in
// step with the rows actually on screen). zag's ledger only ever counts
// files accepted through the dropzone, though -- a link added through
// handleAddUrl never touches it -- so it is not authoritative for the
// total the user can actually see, and cannot be trusted alone to enforce
// this cap when the two kinds of row mix. rowsRef.current.length is: both
// handleAddUrl and handleFilesAccepted check it directly before adding
// anything, rather than leaning on zag's own count.

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
  value?: number[];
  /**
   * Told the ids whenever the set or its order changes. Optional because a
   * field with a real idExternal attaches its rows itself and has nothing a
   * parent must collect: the story page mounts it that way from a server
   * component, which cannot hand a function to a client one.
   */
  onChange?: (ids: number[]) => void;
  /**
   * Whether the link input and the dropzone show. Defaults to shown; the story
   * page keeps them behind its Add Attachments toggle so the cards are what
   * the section opens on. Hiding them unmounts nothing that matters: uploads
   * in flight, the typed link and zag's FileUpload machine all live in this
   * component, which stays mounted either way.
   */
  showAdd?: boolean;
  /** An id for the block holding the link input and dropzone, for aria-controls. */
  addId?: string;
  /**
   * Somewhere else on the page to draw the link input and dropzone, when the
   * page wants them away from the cards: the Prep Work board puts them above
   * its column's filters. Drawn there through a portal, so they are still
   * this component's own, with the rows, the typed link and any upload in
   * flight. Undefined draws them in place; null means the page's box is not
   * there yet, and nothing is drawn until it is.
   */
  addTarget?: HTMLElement | null;
  /**
   * Only these attachments show, when given: the ids a search matched, from
   * sa_searchAttachments. The field still holds every row (an object has at
   * most MAX_ATTACHMENTS), so narrowing it is a matter of what is drawn, and
   * clearing the search brings the rest straight back. Null or absent shows
   * them all.
   */
  shownIds?: ReadonlySet<number> | null;
  /** Leaves the cover out of the cards, for the Prep Work board's Covers switch. */
  hideCovers?: boolean;
  /**
   * Says so in words when there is nothing to show, once the rows have
   * loaded: "No attachments yet" for an object with none, "No matches" when
   * the search or the Covers switch leaves none. The story page goes without,
   * since its heading and toggle already say what the section is for.
   */
  showEmpty?: boolean;
  /**
   * Told how many attachments the field holds, once the first load is back
   * and whenever an add or a delete changes it: the Prep Work board's count
   * beside the Attachments heading. Every row counts, whatever the search or
   * the Covers switch leaves drawn, as the Scenes count ignores its search.
   */
  onCountChange?: (count: number) => void;
  /**
   * Draws the rows in place of the cards, for a page that lists attachments
   * its own way and keeps this field for everything else: loading, adding,
   * uploading, the search and the Covers switch. Handed what would have been
   * drawn (the search and the Covers switch already applied, newest first)
   * and this field's own optimistic handlers, so a tag or cover changed there
   * changes here too. The run page's library is the one that does.
   */
  renderRows?: (view: AttachmentRowsView) => ReactNode;
};

/** What a renderRows caller is given; see Props.renderRows. */
export type AttachmentRowsView = {
  rows: Attachment[];
  /** Whether the first load is back, so an empty list can say none. */
  hasLoaded: boolean;
  /** As the card's tags popover calls it; resolves false on a refusal. */
  setTags: (idAttachment: number, tags: string[]) => Promise<boolean>;
  /** As the card's Cover button calls it; resolves false on a refusal. */
  setCover: (idAttachment: number, isCover: boolean) => Promise<boolean>;
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
export function AttachmentListField({
  kind,
  idExternal,
  value = [],
  onChange,
  showAdd = true,
  addId,
  addTarget,
  shownIds = null,
  hideCovers = false,
  showEmpty = false,
  onCountChange,
  renderRows,
}: Props) {
  const { id: userId } = useUser();
  const router = useRouter();
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
          isCover: false,
          tags: [],
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
  // Whether the first load has come back, so an empty list can say "none"
  // without saying it while the rows are still on their way. A create form
  // has nothing to load and starts loaded.
  const [hasLoaded, setHasLoaded] = useState(idExternal === null);

  // Not until the first load is back, so the heading never says (0) for a
  // story whose attachments are still on their way. A ref for the callback,
  // so a parent passing a fresh function each render does not re-report.
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);
  useEffect(() => {
    if (hasLoaded) onCountChangeRef.current?.(rows.length);
  }, [hasLoaded, rows.length]);
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
    // Local rows first: they were added after the query ran, and the list runs
    // newest first.
    return [...localOnly, ...loaded].filter((row) => !removedIds.current.has(row.idAttachment));
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
      setHasLoaded(true);
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
        setHasLoaded(true);
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
    if (idsChanged) onChangeRef.current?.(nextIds);
  }

  // Ids added through this field, which a search that ran before they existed
  // cannot have matched; see visibleRows.
  const addedHere = useRef(new Set<number>());

  // At the front, as sa_listAttachments orders the list: newest first.
  function addRow(row: Attachment) {
    addedHere.current.add(row.idAttachment);
    commit([row, ...rowsRef.current]);
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
      isCover: false,
      tags: [],
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
        isCover: false,
        tags: [],
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

  /**
   * Makes a row the cover, or stops it being one. Shown at once: the row
   * pressed takes the cover and every other row loses it, matching what
   * sa_setAttachmentCover does in one transaction, and the old flags go back
   * if the action refuses. On success the page around the field re-renders,
   * since the cover it draws (the story page's backdrop) is server-rendered.
   * Resolves false on a refusal, for the card or popover to say so beside
   * the control that was pressed.
   */
  async function handleCover(id: number, isCover: boolean): Promise<boolean> {
    const before = rowsRef.current;
    commit(
      before.map((row) => ({
        ...row,
        isCover: row.idAttachment === id ? isCover : isCover ? false : row.isCover,
      })),
    );
    try {
      await sa_setAttachmentCover(id, isCover);
      router.refresh();
      return true;
    } catch {
      // Back to the flags as they were for every row this press touched,
      // matched by id because rows may have been added or removed meanwhile.
      const previous = new Map(before.map((row) => [row.idAttachment, row.isCover]));
      commit(
        rowsRef.current.map((row) => ({
          ...row,
          isCover: previous.get(row.idAttachment) ?? row.isCover,
        })),
      );
      return false;
    }
  }

  /**
   * Replaces a row's tags, shown at once and put back if the action refuses.
   * Resolves false on a refusal, which the tags popover reports itself. No
   * refresh: nothing outside this field shows a plain tag.
   */
  async function handleTags(id: number, tags: string[]): Promise<boolean> {
    const previous = rowsRef.current.find((row) => row.idAttachment === id)?.tags;
    if (!previous) return false;
    updateRow(id, { tags });
    try {
      await sa_setAttachmentTags(id, tags);
      return true;
    } catch {
      updateRow(id, { tags: previous });
      return false;
    }
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
      // The cover is drawn by the server-rendered page around this field (the
      // story page's backdrop), which knows nothing of this list. Removing it
      // leaves that page showing a picture that is gone until it re-renders.
      if (removedRow.isCover) router.refresh();
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

  // The link input and dropzone, drawn below where the field starts or into
  // addTarget.
  const addControls = (
    <Stack id={addId} w="full" gap="3">
      <Field.Root w="full">
        <Field.Label>Link</Field.Label>
        <HStack w="full">
          <Input
            flex="1"
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
      </Field.Root>

      <FileUpload.RootProvider value={fileUpload} w="full">
        <FileUpload.HiddenInput />
        {/* 12.8rem is four fifths of the recipe's 2xs (16rem) minimum. */}
        <FileUpload.Dropzone w="full" minH="12.8rem">
          <ImageIcon size={32} />
          <FileUpload.DropzoneContent>
            <Text>Drag images here or click to browse</Text>
          </FileUpload.DropzoneContent>
        </FileUpload.Dropzone>
      </FileUpload.RootProvider>
    </Stack>
  );

  // What is drawn: every row, less any a search left out and, when the
  // Covers pill is off, the cover. Filtering what is drawn rather than rows
  // itself keeps the ids reported through onChange the whole set. A row
  // added here always shows: the search that would decide it ran before it
  // existed, and a picture vanishing as it is added would look like a failure.
  const visibleRows = rows.filter(
    (row) =>
      (shownIds === null ||
        shownIds.has(row.idAttachment) ||
        addedHere.current.has(row.idAttachment)) &&
      !(hideCovers && row.isCover),
  );

  return (
    <Field.Root invalid={!!fieldError || !!loadError} w="full" gap="3">
      {/* No caption for the whole field: the page around it supplies the
          heading, as the story page's Attachments section does. This
          Field.Root holds two controls (the link input and the dropzone's
          hidden file input) and a label binds to one, so the link gets a
          Field.Root of its own for its "Link" label; the outer one stays for
          the field-wide error state and its ErrorText. */}
      {/* In place, or in the box the page asked for; see addTarget. */}
      {showAdd &&
        (addTarget === undefined
          ? addControls
          : addTarget !== null && createPortal(addControls, addTarget))}

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

      {renderRows ? (
        renderRows({
          rows: visibleRows,
          hasLoaded,
          setTags: handleTags,
          setCover: handleCover,
        })
      ) : (
        <>
          {showEmpty && hasLoaded && !loadError && visibleRows.length === 0 && (
            <Text color="fg.muted">{rows.length === 0 ? "No attachments yet." : "No matches."}</Text>
          )}

          {/* auto-fill, so the cards fill the row and wrap to as many columns
              as the width holds, down to one on a phone. */}
          <Grid
            role="list"
            aria-label="Current attachments"
            w="full"
            gap="3"
            templateColumns="repeat(auto-fill, minmax(13rem, 1fr))"
          >
            {visibleRows.map((row) => (
              <AttachmentCard
                key={row.idAttachment}
                row={row}
                label={row.fileName ?? row.url ?? `Attachment ${row.idAttachment}`}
                placeholder={
                  row.status === "ERROR"
                    ? "Failed"
                    : row.status === UNKNOWN_STATUS
                      ? "Attachment"
                      : "Uploading…"
                }
                canTag={idExternal !== null}
                onRetry={() => void handleRetry(row.idAttachment)}
                onRemove={() => void handleRemove(row.idAttachment)}
                onCoverChange={(isCover) => handleCover(row.idAttachment, isCover)}
                onTagsChange={(tags) => handleTags(row.idAttachment, tags)}
              />
            ))}
          </Grid>
        </>
      )}

      <Field.ErrorText>{fieldError}</Field.ErrorText>
    </Field.Root>
  );
}
