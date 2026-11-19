"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_APPENDED_OPS, type AnnotationOp } from "@/lib/annotation-schemas";
import { pendingChange, type PictureAnnotation } from "@/lib/annotations";
import { toaster } from "@/components/ui/toaster";
import { useLatest } from "@/hooks/use-latest";
import { sa_getAnnotation, sa_refreshPlayersCopy, sa_saveAnnotation } from "./actions";

/** How long the annotator waits after a change before saving, so a run of strokes goes as one save. */
export const SAVE_DELAY_MS = 400;

/**
 * How long after the last save the annotator asks for the players' copy
 * again, in case the render each save asked for stopped short or failed, and
 * how often it asks again while the copy is still behind.
 */
export const REFRESH_DELAY_MS = 3000;

// The most coordinates one save carries, well inside a server action's 1 MB
// body: a backlog of long strokes (after a spell without the server) goes
// over several saves rather than one that would be refused every time.
const MAX_SAVE_COORDINATES = 50_000;

/** Whether what is on screen is saved, being saved, or waiting to be. */
export type SaveStatus = "saved" | "saving" | "unsaved";

type Drawing = { ops: AnnotationOp[]; fogOpacityPlayers: number; fogColor: string };
type Saved = Drawing & { revision: number };

export type AnnotationSession = Drawing & {
  status: SaveStatus;
  canUndo: boolean;
  /** Adds a finished step to the drawing. */
  draw: (op: AnnotationOp) => void;
  /** Takes the last step off the drawing, whenever it was made. */
  undo: () => void;
  setFogOpacityPlayers: (value: number) => void;
  setFogColor: (color: string) => void;
};

const coordinatesOf = (op: AnnotationOp) =>
  op.t === "brush" || op.t === "pen" ? op.points.length : op.t === "erase" ? op.targets.length : 4;

/** The first of the steps waiting that one save may carry: at least one, at most a save's worth. */
function aSavesWorth(append: AnnotationOp[]): AnnotationOp[] {
  let coordinates = 0;
  let count = 0;
  while (count < append.length && count < MAX_APPENDED_OPS) {
    coordinates += coordinatesOf(append[count]);
    if (count > 0 && coordinates > MAX_SAVE_COORDINATES) break;
    count++;
  }
  return append.slice(0, count);
}

/**
 * The annotator's drawing as it is being made: shown at once, and saved
 * behind it. A change waits SAVE_DELAY_MS for the next, then the steps since
 * the last save go to the server as the steps kept and the steps added
 * (pendingChange), with the revision they were drawn on, one save at a time
 * and a save's worth at a time; whatever was drawn while one was out goes
 * next, from the revision it made.
 *
 * A save refused as stale (the drawing was changed in another tab) loads the
 * drawing again in place of what was on screen, since the server's is the
 * one the players are being shown. Any other refusal keeps the steps on
 * screen and says why; they go with the next change.
 *
 * The players' copy is asked for as the annotator opens, a while after each
 * save, again and again while it is behind the drawing, and as it closes,
 * once whatever was waiting has been saved.
 */
export function useAnnotationSession(
  idAttachment: number,
  initial: PictureAnnotation,
  options: {
    /**
     * The annotator has been left (closed, or the page with it), told once
     * whatever was waiting has been saved: for what it was opened from to
     * read the picture back, now on if a change made here turned it on.
     */
    onLeave?: () => void;
  } = {},
): AnnotationSession {
  const onLeave = useLatest(options.onLeave);
  const [shown, setShown] = useState<Drawing>({
    ops: initial.ops,
    fogOpacityPlayers: initial.fogOpacityPlayers,
    fogColor: initial.fogColor,
  });
  const [status, setStatus] = useState<SaveStatus>("saved");
  // The drawing as on screen and as last saved, read by saves that outlive
  // the render that started them.
  const local = useRef<Drawing>(shown);
  const saved = useRef<Saved>({
    ops: initial.ops,
    fogOpacityPlayers: initial.fogOpacityPlayers,
    fogColor: initial.fogColor,
    revision: initial.revision,
  });
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const open = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show(next: Drawing) {
    local.current = next;
    setShown(next);
  }

  function isDirty() {
    const { keep, append } = pendingChange(saved.current.ops, local.current.ops);
    return (
      keep < saved.current.ops.length ||
      append.length > 0 ||
      local.current.fogOpacityPlayers !== saved.current.fogOpacityPlayers ||
      local.current.fogColor !== saved.current.fogColor
    );
  }

  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, REFRESH_DELAY_MS);
  }

  // Asked again while the copy is behind, for as long as the annotator is
  // open: a render that let its claim go short of the drawing is caught up.
  function refresh() {
    sa_refreshPlayersCopy(idAttachment)
      .then((result) => {
        if (result.behind && open.current) scheduleRefresh();
      })
      .catch(() => {});
  }

  async function reload() {
    const fresh = await sa_getAnnotation(idAttachment).catch(() => null);
    if (!fresh) {
      setStatus("unsaved");
      return;
    }
    saved.current = {
      ops: fresh.ops,
      fogOpacityPlayers: fresh.fogOpacityPlayers,
      fogColor: fresh.fogColor,
      revision: fresh.revision,
    };
    show({ ops: fresh.ops, fogOpacityPlayers: fresh.fogOpacityPlayers, fogColor: fresh.fogColor });
    setStatus("saved");
  }

  async function saveOnce() {
    if (!isDirty()) {
      setStatus("saved");
      return;
    }
    const sent = local.current;
    const { keep, append } = pendingChange(saved.current.ops, sent.ops);
    const chunk = aSavesWorth(append);
    const fogChanged = sent.fogOpacityPlayers !== saved.current.fogOpacityPlayers;
    const colorChanged = sent.fogColor !== saved.current.fogColor;
    setStatus("saving");
    let result: Awaited<ReturnType<typeof sa_saveAnnotation>>;
    try {
      result = await sa_saveAnnotation(idAttachment, {
        baseRevision: saved.current.revision,
        keep,
        append: chunk,
        ...(fogChanged ? { fogOpacityPlayers: sent.fogOpacityPlayers } : {}),
        ...(colorChanged ? { fogColor: sent.fogColor } : {}),
      });
    } catch {
      toaster.create({ title: "The drawing could not be saved. Try again.", type: "error" });
      setStatus("unsaved");
      return;
    }
    if (result.ok) {
      saved.current = {
        ops: sent.ops.slice(0, keep + chunk.length),
        fogOpacityPlayers: sent.fogOpacityPlayers,
        fogColor: sent.fogColor,
        revision: result.revision,
      };
      // The rest of a backlog goes next, without waiting for a change.
      if (chunk.length < append.length) again.current = true;
      setStatus(isDirty() ? "unsaved" : "saved");
      scheduleRefresh();
      return;
    }
    toaster.create({ title: result.error, type: "error" });
    if (result.stale) await reload();
    else setStatus("unsaved");
  }

  // One save at a time: asked for while one is out, it is made once that one
  // is back, so it builds on the revision that one made.
  function save(): Promise<void> {
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const run = (async () => {
      do {
        again.current = false;
        await saveOnce();
      } while (again.current);
    })();
    inFlight.current = run.finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }

  function scheduleSave() {
    setStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  // As it opens, the players' copy is asked for once, for a render a closed
  // annotator left behind. As it closes (the dialog shut, or the page left)
  // whatever was waiting is saved at once, then the copy asked for once more,
  // and whoever opened it told it has been left.
  useEffect(() => {
    open.current = true;
    refresh();
    // The holder of the latest onLeave, read as it is left, not as it opened.
    const leaving = onLeave;
    return () => {
      open.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      const left = () => {
        refresh();
        leaving.current?.();
      };
      if (isDirty() || inFlight.current) void save().finally(left);
      else left();
    };
    // Once per annotator: the picture does not change under an open one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...shown,
    status,
    canUndo: shown.ops.length > 0,
    draw(op) {
      show({ ...local.current, ops: [...local.current.ops, op] });
      scheduleSave();
    },
    undo() {
      if (local.current.ops.length === 0) return;
      show({ ...local.current, ops: local.current.ops.slice(0, -1) });
      scheduleSave();
    },
    setFogOpacityPlayers(value) {
      show({ ...local.current, fogOpacityPlayers: value });
      scheduleSave();
    },
    setFogColor(color) {
      show({ ...local.current, fogColor: color });
      scheduleSave();
    },
  };
}
