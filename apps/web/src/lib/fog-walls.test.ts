import { describe, it } from "node:test";
import { expect } from "expect";

import { MAX_WALL_POINTS, type AnnotationOp } from "./annotation-schemas";
import {
  closeWall,
  closedShapes,
  closedWalls,
  placeCorner,
  snapPoint,
  standingWalls,
  wallsAt,
} from "./fog-walls";

const W = 400;
const H = 200;

describe("standingWalls and wallsAt", () => {
  it("leaves out walls a wall eraser took away, and finds the rest under a point", () => {
    const ops: AnnotationOp[] = [
      { t: "wall", points: [0, 50, 400, 50] },
      { t: "pen", color: "#000000", width: 2, points: [0, 100, 400, 100] },
      { t: "wall", points: [0, 150, 400, 150] },
      { t: "wallErase", targets: [0] },
      // Neither Erase all annotations nor Cover all touches a wall.
      { t: "penClear" },
      { t: "fogAll", mode: "cover" },
    ];
    expect(standingWalls(ops).map((wall) => wall.at)).toEqual([2]);
    expect(wallsAt(ops, 200, 52, 3)).toEqual([]);
    expect(wallsAt(ops, 200, 100, 3)).toEqual([]);
    expect(wallsAt(ops, 200, 152, 3)).toEqual([2]);
  });
});

describe("closedWalls", () => {
  it("counts an end on the edge, on another wall, or on its own earlier side", () => {
    const walls = [
      [200, 0, 200, 200], // edge to edge: closed
      [0, 100, 199.6, 100], // edge to 0.4 px short of the first wall: closed
      [300, 0, 300, 80], // into open space: open
      [50, 120, 120, 120, 120, 180, 50, 180, 50, 120], // a loop: closed
      [0, 30, 60, 30, 60, 60, 30, 60, 30, 30], // a P from the edge onto its own first side: closed
      [100, 190, 160, 190, 160, 140, 130, 140, 130, 190], // a 6, its start in open space: open
      [0, 10, 199, 10], // edge to 1 px short of the first wall: open
    ];
    expect(closedWalls(walls, W, H)).toEqual([true, true, false, true, true, false, false]);
  });
});

describe("closedShapes", () => {
  it("makes a whole shape open for one open wall in it, crossing or ending on it", () => {
    const walls = [
      [200, 0, 200, 200], // closed, but the next one ends on it and is open
      [200, 100, 260, 100],
      [0, 20, 100, 20], // a shape of its own, open at (100, 20)
      [300, 0, 300, 200], // two closed walls crossing: one closed shape
      [260, 0, 400, 140], // top edge to right edge, crossing the last at (300, 40)
    ];
    expect(closedShapes(walls, W, H)).toEqual([false, false, false, true, true]);
  });
});

describe("snapPoint", () => {
  const walls = [
    [100, 100, 300, 100],
    [0, 104, 50, 104],
  ];
  it("lands on a corner before a nearer line, then on a line, then on the edge", () => {
    expect(snapPoint(101, 103, 5, walls, null, W, H)).toEqual({ x: 100, y: 100, on: "touch" });
    expect(snapPoint(200, 103, 5, walls, null, W, H)).toEqual({ x: 200, y: 100, on: "touch" });
    expect(snapPoint(2, 60, 5, walls, null, W, H)).toEqual({ x: 0, y: 60, on: "touch" });
    expect(snapPoint(150, 150, 5, walls, null, W, H)).toEqual({ x: 150, y: 150, on: null });
  });
  it("offers the draft's first corner once it has three, and its earlier sides", () => {
    const two = { points: [20, 20, 80, 20], startTouches: false };
    const three = { points: [20, 20, 80, 20, 80, 80], startTouches: false };
    expect(snapPoint(22, 22, 5, [], two, W, H).on).toBeNull();
    expect(snapPoint(22, 22, 5, [], three, W, H)).toEqual({ x: 20, y: 20, on: "first" });
    expect(snapPoint(50, 23, 5, [], three, W, H)).toEqual({ x: 50, y: 20, on: "touch" });
  });
});

describe("placeCorner", () => {
  it("ends a wall that starts touching at the next touch, and a free one only on its first corner", () => {
    let step = placeCorner(null, { x: 0, y: 50, on: "touch" }, [], W, H);
    expect(step).toEqual({ draft: { points: [0, 50], startTouches: true }, wall: null });
    step = placeCorner(step.draft, { x: 400, y: 50, on: "touch" }, [], W, H);
    expect(step).toEqual({ draft: null, wall: [0, 50, 400, 50] });

    let free = placeCorner(null, { x: 20, y: 20, on: null }, [], W, H);
    free = placeCorner(free.draft, { x: 200, y: 50, on: "touch" }, [], W, H);
    expect(free.wall).toBeNull();
    free = placeCorner(free.draft, { x: 20, y: 80, on: null }, [], W, H);
    free = placeCorner(free.draft, { x: 20, y: 80, on: null }, [], W, H); // same point: ignored
    expect(free.draft?.points).toEqual([20, 20, 200, 50, 20, 80]);
    expect(placeCorner(free.draft, { x: 20, y: 20, on: "first" }, [], W, H).wall).toEqual([
      20, 20, 200, 50, 20, 80, 20, 20,
    ]);
  });
});

describe("placeCorner at the point limit", () => {
  // Corners down a line at x = 250, so the closing line meets nothing before the wall at x = 200.
  const fill = (first: { x: number; y: number; on: "touch" | null }, walls: number[][]) => {
    let step = placeCorner(null, first, walls, W, H);
    for (let i = 0; step.draft === null ? false : true; i++) {
      step = placeCorner(step.draft, { x: 250, y: 10 + i * 0.3, on: null }, walls, W, H);
    }
    return step.wall;
  };
  it("finishes a touching draft with the closing line, so both ends touch", () => {
    const walls = [[200, 0, 200, 200]];
    const wall = fill({ x: 150, y: 0, on: "touch" }, walls);
    expect(wall).not.toBeNull();
    expect(wall!.length / 2).toBe(MAX_WALL_POINTS);
    expect(wall!.slice(-2)).toEqual([200, expect.any(Number)]);
    expect(closedWalls([...walls, wall!], W, H)).toEqual([true, true]);
  });
  it("loops a free draft back to its first corner", () => {
    const wall = fill({ x: 150, y: 30, on: null }, []);
    expect(wall!.length / 2).toBe(MAX_WALL_POINTS);
    expect(wall!.slice(-2)).toEqual([150, 30]);
  });
});

describe("closeWall", () => {
  const wall = [[200, 0, 200, 200]];
  it("drops a wall too short to close, loops a free one, and stops a touching one at the first wall", () => {
    expect(closeWall({ points: [10, 10, 60, 10], startTouches: false }, [], W, H)).toBeNull();
    expect(closeWall({ points: [10, 10, 60, 10, 60, 60], startTouches: false }, [], W, H)).toEqual([
      10, 10, 60, 10, 60, 60, 10, 10,
    ]);
    expect(
      closeWall({ points: [150, 0, 250, 50, 250, 150], startTouches: true }, wall, W, H),
    ).toEqual([150, 0, 250, 50, 250, 150, 200, 75]);
  });
});
