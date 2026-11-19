"use client";

import { createElement, useId, useMemo, type ReactElement } from "react";
import type { AnnotationOp } from "@/lib/annotation-schemas";
import { annotationTree, type SvgNode } from "@/lib/annotation-drawing";

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

/**
 * The storyteller's view of an annotated picture's drawing, laid over the
 * picture at its size: the pen marks, then the fog at the storyteller's own
 * opacity. The players' copy is rendered on the server from the same tree
 * (lib/annotation-render.ts). Draws nothing itself to point at; the
 * annotator's stage takes the pointer.
 */
export function AnnotationOverlay({ ops, pending, width, height, fogOpacity, fogColor }: Props) {
  // useId's colons are not safe in url(#…), so only its letters and digits are kept.
  const maskId = `fog-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const tree = useMemo(
    () =>
      annotationTree(pending ? [...ops, pending] : ops, {
        width,
        height,
        fogOpacity,
        fogColor,
        maskId,
      }),
    [ops, pending, width, height, fogOpacity, fogColor, maskId],
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
