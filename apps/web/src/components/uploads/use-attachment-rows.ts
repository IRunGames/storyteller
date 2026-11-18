"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatest } from "@/hooks/use-latest";
import type { Attachment, AttachmentKind } from "@/lib/attachments";
import { sa_listAttachments } from "./actions";

// A client-only sentinel, never a status the server sends. It marks a row
// the field only knows by id -- seeded from `value` after a remount with a
// null idExternal, the one situation with no sa_listAttachments to ask
// instead (see AttachmentListField's Props doc comment). Rendering it as
// READY would claim a row is fine when the field has no idea whether it is;
// rendering it as ERROR would claim a failure that may not exist. It gets
// its own neutral rendering: no thumbnail, no Retry (there is no cached File
// to resend and no server status to justify offering one), just a name and
// Remove.
export const UNKNOWN_STATUS = "UNKNOWN";

const LOAD_FAILED = "Could not load this story's attachments.";

type Options = {
  kind: AttachmentKind;
  /** Null on a create form, before the parent row exists. */
  idExternal: number | null;
  /** The ids a create form seeds its rows from; see AttachmentListField's Props. */
  value: number[];
  /** Told the ids whenever the set or its order changes. */
  onChange?: (ids: number[]) => void;
  /** Told how many rows there are, once the first load is back and on every add or delete. */
  onCountChange?: (count: number) => void;
};

/**
 * The rows behind AttachmentListField and how they are kept: local state,
 * hydrated from the server rather than from `value` for a non-null
 * idExternal (see the field's Props doc comment for why), plus whatever this
 * session has added on top. The effect loads the real rows once on mount
 * when there is a real idExternal to load them for.
 *
 * `rowsRef` is the rows as they stand this instant, for the async work the
 * field does (uploads, deletes) that must not read a stale render's state;
 * `commit` is the one way the rows change, and it tells the parent the ids
 * when the set or its order moved. `removedIds` and `addedHere` are the two
 * ledgers a list fetch and a search are reconciled against; see each.
 */
export function useAttachmentRows({ kind, idExternal, value, onChange, onCountChange }: Options) {
  const [rows, setRows] = useState<Attachment[]>(() =>
    idExternal === null
      ? value.map((id) => ({
          idAttachment: id,
          idStory: null,
          kind,
          idExternal,
          idAttachmentUse: null,
          status: UNKNOWN_STATUS,
          url: null,
          isUploaded: false,
          fileName: null,
          isCover: false,
          tags: [],
          createdAt: null,
          updatedAt: null,
        }))
      : [],
  );
  const rowsRef = useRef(rows);
  // An async upload or retry started under one render's onChange prop must
  // still report to whichever onChange the parent has wired up by the time
  // it finishes.
  const onChangeRef = useLatest(onChange);

  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether the first load has come back, so an empty list can say "none"
  // without saying it while the rows are still on their way. A create form
  // has nothing to load and starts loaded.
  const [hasLoaded, setHasLoaded] = useState(idExternal === null);

  // Not until the first load is back, so the heading never says (0) for a
  // story whose attachments are still on their way. A ref for the callback,
  // so a parent passing a fresh function each render does not re-report.
  const onCountChangeRef = useLatest(onCountChange);
  useEffect(() => {
    if (hasLoaded) onCountChangeRef.current?.(rows.length);
  }, [hasLoaded, rows.length, onCountChangeRef]);
  // A load in flight, guarding loadAttachments() against a second click on
  // Try Again starting an overlapping fetch -- the later-resolving one
  // would otherwise win even if it read rowsRef before the earlier one's
  // merge applied.
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);

  // Ids sa_deleteAttachment has been asked to remove this session, kept
  // separately from rowsRef because rowsRef only says what is on screen
  // *now* -- it cannot tell a merge "this id used to be here and must stay
  // gone" once a removal has already taken it out. The delete is a separate
  // round trip from the removal itself (commit() runs first,
  // sa_deleteAttachment is awaited after), so a list fetch's SELECT can run
  // in between and still see the row: without this, fetchMergedAttachments
  // would treat that as a legitimate server row and bring it back, and
  // commit() would report the resurrected id to the parent as if the user
  // had never removed it. An id leaves this set again in exactly one place:
  // when sa_deleteAttachment rejects and the removal puts the row back, at
  // which point the row really is still there and a later merge is right to
  // report it. A successful delete keeps its id here for good, and a
  // re-upload of the same file gets a brand new id from sa_createAttachment
  // rather than reusing this one.
  const removedIds = useRef(new Set<number>());

  // Ids added through the field, which a search that ran before they existed
  // cannot have matched; see the field's visibleRows.
  const addedHere = useRef(new Set<number>());

  /**
   * Fetches the field's real rows for a real parent and merges them
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

  // The Try Again button calls this directly: a fresh, user-requested load
  // with no earlier effect run that could race it. isLoadingRef (not just
  // the isLoading state the button's aria-disabled reads) is what actually
  // stops a second click from starting an overlapping fetch: state updates
  // are not visible synchronously, so a click that lands before React
  // re-renders the disabled button would otherwise slip through.
  async function loadAttachments(): Promise<void> {
    if (idExternal === null || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      const merged = await fetchMergedAttachments();
      setLoadError(null);
      setHasLoaded(true);
      commit(merged);
    } catch {
      // sa_listAttachments calls requireAccount() and runs a db.select, either
      // of which can reject. Left unhandled, rows would stay [] forever
      // with nothing on screen to say why -- on an edit form that reads as
      // "this story has no pictures", which invites the user to re-upload
      // everything that is really still there.
      setLoadError(LOAD_FAILED);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
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
        setLoadError(LOAD_FAILED);
      }
    })();
    return () => {
      cancelled = true;
    };
    // commit() reaches only refs and a state setter, so a new one each
    // render is no reason to load again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idExternal, fetchMergedAttachments]);

  // At the front, as sa_listAttachments orders the list: newest first.
  function addRow(row: Attachment) {
    addedHere.current.add(row.idAttachment);
    commit([row, ...rowsRef.current]);
  }

  function updateRow(id: number, patch: Partial<Attachment>) {
    commit(rowsRef.current.map((row) => (row.idAttachment === id ? { ...row, ...patch } : row)));
  }

  return {
    rows,
    rowsRef,
    commit,
    addRow,
    updateRow,
    removedIds,
    addedHere,
    loadError,
    hasLoaded,
    isLoading,
    loadAttachments,
  };
}

export type AttachmentRows = ReturnType<typeof useAttachmentRows>;
