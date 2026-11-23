"use client";

import { useRef, useState } from "react";
import { closeWall, placeCorner, type Snap, type WallDraft } from "@/lib/fog-walls";

type WallDraftControls = {
  /** The wall being drawn, or null when none is. */
  draft: WallDraft | null;
  /** A click with the wall pen, snapped: the next corner, or the click that finishes the wall. */
  place: (snap: Snap) => void;
  /** Finishes the wall as Escape does; whether there was one being drawn. */
  finish: () => boolean;
  /** Takes back the wall's last corner; whether there was one being drawn. */
  undo: () => boolean;
};

/**
 * The wall the wall pen is drawing, corner by corner, until it is finished
 * and handed to `onWall` as the wall's points. `walls` are the standing
 * walls' points, without the one being drawn; a click is snapped onto them
 * and Escape's closing line stops at them, inside the picture of `width` by
 * `height`.
 *
 * A wall finished with too few corners to close (`closeWall` gives null) is
 * dropped, and so is one whose last corner Undo takes back. The draft is
 * kept in a ref beside the state, written as it changes, so a key handler
 * or a second click before the next render reads it as it stands rather
 * than as the last render saw it.
 */
export function useWallDraft(
  walls: readonly (readonly number[])[],
  width: number,
  height: number,
  onWall: (points: number[]) => void,
): WallDraftControls {
  const [draft, setDraft] = useState<WallDraft | null>(null);
  const current = useRef<WallDraft | null>(null);

  function set(next: WallDraft | null) {
    current.current = next;
    setDraft(next);
  }

  return {
    draft,
    place(snap) {
      const { draft: next, wall } = placeCorner(current.current, snap, walls, width, height);
      set(next);
      if (wall) onWall(wall);
    },
    finish() {
      const finished = current.current;
      if (!finished) return false;
      set(null);
      const wall = closeWall(finished, walls, width, height);
      if (wall) onWall(wall);
      return true;
    },
    undo() {
      const drawn = current.current;
      if (!drawn) return false;
      set(drawn.points.length > 2 ? { ...drawn, points: drawn.points.slice(0, -2) } : null);
      return true;
    },
  };
}
