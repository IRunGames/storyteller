import {
  MAX_FLOOD_POINTS,
  MAX_FLOOD_RINGS,
  type AnnotationOp,
  type WallOp,
} from "./annotation-schemas";
import { closedShapes, standingWalls, toSegment } from "./fog-walls";

// The areas fog walls bound, worked out on a hidden grid laid over the
// picture: the area a flood fills from a click, and the enclosed areas whose
// fog the storyteller sees in deep blue. Walls are drawn onto the grid as
// bands of wall cells, an area is the free cells a fill reaches between them,
// and its outline is traced along cell edges, simplified, and handed back in
// picture pixels. A grid rather than exact geometry because walls that cross,
// nearly touch or end a fraction of a pixel short of each other then still
// bound an area without a leak. No React, so the annotator and its tests share it.

/** How many cells the hidden grid has along the picture's longer side. */
export const GRID_LONG_SIDE = 1024;

/**
 * An area's outline in picture pixels: rings of points, each flat x then y,
 * drawn as one path with the even-odd rule, so a ring inside another is a hole.
 */
export type Rings = number[][];

/** What the storyteller sees of the walls: each standing wall, and the enclosed areas. */
export type StorytellerView = { walls: { op: WallOp; closed: boolean }[]; enclosed: Rings };

// A cell is wall when a wall's side passes within this many cells of its
// center. Any band past half a cell's diagonal holds every cell the side
// passes through, so it is connected and a 4-connected fill cannot slip
// through it; two cells also closes the gap of a fraction of a pixel that
// rounding leaves between a wall's end and the wall it was snapped onto.
const WALL_BAND_CELLS = 2;

// A fill grows under its walls by taking wall cells, counted in 8-connected
// steps through wall cells from its own free cells. It always takes those
// within GROWTH_STEPS: a lone wall's band is four or five cells across, and
// fewer steps on a slant, so five reach under the whole band from either side
// and two neighboring floods meet with no fog left between them.
const GROWTH_STEPS = 5;

// Where bands merge wider than that, as walls a few pixels apart or many
// walls through one point do, a fill also takes every wall cell no more than
// REACH_PAST_STEPS further from it than from any other area: each step across
// changes that difference by two, so it reaches two cells past the merged
// band's middle, and two neighboring floods still overlap once simplified. A
// wall cell no other area reaches, as under a thick wall or a knot of walls
// standing in this area alone, is taken however deep: any of it left would be
// fog that a click on it, being a click on a wall, could not lift. Only wall
// cells are ever taken, so a fill never shows the next area's own cells.
const REACH_PAST_STEPS = 4;

// A free area of fewer cells than this is taken for wall. Where two walls
// cross, their bands can cut off a pocket of a cell or two: no room, but as
// an area of its own it would be a hole in every flood around it, a speck of
// fog lifted only by a click on that very cell, a target no storyteller could
// be expected to find. As wall, the floods around it reach under it like any
// other, and a click in it does nothing. A room whose inside is two cells by
// two is the smallest area kept, and stays a hole in the flood around it.
const MIN_AREA_CELLS = 4;

// How far, in cells, a simplified outline may stray from the traced one. A
// straight wall's traced outline is a staircase whose corners spread across
// up to a cell's diagonal (1.41 cells) on a slant, so a tolerance of one cell
// still left dozens of corners along a slanted wall; one and a half turns any
// straight staircase into a single edge. Every simplified edge joins two
// traced corners, which along a straight wall all lie past its middle line,
// so the outline never pulls back over that line however far it may stray.
const TOLERANCE_CELLS = 1.5;

// The tolerance an outline past a flood step's caps is simplified again at,
// once, before the click gives up: no more than the wall band's reach
// (WALL_BAND_CELLS), so an edge that cuts across a closed room's outline
// strays into the room by no more than that. Coarser passes cut deeper: at
// three cells, a map of many jagged caves had points four to six cells
// inside them revealed to the players. A flood that fits only by dropping a
// ring would show a closed room whole.
const RETRY_TOLERANCE_CELLS = 2;

type Grid = {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
};

// Cells as square as the picture allows, the grid meeting its edges exactly.
function gridFor(width: number, height: number): Grid {
  const cell = Math.max(width, height) / GRID_LONG_SIDE;
  const columns = Math.max(1, Math.round(width / cell));
  const rows = Math.max(1, Math.round(height / cell));
  return { columns, rows, cellWidth: width / columns, cellHeight: height / rows, width, height };
}

const clampUnit = (t: number) => Math.max(0, Math.min(1, t));

// Marks one side's band, the side given in grid units (cells). Each row visits
// only the columns the band can reach on it: the stretch of the side within
// the band's reach of the row's center, widened by the band. A slanted side
// therefore costs its band's cells, not its bounding box's.
function markSide(wall: Uint8Array, grid: Grid, ax: number, ay: number, bx: number, by: number) {
  const reach = WALL_BAND_CELLS;
  const { columns, rows } = grid;
  const firstRow = Math.max(0, Math.ceil(Math.min(ay, by) - reach - 0.5));
  const lastRow = Math.min(rows - 1, Math.floor(Math.max(ay, by) + reach - 0.5));
  for (let row = firstRow; row <= lastRow; row++) {
    const cy = row + 0.5;
    let left = Math.min(ax, bx);
    let right = Math.max(ax, bx);
    if (ay !== by) {
      const xa = ax + clampUnit((cy - reach - ay) / (by - ay)) * (bx - ax);
      const xb = ax + clampUnit((cy + reach - ay) / (by - ay)) * (bx - ax);
      left = Math.min(xa, xb);
      right = Math.max(xa, xb);
    }
    const firstColumn = Math.max(0, Math.ceil(left - reach - 0.5));
    const lastColumn = Math.min(columns - 1, Math.floor(right + reach - 0.5));
    for (let column = firstColumn; column <= lastColumn; column++) {
      if (toSegment(column + 0.5, cy, ax, ay, bx, by) <= reach) wall[row * columns + column] = 1;
    }
  }
}

// The grid's wall cells: 1 where some wall's side passes within the band of
// the cell's center.
function wallCells(walls: readonly (readonly number[])[], grid: Grid): Uint8Array {
  const wall = new Uint8Array(grid.columns * grid.rows);
  const { cellWidth, cellHeight } = grid;
  for (const points of walls) {
    for (let k = 0; k + 3 < points.length; k += 2) {
      markSide(
        wall,
        grid,
        points[k] / cellWidth,
        points[k + 1] / cellHeight,
        points[k + 2] / cellWidth,
        points[k + 3] / cellHeight,
      );
    }
  }
  return wall;
}

// Labels with `label` the free cells 4-connected to `start`, queueing each
// one in `queue` from its start, and returns how many there are.
function fill(
  labels: Int32Array,
  wall: Uint8Array,
  grid: Grid,
  start: number,
  label: number,
  queue: Int32Array,
): number {
  const { columns } = grid;
  const size = labels.length;
  let end = 0;
  const take = (neighbor: number) => {
    if (!wall[neighbor] && labels[neighbor] === 0) {
      labels[neighbor] = label;
      queue[end++] = neighbor;
    }
  };
  take(start);
  for (let head = 0; head < end; head++) {
    const cell = queue[head];
    const column = cell % columns;
    if (column > 0) take(cell - 1);
    if (column < columns - 1) take(cell + 1);
    if (cell >= columns) take(cell - columns);
    if (cell + columns < size) take(cell + columns);
  }
  return end;
}

/** The grid's wall cells, and each free cell's area: labeled from 1, with each label's size. */
type Areas = { wall: Uint8Array; labels: Int32Array; sizes: number[] };

// The walls drawn onto the grid and its free cells labeled into 4-connected
// areas, a label of 0 on every wall cell. An area of fewer than
// MIN_AREA_CELLS cells is made wall here, so the flood and the enclosed areas
// both see it as one. `sizes` holds each label's cells; index 0 holds none.
function gridAreas(walls: readonly (readonly number[])[], grid: Grid): Areas {
  const wall = wallCells(walls, grid);
  const labels = new Int32Array(wall.length);
  const queue = new Int32Array(wall.length);
  const sizes = [0];
  for (let cell = 0; cell < wall.length; cell++) {
    if (wall[cell] || labels[cell]) continue;
    const cells = fill(labels, wall, grid, cell, sizes.length, queue);
    if (cells >= MIN_AREA_CELLS) {
      sizes.push(cells);
      continue;
    }
    for (let k = 0; k < cells; k++) {
      wall[queue[k]] = 1;
      labels[queue[k]] = 0;
    }
  }
  return { wall, labels, sizes };
}

// The step count of a wall cell no path through walls reaches from the cells
// counted from. Counted from the other areas, it marks a cell under walls
// beside this area alone, which this area takes however deep.
const FAR = 0x3fffffff;

// Whether `test` holds for any of a cell's eight neighbors on the grid,
// asking no further once one does.
function anyNeighbor(cell: number, grid: Grid, test: (neighbor: number) => boolean): boolean {
  const { columns, rows } = grid;
  const column = cell % columns;
  const row = (cell - column) / columns;
  for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
    for (let c = Math.max(0, column - 1); c <= Math.min(columns - 1, column + 1); c++) {
      if ((r !== row || c !== column) && test(r * columns + c)) return true;
    }
  }
  return false;
}

// Per wall cell, the fewest 8-connected steps through wall cells from a free
// cell `isSource` names: 1 beside one, FAR where no path through walls leads.
// Breadth first from every wall cell beside a source at once, through
// `queue`, so the free cells, usually most of the grid, are never walked.
function stepsThroughWalls(
  wall: Uint8Array,
  grid: Grid,
  isSource: (cell: number) => boolean,
  queue: Int32Array,
): Int32Array {
  const steps = new Int32Array(wall.length).fill(FAR);
  let end = 0;
  for (let cell = 0; cell < wall.length; cell++) {
    if (wall[cell] && anyNeighbor(cell, grid, (n) => !wall[n] && isSource(n))) {
      steps[cell] = 1;
      queue[end++] = cell;
    }
  }
  for (let head = 0; head < end; head++) {
    const cell = queue[head];
    anyNeighbor(cell, grid, (neighbor) => {
      if (wall[neighbor] && steps[neighbor] === FAR) {
        steps[neighbor] = steps[cell] + 1;
        queue[end++] = neighbor;
      }
      return false;
    });
  }
  return steps;
}

// Grows `region`, so far only free cells, under the walls that bound it: a
// wall cell is taken within GROWTH_STEPS of the region, or within
// REACH_PAST_STEPS more than its steps from the cells `isOther` names, or
// however deep where no path through walls leads to it from them. Every cell
// on a shortest path to a taken cell is taken too, so the region stays connected.
function growUnderWalls(
  region: Uint8Array,
  wall: Uint8Array,
  grid: Grid,
  isOther: (cell: number) => boolean,
) {
  const queue = new Int32Array(region.length);
  const own = stepsThroughWalls(wall, grid, (cell) => region[cell] === 1, queue);
  const other = stepsThroughWalls(wall, grid, isOther, queue);
  for (let cell = 0; cell < region.length; cell++) {
    if (!wall[cell] || own[cell] === FAR) continue;
    const reach = other[cell] === FAR ? FAR : other[cell] + REACH_PAST_STEPS;
    if (own[cell] <= Math.max(GROWTH_STEPS, reach)) region[cell] = 1;
  }
}

// The directions along cell edges, as bits; turning right is the next one.
const EAST = 0;
const SOUTH = 1;
const WEST = 2;
const NORTH = 3;

// The region's outline, in grid corners. Every cell edge between the region
// and the rest (or the grid's edge) is one step, directed so the region is
// on its right, and the steps are walked into closed loops, each step taken
// once. Where two region cells meet only at a corner the walk turns right,
// keeping them apart; either way would do under the even-odd rule. Only the
// corners where a loop turns are kept. Each loop starts at its first corner
// in reading order, which it always turns at: the steps in and out of it both
// lead to later corners, so they cannot run on in one line.
function trace(region: Uint8Array, grid: Grid): number[][] {
  const { columns, rows } = grid;
  const stride = columns + 1;
  const ways = new Uint8Array(stride * (rows + 1));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column;
      if (!region[cell]) continue;
      const corner = row * stride + column;
      if (row === 0 || !region[cell - columns]) ways[corner] |= 1 << EAST;
      if (column === columns - 1 || !region[cell + 1]) ways[corner + 1] |= 1 << SOUTH;
      if (row === rows - 1 || !region[cell + columns]) ways[corner + stride + 1] |= 1 << WEST;
      if (column === 0 || !region[cell - 1]) ways[corner + stride] |= 1 << NORTH;
    }
  }
  const steps = [1, stride, -1, -stride];
  const rings: number[][] = [];
  for (let start = 0; start < ways.length; start++) {
    while (ways[start]) {
      const ring = [start % stride, Math.floor(start / stride)];
      let corner = start;
      let direction = [EAST, SOUTH, WEST, NORTH].find((way) => ways[start] & (1 << way))!;
      for (;;) {
        ways[corner] &= ~(1 << direction);
        corner += steps[direction];
        if (corner === start) break;
        const right = (direction + 1) & 3;
        const left = (direction + 3) & 3;
        const next =
          ways[corner] & (1 << right) ? right : ways[corner] & (1 << direction) ? direction : left;
        if (next !== direction) ring.push(corner % stride, Math.floor(corner / stride));
        direction = next;
      }
      rings.push(ring);
    }
  }
  return rings;
}

// Ramer-Douglas-Peucker on a closed ring of grid corners. Every corner on the
// grid's edge is kept, so the outline never comes off the picture's edge and
// leaves a sliver of fog along it; a ring off the edge is anchored on its
// first corner and the one farthest from it. Each stretch between kept
// corners is then split at its corner farthest from the line joining them,
// until none strays further than `tolerance`. A stack rather than recursion,
// so a ring of thousands of corners cannot overflow the call stack.
function simplify(ring: readonly number[], tolerance: number, grid: Grid): number[] {
  const count = ring.length / 2;
  const x = (i: number) => ring[(2 * i) % ring.length];
  const y = (i: number) => ring[(2 * i + 1) % ring.length];
  const anchors: number[] = [];
  for (let i = 0; i < count; i++) {
    if (x(i) === 0 || y(i) === 0 || x(i) === grid.columns || y(i) === grid.rows) anchors.push(i);
  }
  if (anchors.length === 0) anchors.push(0);
  if (anchors.length === 1) {
    const [only] = anchors;
    const fromOnly = (i: number) => Math.hypot(x(i) - x(only), y(i) - y(only));
    let far = only;
    for (let i = 0; i < count; i++) if (fromOnly(i) > fromOnly(far)) far = i;
    anchors.push(far);
    anchors.sort((a, b) => a - b);
  }
  const keep = new Uint8Array(count);
  // Stretches as pairs of corner indices, the last wrapping round past `count`.
  const stack: number[] = [];
  anchors.forEach((a, k) => {
    keep[a] = 1;
    stack.push(a, k + 1 < anchors.length ? anchors[k + 1] : anchors[0] + count);
  });
  while (stack.length > 0) {
    const b = stack.pop()!;
    const a = stack.pop()!;
    let split = -1;
    let worst = tolerance;
    for (let i = a + 1; i < b; i++) {
      const distance = toSegment(x(i), y(i), x(a), y(a), x(b), y(b));
      if (distance > worst) {
        worst = distance;
        split = i;
      }
    }
    if (split >= 0) {
      keep[split % count] = 1;
      stack.push(a, split, split, b);
    }
  }
  const kept: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) kept.push(x(i), y(i));
  return kept.length >= 6 ? kept : extremes(ring);
}

// A ring's corners farthest out along the two diagonals, in ring order. On a
// traced ring they are four distinct corners: a ring simplified below three
// points keeps these instead, so a small closed room stays a hole in the
// flood around it rather than being flooded over.
function extremes(ring: readonly number[]): number[] {
  const sum = (i: number) => ring[2 * i] + ring[2 * i + 1];
  const difference = (i: number) => ring[2 * i] - ring[2 * i + 1];
  const best = [0, 0, 0, 0];
  for (let i = 1; i < ring.length / 2; i++) {
    if (sum(i) < sum(best[0])) best[0] = i;
    if (sum(i) > sum(best[1])) best[1] = i;
    if (difference(i) < difference(best[2])) best[2] = i;
    if (difference(i) > difference(best[3])) best[3] = i;
  }
  return [...new Set(best)].sort((a, b) => a - b).flatMap((i) => [ring[2 * i], ring[2 * i + 1]]);
}

// A coordinate in picture pixels, rounded to a tenth and kept on the picture.
const toTenth = (value: number, limit: number) =>
  Math.min(Math.round(value * 10) / 10, Math.floor(limit * 10) / 10);

// A ring from grid corners to picture pixels. Rounding can land two corners
// of a small picture's ring on one point, so repeats are dropped.
function toPixels(ring: readonly number[], grid: Grid): number[] {
  const pixels: number[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    const x = toTenth(ring[i] * grid.cellWidth, grid.width);
    const y = toTenth(ring[i + 1] * grid.cellHeight, grid.height);
    const n = pixels.length;
    if (n > 0 && pixels[n - 2] === x && pixels[n - 1] === y) continue;
    pixels.push(x, y);
  }
  const n = pixels.length;
  if (n > 2 && pixels[n - 2] === pixels[0] && pixels[n - 1] === pixels[1]) pixels.length -= 2;
  return pixels;
}

// The rings simplified at `tolerance`, in picture pixels. Simplifying never
// leaves a ring below three points; only a ring smaller than a tenth of a
// pixel, on a picture of a few pixels, can round down below them and is left out.
const simplifiedRings = (traced: readonly number[][], tolerance: number, grid: Grid) =>
  traced
    .map((ring) => toPixels(simplify(ring, tolerance, grid), grid))
    .filter((ring) => ring.length >= 6);

const pointsIn = (rings: Rings) => rings.reduce((sum, ring) => sum + ring.length / 2, 0);

// The traced rings as a flood step saves them: simplified, then, while their
// points are past the cap, simplified once more at RETRY_TOLERANCE_CELLS.
// Null when they cannot fit, with more rings than a step holds or too many
// points after the retry, since no ring is ever dropped to make them fit and
// none simplified coarser: one left out would flood over the closed room it
// outlines, and one cut coarser would flood into it.
function fitStep(traced: readonly number[][], grid: Grid): Rings | null {
  if (traced.length > MAX_FLOOD_RINGS) return null;
  for (const tolerance of [TOLERANCE_CELLS, RETRY_TOLERANCE_CELLS]) {
    const rings = simplifiedRings(traced, tolerance, grid);
    if (pointsIn(rings) <= MAX_FLOOD_POINTS) return rings.length > 0 ? rings : null;
  }
  return null;
}

/**
 * The area a click at (x, y) floods, as rings in picture pixels: the free
 * cells 4-connected to the clicked one, grown under the walls that bound
 * them. Null for a click on a wall, which floods nothing; for too large an
 * outline, more rings or points than one flood step holds even simplified
 * once more at two cells, since fitting it by dropping a ring would flood
 * over a closed room, and simplifying it coarser would flood into one; and
 * for an area smaller than a tenth of a pixel. A closed room filled solid
 * with walls has no free cell, so the grid cannot tell it from a thick wall
 * and a flood around it takes it whole; the brush can still cover it again.
 */
export function floodAt(
  walls: readonly (readonly number[])[],
  width: number,
  height: number,
  x: number,
  y: number,
): Rings | null {
  const grid = gridFor(width, height);
  const { columns, rows } = grid;
  const { wall, labels } = gridAreas(walls, grid);
  const column = Math.max(0, Math.min(columns - 1, Math.floor(x / grid.cellWidth)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor(y / grid.cellHeight)));
  const own = labels[row * columns + column];
  if (own === 0) return null;
  const region = new Uint8Array(labels.length);
  for (let cell = 0; cell < labels.length; cell++) if (labels[cell] === own) region[cell] = 1;
  growUnderWalls(region, wall, grid, (cell) => labels[cell] !== 0 && labels[cell] !== own);
  return fitStep(trace(region, grid), grid);
}

/**
 * The enclosed areas the walls given bound, as rings in picture pixels. The
 * free cells fall into 4-connected areas; one touching no edge of the grid is
 * enclosed. When exactly one area touches an edge, the walls divide nothing
 * there and it is the outside, left without color. When two or more touch an
 * edge, the walls divide the map, so there is no outside and every area is
 * enclosed: a wall from edge to edge colors both its sides. Together they grow
 * under their walls as a flood does, with the outside, if any, as the other
 * area. The caller passes the walls of closed shapes only.
 */
export function enclosedAreas(
  walls: readonly (readonly number[])[],
  width: number,
  height: number,
): Rings {
  const grid = gridFor(width, height);
  const { columns, rows } = grid;
  const { wall, labels, sizes } = gridAreas(walls, grid);
  // The areas with a cell in the grid's first or last row or column.
  const edge = new Uint8Array(sizes.length);
  for (let column = 0; column < columns; column++) {
    edge[labels[column]] = 1;
    edge[labels[(rows - 1) * columns + column]] = 1;
  }
  for (let row = 0; row < rows; row++) {
    edge[labels[row * columns]] = 1;
    edge[labels[row * columns + columns - 1]] = 1;
  }
  // The outside's label: the one area touching the edge, when exactly one does.
  // With none, or with two or more, which the walls divide the map into, there
  // is no outside and the label is 0, which no area has.
  let outside = 0;
  let touching = 0;
  for (let label = 1; label < sizes.length; label++) {
    if (!edge[label]) continue;
    touching++;
    outside = label;
  }
  if (touching !== 1) outside = 0;

  const region = new Uint8Array(labels.length);
  let enclosed = false;
  for (let cell = 0; cell < labels.length; cell++) {
    if (labels[cell] && labels[cell] !== outside) region[cell] = 1;
    enclosed ||= region[cell] === 1;
  }
  if (!enclosed) return [];
  growUnderWalls(region, wall, grid, (cell) => outside > 0 && labels[cell] === outside);
  // Never saved, so the enclosed areas keep every ring however many there are.
  return simplifiedRings(trace(region, grid), TOLERANCE_CELLS, grid);
}

/** Whether a point lies inside rings drawn with the even-odd rule. */
export function insideRings(rings: Rings, x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * What the storyteller sees of the walls: each standing wall with whether its
 * whole shape is closed, and the enclosed areas the closed shapes bound. An
 * open wall's shape bounds nothing here, so its areas lose their color.
 */
export function storytellerView(
  ops: readonly AnnotationOp[],
  width: number,
  height: number,
): StorytellerView {
  const standing = standingWalls(ops);
  const points = standing.map((wall) => wall.op.points);
  const closed = closedShapes(points, width, height);
  return {
    walls: standing.map((wall, i) => ({ op: wall.op, closed: closed[i] })),
    enclosed: enclosedAreas(
      points.filter((_, i) => closed[i]),
      width,
      height,
    ),
  };
}
