"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Box, Image } from "@chakra-ui/react";
import { marksAt } from "@/lib/annotation-drawing";
import {
  MAX_ERASE_TARGETS,
  MAX_STROKE_POINTS,
  type AnnotationMode,
  type AnnotationOp,
  type ShapeKind,
} from "@/lib/annotation-schemas";
import { WALL_OPEN } from "@/lib/annotations";
import { floodAt } from "@/lib/fog-areas";
import { snapPoint, standingWalls, wallsAt, type Snap, type WallDraft } from "@/lib/fog-walls";
import { AnnotationOverlay } from "./annotation-overlay";

/**
 * What a press on the picture makes: a pen mark, a shape, the eraser's
 * drag over the annotations, a fog brush stroke, a fog rectangle, a flood,
 * a wall's corner, or the wall eraser's drag over the walls.
 */
export type AnnotationTool =
  "pen" | "shape" | "eraser" | "brush" | "rect" | "flood" | "wall" | "wallEraser";

/** How far the eraser reaches round the pointer, in the screen's pixels, whatever the zoom. */
export const ERASER_REACH_PX = 10;

/**
 * How far a wall pen's click snaps onto what is near it, in the screen's
 * pixels, whatever the zoom.
 */
export const SNAP_REACH_PX = 10;

// The ring round the point a wall pen's click would snap to, in the screen's pixels.
const SNAP_RING_PX = 5;

// The wall being drawn is drawn as an open wall is in the drawing (wallOf in
// lib/annotation-drawing.ts): an outline, then the line over it, both in the
// screen's pixels.
const DRAFT_STROKES = [
  { paint: WALL_OPEN.outline, width: WALL_OPEN.width + 2 },
  { paint: WALL_OPEN.color, width: WALL_OPEN.width },
];

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
  /** The wall the wall pen is drawing, drawn over the picture while the pen is in hand. */
  wallDraft?: WallDraft | null;
  /** A click with the wall pen, snapped onto what it landed near. */
  onWallCorner?: (snap: Snap) => void;
};

type Point = { x: number; y: number };

type EraseOp = Extract<AnnotationOp, { t: "erase" | "wallErase" }>;
type StrokeOp = Extract<AnnotationOp, { t: "brush" | "pen" }>;

/** What an eraser's drag gathers at a point: the steps it takes away there. */
type Finder = (ops: readonly AnnotationOp[], x: number, y: number, tolerance: number) => number[];

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
 * The wall eraser does the same with the walls, and never takes a mark.
 * While Shift is held, a pen stroke runs straight from where Shift went down
 * to the pointer; letting Shift go carries the stroke on freehand from the
 * run's end, and pressing it again starts another run.
 *
 * The flood and the wall pen act on a click instead: a press let go with no
 * second pointer coming down meanwhile, taken where it was let go. The flood
 * reveals or covers the area between the walls that the click is in, and a
 * click on a wall does nothing. The wall pen hands the annotator the click's
 * point, snapped onto the map's edge, a wall or a corner within a few of the
 * screen's pixels, and the annotator keeps the wall being drawn. While the
 * wall pen is in hand, that wall is shown with a line from its last corner
 * to where the pointer would land, and a ring there when that snaps.
 *
 * The stage fills the dialog's scroll area, the picture centered in a padded
 * area of the muted background. Only the wall pen acts in that area round
 * the picture: a click there lands on the nearest point of the picture's
 * edge, past a corner on the corner, and the line to where the pointer would
 * land follows it there, until the pointer leaves the area too. Every other
 * tool ignores a press there, and its ring stays over the picture.
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
  wallDraft = null,
  onWallCorner,
}: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const start = useRef<Point | null>(null);
  const making = useRef<AnnotationOp | null>(null);
  // Where the eraser last was, so a fast drag is swept between its samples.
  const lastErased = useRef<Point | null>(null);
  // The pointer the stroke is being made with; every other pointer is ignored.
  const active = useRef<number | null>(null);
  // Whether the pen's stroke is in a straight run, Shift held.
  const straight = useRef(false);
  const [pending, setPending] = useState<AnnotationOp | null>(null);
  // Where the pointer is over the picture (with the wall pen, also round it,
  // held to the edge), and how many of the picture's pixels one of the
  // screen's is there, which the reaches are counted in.
  const [hover, setHover] = useState<(Point & { scale: number }) | null>(null);
  // The standing walls, which a flood stops at and a wall pen's click snaps onto.
  const walls = useMemo(() => standingWalls(ops).map((wall) => wall.op.points), [ops]);
  // The flood and the wall pen act on a click rather than on a drag.
  const clicks = tool === "flood" || tool === "wall";

  // Whether an event is the picture's: one over it, or one captured to it by
  // a stroke under way, rather than one in the area round it.
  function onPicture(event: PointerEvent<HTMLDivElement>): boolean {
    return surface.current!.contains(event.target as Node);
  }

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

  // How many of the picture's pixels one of the screen's is, at the size it is shown now.
  function scale(): number {
    const box = surface.current!.getBoundingClientRect();
    return width / box.width;
  }

  // An eraser's drag with the steps `find` gives under a point added, swept
  // from where it last was in steps short of its reach, so a quick drag over
  // a thin mark or wall still takes it.
  function erase<T extends EraseOp>(op: T, point: Point, find: Finder): T {
    const radius = ERASER_REACH_PX * scale();
    const from = lastErased.current ?? point;
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / radius));
    const targets = new Set(op.targets);
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((point.x - from.x) * i) / steps;
      const y = from.y + ((point.y - from.y) * i) / steps;
      for (const target of find(ops, x, y, radius)) targets.add(target);
    }
    lastErased.current = point;
    if (targets.size === op.targets.length || targets.size > MAX_ERASE_TARGETS) return op;
    return { ...op, targets: [...targets].sort((a, b) => a - b) };
  }

  // Where a wall pen's click at a point lands: snapped onto the map's edge, a
  // wall, or a corner within reach, else the point itself.
  function snap(point: Point, pictureScale: number): Snap {
    const reach = SNAP_REACH_PX * pictureScale;
    return snapPoint(point.x, point.y, reach, walls, wallDraft, width, height);
  }

  // A click with the flood or the wall pen, where it was let go.
  function click(point: Point) {
    if (tool === "wall") {
      onWallCorner?.(snap(point, scale()));
      return;
    }
    const rings = floodAt(walls, width, height, point.x, point.y);
    if (rings) onDraw({ t: "flood", mode, rings });
  }

  // The flood and the wall pen make nothing while held: they act on the click.
  function begin(point: Point): AnnotationOp | null {
    if (clicks) return null;
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
      return erase({ t: "erase", targets: [] }, point, marksAt);
    }
    if (tool === "wallEraser") {
      lastErased.current = null;
      return erase({ t: "wallErase", targets: [] }, point, wallsAt);
    }
    if (tool === "brush")
      return { t: "brush", mode, radius: brushRadius, points: [point.x, point.y] };
    return { t: "rect", mode, x: point.x, y: point.y, w: 0, h: 0 };
  }

  // A rectangle or a shape of no size, a press that did not drag, is no
  // step, nor an eraser that touched nothing. A press of the flood or the
  // wall pen is a click, unless a second pointer coming down dropped it,
  // which leaves no start.
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== active.current) return;
    const op = making.current;
    const empty =
      (op?.t === "rect" && (op.w <= 0 || op.h <= 0)) ||
      (op?.t === "shape" && op.r <= 0) ||
      ((op?.t === "erase" || op?.t === "wallErase") && op.targets.length === 0);
    if (op && !empty) onDraw(op);
    else if (clicks && start.current) click(pointOf(event));
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

  // The stroke with points added at its end. One that would pass the most
  // points a step may hold is finished as it is, and the next begun where it
  // ended.
  function add<T extends StrokeOp>(op: T, added: number[]): T {
    const { points } = op;
    if (points.length + added.length > MAX_STROKE_POINTS * 2) {
      onDraw(op);
      return { ...op, points: [points[points.length - 2], points[points.length - 1], ...added] };
    }
    return { ...op, points: [...points, ...added] };
  }

  // A pen stroke with Shift down, or let go, at a point. A run starts from the
  // stroke's last point and ends at the pointer, each given twice by the time
  // the run is over: a point given twice is a corner the stroke's smoothing
  // (strokePath in lib/annotation-drawing.ts) cannot curve, so the run is
  // drawn straight. While Shift is held the run's end follows the pointer.
  function straighten(op: StrokeOp, point: Point, shift: boolean): StrokeOp {
    const { points } = op;
    const lastX = points[points.length - 2];
    const lastY = points[points.length - 1];
    if (!straight.current) {
      straight.current = true;
      return add(op, [lastX, lastY, point.x, point.y]);
    }
    if (shift) return { ...op, points: [...points.slice(0, -2), point.x, point.y] };
    straight.current = false;
    return add(op, [lastX, lastY]);
  }

  function extend(op: AnnotationOp, point: Point, shift: boolean): AnnotationOp {
    if (op.t === "erase") return erase(op, point, marksAt);
    if (op.t === "wallErase") return erase(op, point, wallsAt);
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
    if (op.t === "pen" && (shift || straight.current)) {
      op = straighten(op, point, shift);
      // Shift still held: the run's end is where the pointer is, and no
      // freehand point follows it.
      if (straight.current) return op;
    }
    const { points } = op;
    const step = Math.max(1, (op.t === "pen" ? op.width : op.radius) * 0.2);
    const dx = point.x - points[points.length - 2];
    const dy = point.y - points[points.length - 1];
    if (dx * dx + dy * dy < step * step) return op;
    return add(op, [point.x, point.y]);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Only the wall pen acts in the area round the picture.
    if (tool !== "wall" && !onPicture(event)) return;
    event.preventDefault();
    // A second pointer while a stroke is held: a pinch, or a palm beside a
    // stylus. The stroke is dropped, and nothing is drawn until the first
    // pointer is let go.
    if (active.current !== null) {
      abandon();
      return;
    }
    active.current = event.pointerId;
    // Held by the picture, so a stroke that leaves it still ends when the
    // button is let go, and its moves stay the picture's wherever they go;
    // not every browser (nor the tests' DOM) offers it.
    surface.current!.setPointerCapture?.(event.pointerId);
    const point = pointOf(event);
    start.current = point;
    straight.current = false;
    update(begin(point));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = pointOf(event);
    // Off the picture, only the wall pen shows where the pointer is: the
    // brush's and the erasers' rings stay over the picture.
    setHover(tool === "wall" || onPicture(event) ? { ...point, scale: scale() } : null);
    let op = making.current;
    if (!op || event.pointerId !== active.current) return;
    const native = event.nativeEvent;
    const samples = native.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length > 0 ? samples : [native]) {
      op = extend(op, pointOf(sample), sample.shiftKey);
    }
    update(op);
  }

  // The brush and both erasers show their reach as a ring in place of the cursor.
  const ringed = tool === "brush" || tool === "eraser" || tool === "wallEraser";
  // Where the wall pen would land if clicked here, with the ring that marks
  // it, and the wall being drawn with a line on to it, while the wall pen is
  // in hand.
  const landing =
    tool === "wall" && hover
      ? { ...snap(hover, hover.scale), ring: SNAP_RING_PX * hover.scale }
      : null;
  const draftLine =
    tool === "wall"
      ? [...(wallDraft?.points ?? []), ...(landing && wallDraft ? [landing.x, landing.y] : [])]
      : [];

  // The area round the picture fills the dialog's scroll area, so the pointer
  // is the stage's anywhere in it: the picture's events reach the handlers
  // through it, and its own are taken by the wall pen alone.
  return (
    <Box
      flexGrow="1"
      p="4"
      bg="bg.muted"
      cursor={tool === "wall" ? "crosshair" : undefined}
      // The wall pen's presses here are clicks, not a touch screen's scroll.
      touchAction={tool === "wall" ? "none" : undefined}
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
        cursor={ringed ? "none" : "crosshair"}
        // The wall pen still lands on the edge from the area round the
        // picture, so its preview stays until the pointer leaves that too.
        onPointerLeave={() => {
          if (tool !== "wall") setHover(null);
        }}
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
        {/* The wall being drawn, over the drawing as the walls in it are. */}
        {tool === "wall" && (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            data-layer="wall-draft"
            aria-hidden
          >
            {draftLine.length > 0 &&
              DRAFT_STROKES.map(({ paint, width: strokeWidth }) => (
                <path
                  key={paint}
                  d={wallPath(draftLine)}
                  fill="none"
                  stroke={paint}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            {landing?.on &&
              DRAFT_STROKES.map(({ paint, width: strokeWidth }) => (
                <circle
                  key={paint}
                  cx={landing.x}
                  cy={landing.y}
                  r={landing.ring}
                  fill="none"
                  stroke={paint}
                  strokeWidth={strokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </svg>
        )}
        {/* The brush's or an eraser's reach, in place of the cursor: a ring
          at its size, drawn light over dark so it shows on fog and picture
          alike. */}
        {ringed && hover && (
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
              r={tool === "brush" ? brushRadius : ERASER_REACH_PX * hover.scale}
              fill="none"
              stroke="black"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={hover.x}
              cy={hover.y}
              r={tool === "brush" ? brushRadius : ERASER_REACH_PX * hover.scale}
              fill="none"
              stroke="white"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </Box>
    </Box>
  );
}

// A run of corners as straight lines. A lone corner, the wall's first before
// the pointer is over the picture (on a touch screen, say), is given twice: a
// path of one point draws nothing, while a line of no length draws its round
// ends, a dot.
function wallPath(points: readonly number[]): string {
  const corners = points.length === 2 ? [...points, ...points] : points;
  let d = "";
  for (let i = 0; i < corners.length; i += 2)
    d += `${i === 0 ? "M" : "L"}${corners[i]} ${corners[i + 1]}`;
  return d;
}
