import { MAX_WALL_POINTS, type AnnotationOp, type WallOp } from "./annotation-schemas";

// The geometry of fog walls: which walls still stand, where a click snaps,
// whether a wall is closed, and the line Escape draws to close one. No React
// and no drawing, so the flood and the annotator share it. A wall is a flat
// run of points, x then y; its "corners" are those points and its "sides" the
// segments between consecutive ones. Every `walls` parameter below is the
// walls' flat points in the order given, and results line up with it.

/** Within this many picture pixels an end touches the edge, a wall or a side. */
export const TOUCH_PX = 0.5;

/** A wall that still stands, and its place in the drawing's steps. */
export type StandingWall = { at: number; op: WallOp };

/** Where a click lands: the point, and what it landed on, if anything. */
export type Snap = { x: number; y: number; on: "first" | "touch" | null };

/** The wall being drawn: its corners so far, and whether its first one touches something. */
export type WallDraft = { points: number[]; startTouches: boolean };

type Segment = readonly [number, number, number, number];

/**
 * How far a point is from the segment between two others. It lives here, not
 * in annotation-drawing.ts, which imports it back: that file is the one that
 * would otherwise make this one's imports run in a circle.
 */
export function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// The sides of a run of corners. A wall of one corner has one side of no
// length, so it still has something to touch and be touched.
function sidesOf(points: readonly number[]): Segment[] {
  if (points.length === 2) return [[points[0], points[1], points[0], points[1]]];
  const sides: Segment[] = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    sides.push([points[i], points[i + 1], points[i + 2], points[i + 3]]);
  }
  return sides;
}

function mapEdges(width: number, height: number): Segment[] {
  return [
    [0, 0, width, 0],
    [width, 0, width, height],
    [width, height, 0, height],
    [0, height, 0, 0],
  ];
}

const toSide = (x: number, y: number, side: Segment) =>
  toSegment(x, y, side[0], side[1], side[2], side[3]);

// Which side of the line through a and b the point c is on: positive, negative or zero.
const turn = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

// How far apart two segments are: zero when they cross, else the least of
// the four distances from an end to the other segment.
function sideToSide(a: Segment, b: Segment): number {
  const crosses =
    turn(a[0], a[1], a[2], a[3], b[0], b[1]) * turn(a[0], a[1], a[2], a[3], b[2], b[3]) < 0 &&
    turn(b[0], b[1], b[2], b[3], a[0], a[1]) * turn(b[0], b[1], b[2], b[3], a[2], a[3]) < 0;
  if (crosses) return 0;
  return Math.min(
    toSide(a[0], a[1], b),
    toSide(a[2], a[3], b),
    toSide(b[0], b[1], a),
    toSide(b[2], b[3], a),
  );
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Every wall step no `wallErase` took away, in drawing order. */
export function standingWalls(ops: readonly AnnotationOp[]): StandingWall[] {
  const erased = new Set<number>();
  for (const op of ops) {
    if (op.t === "wallErase") for (const target of op.targets) erased.add(target);
  }
  const walls: StandingWall[] = [];
  ops.forEach((op, at) => {
    if (op.t === "wall" && !erased.has(at)) walls.push({ at, op });
  });
  return walls;
}

/** The places of the standing walls whose line passes within `tolerance` of a point. */
export function wallsAt(
  ops: readonly AnnotationOp[],
  x: number,
  y: number,
  tolerance: number,
): number[] {
  return standingWalls(ops)
    .filter(({ op }) => sidesOf(op.points).some((side) => toSide(x, y, side) <= tolerance))
    .map((wall) => wall.at);
}

// Whether a point is within TOUCH_PX of the map's edge.
const onEdge = (x: number, y: number, width: number, height: number) =>
  x <= TOUCH_PX || y <= TOUCH_PX || x >= width - TOUCH_PX || y >= height - TOUCH_PX;

const touchesAny = (x: number, y: number, sides: readonly Segment[]) =>
  sides.some((side) => toSide(x, y, side) <= TOUCH_PX);

/**
 * Per wall, whether both its ends touch: the map's edge, a side of another
 * wall, or one of its own sides other than the one meeting at that end, so a
 * loop is closed by its start meeting its last side.
 */
export function closedWalls(
  walls: readonly (readonly number[])[],
  width: number,
  height: number,
): boolean[] {
  const sides = walls.map(sidesOf);
  return walls.map((points, i) => {
    const others = sides.flatMap((own, j) => (j === i ? [] : own));
    const own = sides[i];
    const endTouches = (x: number, y: number, skipped: number) =>
      onEdge(x, y, width, height) ||
      touchesAny(x, y, others) ||
      touchesAny(
        x,
        y,
        own.filter((_, k) => k !== skipped),
      );
    return (
      endTouches(points[0], points[1], 0) &&
      endTouches(points[points.length - 2], points[points.length - 1], own.length - 1)
    );
  });
}

/**
 * Per wall, whether every wall in its shape is closed. Two walls are one
 * shape when a side of one passes within TOUCH_PX of a side of the other, and
 * shapes chain through shared walls; the map's edge never joins them.
 */
export function closedShapes(
  walls: readonly (readonly number[])[],
  width: number,
  height: number,
): boolean[] {
  const closed = closedWalls(walls, width, height);
  const sides = walls.map(sidesOf);
  // Bounding boxes, grown by TOUCH_PX, let most pairs skip the side-by-side check.
  const boxes = walls.map((points) => {
    const xs = points.filter((_, k) => k % 2 === 0);
    const ys = points.filter((_, k) => k % 2 === 1);
    return [
      Math.min(...xs) - TOUCH_PX,
      Math.min(...ys) - TOUCH_PX,
      Math.max(...xs) + TOUCH_PX,
      Math.max(...ys) + TOUCH_PX,
    ];
  });
  const parent = walls.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
      if (sides[i].some((s) => sides[j].some((t) => sideToSide(s, t) <= TOUCH_PX))) {
        parent[find(i)] = find(j);
      }
    }
  }
  const shapeClosed = new Map<number, boolean>();
  walls.forEach((_, i) => {
    const root = find(i);
    shapeClosed.set(root, (shapeClosed.get(root) ?? true) && closed[i]);
  });
  return walls.map((_, i) => shapeClosed.get(find(i)) ?? false);
}

/**
 * Where a click at (x, y) lands, within `reach`. Corners win before lines,
 * and the nearest wins within each: first the draft's first corner (once the
 * draft has three), the other walls' corners and the map's four, and the
 * draft's own corners but its first and last two; then the other walls'
 * sides, the draft's sides but its last, and the map's four edges. Landing
 * exactly is what makes "touches" exact, so a flood cannot leak at a wall's end.
 */
export function snapPoint(
  x: number,
  y: number,
  reach: number,
  walls: readonly (readonly number[])[],
  draft: WallDraft | null,
  width: number,
  height: number,
): Snap {
  const corners: { x: number; y: number; on: "first" | "touch" }[] = [];
  const lines: Segment[] = [];
  if (draft) {
    const count = draft.points.length / 2;
    if (count >= 3) corners.push({ x: draft.points[0], y: draft.points[1], on: "first" });
  }
  for (const points of walls) {
    for (let i = 0; i < points.length; i += 2) {
      corners.push({ x: points[i], y: points[i + 1], on: "touch" });
    }
    lines.push(...sidesOf(points));
  }
  for (const [cx, cy] of [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ]) {
    corners.push({ x: cx, y: cy, on: "touch" });
  }
  lines.push(...mapEdges(width, height));
  if (draft) {
    const count = draft.points.length / 2;
    for (let k = 1; k <= count - 3; k++) {
      corners.push({ x: draft.points[k * 2], y: draft.points[k * 2 + 1], on: "touch" });
    }
    lines.push(...sidesOf(draft.points).slice(0, -1));
  }

  let best: Snap | null = null;
  let bestDistance = reach;
  for (const corner of corners) {
    const distance = Math.hypot(x - corner.x, y - corner.y);
    if (distance <= bestDistance && (best === null || distance < bestDistance)) {
      best = { x: round(corner.x), y: round(corner.y), on: corner.on };
      bestDistance = distance;
    }
  }
  if (best) return best;

  for (const line of lines) {
    const dx = line[2] - line[0];
    const dy = line[3] - line[1];
    const length = dx * dx + dy * dy;
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - line[0]) * dx + (y - line[1]) * dy) / length));
    const px = line[0] + t * dx;
    const py = line[1] + t * dy;
    const distance = Math.hypot(x - px, y - py);
    if (distance <= bestDistance && (best === null || distance < bestDistance)) {
      best = { x: round(px), y: round(py), on: "touch" };
      bestDistance = distance;
    }
  }
  return best ?? { x: round(x), y: round(y), on: null };
}

/**
 * One click on the wall being drawn. With no draft it starts one. Landing on
 * the first corner finishes a loop, and landing on a touch finishes a wall
 * that started on one; a click on the last corner again is ignored. A draft
 * that reaches one corner short of the point limit is finished here as Escape
 * would finish it, by `closeWall`, so the wall still ends closed: the line
 * that closes it is the one point the limit leaves room for.
 */
export function placeCorner(
  draft: WallDraft | null,
  snap: Snap,
  walls: readonly (readonly number[])[],
  width: number,
  height: number,
): { draft: WallDraft | null; wall: number[] | null } {
  if (!draft) {
    return {
      draft: { points: [snap.x, snap.y], startTouches: snap.on === "touch" },
      wall: null,
    };
  }
  const { points } = draft;
  if (snap.x === points[points.length - 2] && snap.y === points[points.length - 1]) {
    return { draft, wall: null };
  }
  if (snap.on === "first") return { draft: null, wall: [...points, points[0], points[1]] };
  if (snap.on === "touch" && draft.startTouches) {
    return { draft: null, wall: [...points, snap.x, snap.y] };
  }
  const next = { ...draft, points: [...points, snap.x, snap.y] };
  if (next.points.length / 2 >= MAX_WALL_POINTS - 1) {
    return { draft: null, wall: closeWall(next, walls, width, height) };
  }
  return { draft: next, wall: null };
}

/**
 * The wall as Escape finishes it, or null when it has too few corners to
 * close. A draft whose first corner is in open space loops back to it. One
 * whose first corner touches runs from the last corner toward the first and
 * stops at the nearest crossing on the way with another wall's side, one of
 * the draft's own sides but its last, or the map's edge, else ends on the
 * first corner.
 */
export function closeWall(
  draft: WallDraft,
  walls: readonly (readonly number[])[],
  width: number,
  height: number,
): number[] | null {
  const { points } = draft;
  if (points.length < 6) return null;
  const [fx, fy] = points;
  if (!draft.startTouches) return [...points, fx, fy];

  const lx = points[points.length - 2];
  const ly = points[points.length - 1];
  const dx = fx - lx;
  const dy = fy - ly;
  const blockers = [
    ...walls.flatMap(sidesOf),
    ...sidesOf(points).slice(0, -1),
    ...mapEdges(width, height),
  ];
  let nearest = 1;
  for (const [ax, ay, bx, by] of blockers) {
    const ex = bx - ax;
    const ey = by - ay;
    const denominator = dx * ey - dy * ex;
    if (denominator === 0) continue;
    const t = ((ax - lx) * ey - (ay - ly) * ex) / denominator;
    const u = ((ax - lx) * dy - (ay - ly) * dx) / denominator;
    if (t > 1e-9 && t < nearest && u >= 0 && u <= 1) nearest = t;
  }
  if (nearest === 1) return [...points, fx, fy];
  return [...points, round(lx + nearest * dx), round(ly + nearest * dy)];
}
