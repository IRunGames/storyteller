"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Box, Image } from "@chakra-ui/react";
import { marksAt } from "@/lib/annotation-drawing";
import {
  MAX_ERASE_TARGETS,
  MAX_STROKE_POINTS,
  type AnnotationMode,
  type AnnotationOp,
  type ShapeKind,
} from "@/lib/annotation-schemas";
import { AnnotationOverlay } from "./annotation-overlay";

/**
 * What a press on the picture makes: a pen mark, a shape, the eraser's
 * drag over the annotations, a fog brush stroke, or a fog rectangle.
 */
export type AnnotationTool = "pen" | "shape" | "eraser" | "brush" | "rect";

/** How far the eraser reaches round the pointer, in the screen's pixels, whatever the zoom. */
export const ERASER_REACH_PX = 10;

type Props = {
  imageUrl: string;
  /** What is pictured, for the picture's alternative text. */
  label: string;
  /** The picture's size in its own pixels, which every step is drawn in. */
  width: number;
  height: number;
  /** The drawing as it stands. */
  ops: readonly AnnotationOp[];
  /** How thick the storyteller's own fog is drawn, a whole percentage; 0 hides it. */
  fogOpacity: number;
  /** The fog's color, the drawing's own. */
  fogColor?: string;
  tool: AnnotationTool;
  /** Which shape the shape tool draws. */
  shape?: ShapeKind;
  /** Whether a fog tool reveals or covers. */
  mode: AnnotationMode;
  /** The brush's radius and the pen's width, in the picture's pixels; shapes take the pen's. */
  brushRadius: number;
  penWidth: number;
  penColor: string;
  /** A step finished: the pointer let go. */
  onDraw: (op: AnnotationOp) => void;
};

type Point = { x: number; y: number };

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

/**
 * The picture at the size the dialog allows, with the drawing over it, and
 * the surface the storyteller draws on. A press starts a step, the pointer
 * held down shapes it, drawn as it goes over the saved steps, and letting go
 * hands it to the annotator: a brush stroke or a pen mark follows the
 * pointer, a rectangle runs from where it was pressed to where it is, and a
 * shape is drawn round where it was pressed with a corner where the pointer
 * is, growing and turning as it moves. The eraser
 * gathers every annotation it passes over, hidden as it goes, and takes
 * them away in one step when it is let go; one that touched none is no step.
 *
 * Points are taken in the picture's own pixels, whatever size it is shown
 * at, rounded to a tenth, and only once the pointer has moved on a little
 * from the last, so a slow stroke is not thousands of points; a stroke that
 * reaches the most points a step may hold is finished there and the next
 * begun where it ended. A point outside the picture is held to its edge.
 * Only the pointer that began a stroke draws it: a second one coming down,
 * or the browser cancelling the stroke, drops it unsaved.
 * The browser's coalesced moves are read where it offers them, so a fast
 * stroke keeps its curve.
 */
export function AnnotatorStage({
  imageUrl,
  label,
  width,
  height,
  ops,
  fogOpacity,
  fogColor,
  tool,
  shape = "circle",
  mode,
  brushRadius,
  penWidth,
  penColor,
  onDraw,
}: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const start = useRef<Point | null>(null);
  const making = useRef<AnnotationOp | null>(null);
  // Where the eraser last was, so a fast drag is swept between its samples.
  const lastErased = useRef<Point | null>(null);
  // The pointer the stroke is being made with; every other pointer is ignored.
  const active = useRef<number | null>(null);
  const [pending, setPending] = useState<AnnotationOp | null>(null);
  // Where the pointer is over the picture, and the eraser's reach there.
  const [hover, setHover] = useState<(Point & { reach: number }) | null>(null);

  function pointOf(event: { clientX: number; clientY: number }): Point {
    const box = surface.current!.getBoundingClientRect();
    return {
      x: round1(clamp(((event.clientX - box.left) * width) / box.width, width)),
      y: round1(clamp(((event.clientY - box.top) * height) / box.height, height)),
    };
  }

  function update(op: AnnotationOp | null) {
    making.current = op;
    setPending(op);
  }

  // The eraser's reach in the picture's pixels, at the size it is shown now.
  function reach(): number {
    const box = surface.current!.getBoundingClientRect();
    return (ERASER_REACH_PX * width) / box.width;
  }

  // The eraser's drag with the annotations under a point added, swept from
  // where it last was in steps short of its reach, so a quick drag over a
  // thin mark still takes it.
  function erase(op: AnnotationOp & { t: "erase" }, point: Point): AnnotationOp {
    const radius = reach();
    const from = lastErased.current ?? point;
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / radius));
    const targets = new Set(op.targets);
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((point.x - from.x) * i) / steps;
      const y = from.y + ((point.y - from.y) * i) / steps;
      for (const target of marksAt(ops, x, y, radius)) targets.add(target);
    }
    lastErased.current = point;
    if (targets.size === op.targets.length || targets.size > MAX_ERASE_TARGETS) return op;
    return { ...op, targets: [...targets].sort((a, b) => a - b) };
  }

  function begin(point: Point): AnnotationOp {
    if (tool === "pen")
      return { t: "pen", color: penColor, width: penWidth, points: [point.x, point.y] };
    if (tool === "shape") {
      return {
        t: "shape",
        shape,
        color: penColor,
        width: penWidth,
        cx: point.x,
        cy: point.y,
        r: 0,
      };
    }
    if (tool === "eraser") {
      lastErased.current = null;
      return erase({ t: "erase", targets: [] }, point);
    }
    if (tool === "brush")
      return { t: "brush", mode, radius: brushRadius, points: [point.x, point.y] };
    return { t: "rect", mode, x: point.x, y: point.y, w: 0, h: 0 };
  }

  // A rectangle or a shape of no size, a press that did not drag, is no
  // step, nor an eraser that touched nothing.
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== active.current) return;
    const op = making.current;
    const empty =
      (op?.t === "rect" && (op.w <= 0 || op.h <= 0)) ||
      (op?.t === "shape" && op.r <= 0) ||
      (op?.t === "erase" && op.targets.length === 0);
    if (op && !empty) onDraw(op);
    active.current = null;
    start.current = null;
    update(null);
  }

  // A stroke the browser took back (a gesture, the window losing focus) or
  // spoiled by a second pointer is dropped whole, never drawn: in Reveal, a
  // stroke between two fingers would lift the fog there for the players.
  function abandon() {
    start.current = null;
    update(null);
  }

  function extend(op: AnnotationOp, point: Point): AnnotationOp {
    if (op.t === "erase") return erase(op, point);
    if (op.t === "shape") {
      // A corner follows the pointer: the shape grows and turns with it.
      const from = start.current!;
      const dx = point.x - from.x;
      const dy = point.y - from.y;
      return {
        ...op,
        r: round1(Math.hypot(dx, dy)),
        angle: round1((Math.atan2(dy, dx) * 180) / Math.PI),
      };
    }
    if (op.t === "rect") {
      const from = start.current!;
      return {
        ...op,
        x: Math.min(from.x, point.x),
        y: Math.min(from.y, point.y),
        w: round1(Math.abs(point.x - from.x)),
        h: round1(Math.abs(point.y - from.y)),
      };
    }
    if (op.t !== "brush" && op.t !== "pen") return op;
    const { points } = op;
    const step = Math.max(1, (op.t === "pen" ? op.width : op.radius) * 0.2);
    const dx = point.x - points[points.length - 2];
    const dy = point.y - points[points.length - 1];
    if (dx * dx + dy * dy < step * step) return op;
    if (points.length >= MAX_STROKE_POINTS * 2) {
      onDraw(op);
      return {
        ...op,
        points: [points[points.length - 2], points[points.length - 1], point.x, point.y],
      };
    }
    return { ...op, points: [...points, point.x, point.y] };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    // A second pointer while a stroke is held: a pinch, or a palm beside a
    // stylus. The stroke is dropped, and nothing is drawn until the first
    // pointer is let go.
    if (active.current !== null) {
      abandon();
      return;
    }
    active.current = event.pointerId;
    // Held, so a stroke that leaves the picture still ends when the button
    // is let go; not every browser (nor the tests' DOM) offers it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointOf(event);
    start.current = point;
    update(begin(point));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = pointOf(event);
    setHover({ ...point, reach: reach() });
    let op = making.current;
    if (!op || event.pointerId !== active.current) return;
    const native = event.nativeEvent;
    const samples = native.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length > 0 ? samples : [native]) op = extend(op, pointOf(sample));
    update(op);
  }

  return (
    <Box
      ref={surface}
      role="application"
      aria-label="Drawing surface"
      position="relative"
      mx="auto"
      aspectRatio={`${width} / ${height}`}
      // As wide as the dialog allows, but no taller than the room under the
      // toolbar, the width following the picture's shape.
      style={{ width: `min(100%, calc((100dvh - 10rem) * ${width / height}))` }}
      touchAction="none"
      userSelect="none"
      cursor={tool === "brush" || tool === "eraser" ? "none" : "crosshair"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={(event) => {
        if (event.pointerId !== active.current) return;
        active.current = null;
        abandon();
      }}
      onPointerLeave={() => setHover(null)}
    >
      <Image src={imageUrl} alt={label} w="full" h="full" draggable={false} display="block" />
      <AnnotationOverlay
        ops={ops}
        pending={pending}
        width={width}
        height={height}
        fogOpacity={fogOpacity}
        fogColor={fogColor}
      />
      {/* The brush's or the eraser's reach, in place of the cursor: a ring
          at its size, drawn light over dark so it shows on fog and picture
          alike. */}
      {(tool === "brush" || tool === "eraser") && hover && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          aria-hidden
        >
          <circle
            cx={hover.x}
            cy={hover.y}
            r={tool === "eraser" ? hover.reach : brushRadius}
            fill="none"
            stroke="black"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={hover.x}
            cy={hover.y}
            r={tool === "eraser" ? hover.reach : brushRadius}
            fill="none"
            stroke="white"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </Box>
  );
}
