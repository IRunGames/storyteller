"use client";

import { createElement, useId, useMemo, useState, type ReactElement } from "react";
import type { AnnotationOp, WallOp } from "@/lib/annotation-schemas";
import { annotationTree, type SvgNode } from "@/lib/annotation-drawing";
import { storytellerView, type StorytellerView } from "@/lib/fog-areas";
import { standingWalls } from "@/lib/fog-walls";

type Props = {
  /** The drawing's saved steps, and any made since that are not saved yet. */
  ops: readonly AnnotationOp[];
  /** The step being made under the pointer, drawn after the rest. */
  pending?: AnnotationOp | null;
  /** The picture's size in its own pixels, which the steps are in. */
  width: number;
  height: number;
  /** How thick the fog is drawn here, a whole percentage. */
  fogOpacity: number;
  /** The fog's color, the drawing's own; the slate when left out. */
  fogColor?: string;
};

// SVG names its attributes with hyphens and React with camelCase; the tree
// keeps SVG's, which the server writes out as they are, and they are turned
// here. A data- attribute keeps its hyphens in React too.
const reactName = (name: string) =>
  name.startsWith("data-") ? name : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

// Each shape's element is made once: the tree hands back the same node for a
// step every time it is drawn (lib/annotation-drawing.ts), so a long drawing
// redrawn under a moving pointer reuses all but its newest shape, and React
// finds them unchanged. A shape's key is given once per node for the same
// reason, since an index would shift as a Cover all leaves the steps before
// it out; the frame round the shapes, built afresh each time, is keyed by
// the part it is (node.key), so React keeps its elements too.
const elements = new WeakMap<SvgNode, ReactElement>();
const keys = new WeakMap<SvgNode, string>();
let nextKey = 0;

function keyOf(node: SvgNode): string {
  let key = keys.get(node);
  if (!key) {
    key = `n${nextKey++}`;
    keys.set(node, key);
  }
  return key;
}

function toReact(node: SvgNode): ReactElement {
  const known = elements.get(node);
  if (known) return known;
  const props: Record<string, string | number> = { key: node.key ?? keyOf(node) };
  for (const [name, value] of Object.entries(node.attrs)) props[reactName(name)] = value;
  const element = createElement(node.tag, props, ...(node.children ?? []).map(toReact));
  // Only a shape is kept: a layer holds a list that changes with the drawing.
  if (!node.children) elements.set(node, element);
  return element;
}

const NO_WALLS: StorytellerView = { walls: [], enclosed: [] };

// The view of a drawing whose standing walls are `walls`. A drawing with no
// walls has nothing to work out, and skips the grid.
const viewOf = (
  steps: readonly AnnotationOp[],
  walls: readonly WallOp[],
  width: number,
  height: number,
) => (walls.length === 0 ? NO_WALLS : storytellerView(steps, width, height));

/**
 * The walls of a drawing and the areas they enclose, worked out again only
 * when a wall comes or goes. Working them out fills a grid across the whole
 * picture, tens of milliseconds on a large map, which a redraw on every
 * pointer move while a stroke is made cannot afford. The last standing walls
 * and their view are kept, the walls compared step by step by identity, since
 * a step is never changed once made. They are kept in state, set during the
 * render that finds them changed, rather than in a ref: a ref may not be read
 * or written while rendering (the react-hooks/refs lint rule).
 */
function useStorytellerView(
  steps: readonly AnnotationOp[],
  width: number,
  height: number,
): StorytellerView {
  const walls = standingWalls(steps).map((wall) => wall.op);
  const [known, setKnown] = useState(() => ({
    walls,
    width,
    height,
    view: viewOf(steps, walls, width, height),
  }));
  const same =
    known.width === width &&
    known.height === height &&
    known.walls.length === walls.length &&
    known.walls.every((op, i) => op === walls[i]);
  if (same) return known.view;
  const view = viewOf(steps, walls, width, height);
  setKnown({ walls, width, height, view });
  return view;
}

/**
 * The storyteller's view of an annotated picture's drawing, laid over the
 * picture at its size: the pen marks, then the fog at the storyteller's own
 * opacity, in the walls' blue over the areas they enclose, then the fog
 * walls, which are the storyteller's alone and drawn whether the fog is shown
 * or not. The players' copy is rendered on the server from the same tree
 * (lib/annotation-render.ts), without the walls. Draws nothing itself to
 * point at; the annotator's stage takes the pointer.
 */
export function AnnotationOverlay({ ops, pending, width, height, fogOpacity, fogColor }: Props) {
  // useId's colons are not safe in url(#…), so only its letters and digits are kept.
  const maskId = `fog-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const steps = useMemo(() => (pending ? [...ops, pending] : ops), [ops, pending]);
  // With the step under the pointer on the end, so a wall eraser's drag
  // hides each wall it takes as it goes.
  const storyteller = useStorytellerView(steps, width, height);
  const tree = useMemo(
    () => annotationTree(steps, { width, height, fogOpacity, fogColor, maskId, storyteller }),
    [steps, width, height, fogOpacity, fogColor, maskId, storyteller],
  );
  // The root fills the box the picture fills, whatever size it is shown at;
  // the viewBox keeps the steps in the picture's own pixels.
  return createElement(
    "svg",
    {
      xmlns: tree.attrs.xmlns,
      viewBox: tree.attrs.viewBox,
      width: "100%",
      height: "100%",
      style: { position: "absolute", inset: 0, pointerEvents: "none" },
      "aria-hidden": true,
    },
    ...(tree.children ?? []).map(toReact),
  );
}
