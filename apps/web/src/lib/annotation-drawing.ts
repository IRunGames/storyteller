import { isMark, type AnnotationOp, type ShapeKind } from "./annotation-schemas";
import { FOG_COLOR } from "./annotations";

// How an annotated picture's drawing is drawn, once, for both places it is
// seen: the storyteller's annotator lays it over the picture as React SVG
// (components/annotations/annotation-overlay.tsx), and the server lays it
// over the picture as SVG text to render the players' copy
// (lib/annotation-render.ts). Both read the same tree from here, so what the
// storyteller draws is what the players are shown, but for the fog's opacity.
//
// The tree is, from the bottom up: the annotations (pen marks and shapes,
// less those an eraser took away), then the fog, a rectangle over the whole
// picture seen through a mask. The mask starts white, the fog
// showing everywhere, or black after a Clear all; each Reveal paints black on
// it and each Cover white, in the order they were made, so a later step
// wins where two overlap. The annotations are under the fog, so a mark in
// the fog is the players' only once it is revealed.

/**
 * One SVG element: its tag, its attributes as SVG names them, and what it
 * holds. The drawing's frame (the pen layer, the mask, the fog) carries a
 * key naming its part, which React draws it by: it is built afresh each
 * time, unlike a step's shape, and must still be found again in place.
 */
export type SvgNode = {
  tag: string;
  attrs: Record<string, string | number>;
  children?: SvgNode[];
  key?: string;
};

type TreeOptions = {
  /** The picture's size in its own pixels, which the steps are drawn in. */
  width: number;
  height: number;
  /** The size the drawing is shown at, the picture's own when left out. */
  outWidth?: number;
  outHeight?: number;
  /** How thick the fog is, a whole percentage; at 0 it is left out. */
  fogOpacity: number;
  /** The fog's color, the drawing's own; the slate when left out. */
  fogColor?: string;
  /** The mask's id, unique on the page the tree is drawn into. */
  maskId: string;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * A stroke's points as path data, smoothed by curving through the midpoint
 * between each pair of points, so a stroke drawn from a mouse's few samples
 * reads as a line drawn by hand rather than a chain of corners.
 */
export function strokePath(points: readonly number[]): string {
  const n = points.length / 2;
  const at = (i: number) => `${round1(points[i * 2])} ${round1(points[i * 2 + 1])}`;
  const mid = (i: number) =>
    `${round1((points[i * 2] + points[i * 2 + 2]) / 2)} ${round1((points[i * 2 + 1] + points[i * 2 + 3]) / 2)}`;
  let d = `M${at(0)}`;
  for (let i = 1; i < n - 1; i++) d += `Q${at(i)} ${mid(i)}`;
  if (n > 1) d += `L${at(n - 1)}`;
  return d;
}

// A step's shape depends on the step alone, and a step is never changed once
// made, so each is built once and kept for as long as the step is: a long
// drawing redrawn as a stroke is made then costs little more than its new
// stroke.
const shapes = new WeakMap<AnnotationOp, SvgNode>();

// One stroke of a given width and paint: a round-ended path, or a dot when
// it is a single point, which a path of no length would not draw everywhere.
function stroke(points: readonly number[], width: number, paint: string): SvgNode {
  if (points.length === 2) {
    return { tag: "circle", attrs: { cx: points[0], cy: points[1], r: width / 2, fill: paint } };
  }
  return {
    tag: "path",
    attrs: {
      d: strokePath(points),
      fill: "none",
      stroke: paint,
      "stroke-width": width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
  };
}

const SIDES: Record<Exclude<ShapeKind, "circle">, number> = {
  triangle: 3,
  square: 4,
  pentagon: 5,
  hexagon: 6,
};

/** Which way a shape is turned when it does not say: a corner straight up. */
export const UPRIGHT = -90;

/**
 * A regular shape's corners, flat as x then y, on the circle of radius `r`
 * round its centre: the first `angle` degrees round from pointing right
 * (towards down, as the picture's y runs), where the drag ended, the rest
 * evenly after it. Rounded to a tenth, as a stroke's points are.
 */
export function shapePoints(
  kind: Exclude<ShapeKind, "circle">,
  cx: number,
  cy: number,
  r: number,
  angle: number = UPRIGHT,
): number[] {
  const n = SIDES[kind];
  const first = (angle * Math.PI) / 180;
  const points: number[] = [];
  for (let i = 0; i < n; i++) {
    const at = first + (2 * Math.PI * i) / n;
    points.push(round1(cx + r * Math.cos(at)), round1(cy + r * Math.sin(at)));
  }
  return points;
}

function shapeOf(op: AnnotationOp): SvgNode | null {
  const known = shapes.get(op);
  if (known) return known;
  let shape: SvgNode | null = null;
  switch (op.t) {
    case "pen":
      shape = stroke(op.points, op.width, op.color);
      break;
    case "shape": {
      const paint = { fill: "none", stroke: op.color, "stroke-width": op.width };
      if (op.shape === "circle") {
        shape = { tag: "circle", attrs: { cx: op.cx, cy: op.cy, r: op.r, ...paint } };
      } else {
        const corners = shapePoints(op.shape, op.cx, op.cy, op.r, op.angle);
        const points = [];
        for (let i = 0; i < corners.length; i += 2) points.push(`${corners[i]},${corners[i + 1]}`);
        shape = {
          tag: "polygon",
          attrs: { points: points.join(" "), ...paint, "stroke-linejoin": "round" },
        };
      }
      break;
    }
    case "brush":
      shape = stroke(op.points, op.radius * 2, op.mode === "reveal" ? "black" : "white");
      break;
    case "rect":
      shape = {
        tag: "rect",
        attrs: {
          x: op.x,
          y: op.y,
          width: op.w,
          height: op.h,
          fill: op.mode === "reveal" ? "black" : "white",
        },
      };
      break;
  }
  if (shape) shapes.set(op, shape);
  return shape;
}

/**
 * The places of the annotations that show: the pen marks and shapes after
 * the last Erase all annotations, less those an eraser took away.
 */
function shownMarks(ops: readonly AnnotationOp[]): number[] {
  let from = 0;
  const erased = new Set<number>();
  ops.forEach((op, i) => {
    if (op.t === "penClear") from = i + 1;
    else if (op.t === "erase") for (const target of op.targets) erased.add(target);
  });
  const shown: number[] = [];
  for (let i = from; i < ops.length; i++) if (isMark(ops[i]) && !erased.has(i)) shown.push(i);
  return shown;
}

/** The drawing as a tree of SVG elements, ready to be written out or drawn by React. */
export function annotationTree(ops: readonly AnnotationOp[], options: TreeOptions): SvgNode {
  const { width, height, fogOpacity, maskId } = options;

  // Only the fog steps after the last reset count: a Cover all or Clear all
  // starts the fog afresh.
  let fogFrom = 0;
  let fogStartsClear = false;
  ops.forEach((op, i) => {
    if (op.t === "fogAll") {
      fogFrom = i + 1;
      fogStartsClear = op.mode === "reveal";
    }
  });

  const penMarks = shownMarks(ops).map((i) => shapeOf(ops[i])!);
  const fogShapes: SvgNode[] = [];
  ops.forEach((op, i) => {
    if ((op.t === "brush" || op.t === "rect") && i >= fogFrom) fogShapes.push(shapeOf(op)!);
  });

  const children: SvgNode[] = [
    { tag: "g", key: "pen", attrs: { "data-layer": "pen" }, children: penMarks },
  ];
  if (fogOpacity > 0) {
    children.push(
      {
        tag: "defs",
        key: "defs",
        attrs: {},
        children: [
          {
            tag: "mask",
            key: "mask",
            attrs: { id: maskId, maskUnits: "userSpaceOnUse", x: 0, y: 0, width, height },
            children: [
              {
                tag: "rect",
                key: "base",
                attrs: { x: 0, y: 0, width, height, fill: fogStartsClear ? "black" : "white" },
              },
              ...fogShapes,
            ],
          },
        ],
      },
      {
        tag: "rect",
        key: "fog",
        attrs: {
          "data-layer": "fog",
          x: 0,
          y: 0,
          width,
          height,
          fill: options.fogColor ?? FOG_COLOR,
          "fill-opacity": fogOpacity / 100,
          mask: `url(#${maskId})`,
        },
      },
    );
  }

  return {
    tag: "svg",
    attrs: {
      xmlns: "http://www.w3.org/2000/svg",
      width: options.outWidth ?? width,
      height: options.outHeight ?? height,
      viewBox: `0 0 ${width} ${height}`,
    },
    children,
  };
}

// How far a point is from the segment between two others.
function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// How far a point is from a run of corners, joined in order, and round to
// the first again when `closed`.
function toLine(x: number, y: number, points: readonly number[], closed: boolean): number {
  if (points.length === 2) return Math.hypot(x - points[0], y - points[1]);
  let nearest = Infinity;
  const end = closed ? points.length : points.length - 2;
  for (let i = 0; i < end; i += 2) {
    const j = (i + 2) % points.length;
    nearest = Math.min(
      nearest,
      toSegment(x, y, points[i], points[i + 1], points[j], points[j + 1]),
    );
  }
  return nearest;
}

/**
 * The places of the annotations that show at a point, within `tolerance`
 * of their stroke: what the eraser takes away where it passes. A shape is
 * touched on its outline, not inside it, as it is drawn.
 */
export function marksAt(
  ops: readonly AnnotationOp[],
  x: number,
  y: number,
  tolerance: number,
): number[] {
  return shownMarks(ops).filter((i) => {
    const op = ops[i];
    if (op.t === "pen") return toLine(x, y, op.points, false) <= op.width / 2 + tolerance;
    if (op.t !== "shape") return false;
    const reach = op.width / 2 + tolerance;
    if (op.shape === "circle") return Math.abs(Math.hypot(x - op.cx, y - op.cy) - op.r) <= reach;
    return toLine(x, y, shapePoints(op.shape, op.cx, op.cy, op.r, op.angle), true) <= reach;
  });
}

const escapeAttr = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** The tree as SVG text, as the server hands it to sharp. */
export function toSvgString(node: SvgNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join("");
  if (!node.children || node.children.length === 0) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map(toSvgString).join("")}</${node.tag}>`;
}
