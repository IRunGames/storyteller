# Fog walls, the flood, and a straight pen: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walls the storyteller draws on the fog in the annotator, a flood tool that reveals or covers the area a click lands in up to those walls, a wall eraser, and Shift for a straight pen line.

**Architecture:** Three new step kinds in the drawing (`wall`, `wallErase`, `flood`). Pure geometry for walls (snapping, closed or open, the closing line) in `lib/fog-walls.ts`; a hidden grid for the flood and the enclosed areas (fill, outline tracing, simplifying) in `lib/fog-areas.ts`. The flood is drawn into the fog mask by `annotationTree` for both the storyteller and the players; walls and the enclosed areas' color are an optional storyteller-only part of that tree the server never asks for. A save made only of wall steps leaves the players' copy and the picture's on/off alone.

**Tech Stack:** Next.js 16, React 19, Chakra UI v3, zod 4, lucide-react, node:test + expect + Testing Library, Drizzle on Postgres.

**Spec:** `docs/superpowers/specs/2026-11-20-fog-walls-and-flood-design.md`

## Global Constraints

- Never commit or push (CLAUDE.md and the user's standing rule): every task ends with its tests green and the work left in the tree. This replaces the skill's commit steps.
- Read `apps/web/docs/standards.md` before the first code task. Comments say why, in prose, no analogies, no British slang.
- Format each touched file with `npx prettier --write --print-width 100 <files>` (the repo has no Prettier config).
- No new dependency. Icons are Lucide: `BrickWall` (Wall pen), `Pickaxe` (Wall eraser), `PaintBucket` (Flood), `CheckLine` (Finish wall).
- No migration: new step kinds are new zod members only. `db/custom/create_attachment_annotations_table.sql` gets its comment brought up to date and nothing else.
- Walls and anything derived from them (the enclosed areas' color) never reach the players' copy: left out of the tree the server renders, not hidden by opacity.
- Coordinates are the picture's own pixels, rounded to a tenth, as every step's are.
- One file deviates from the spec's "Where things go": the grid work goes in `lib/fog-areas.ts` beside `lib/fog-walls.ts` rather than in one file, keeping each file to one concern (standards: small, focused files).

Running one test file (from `apps/web`), written `T <file>` below:

```bash
node --import tsx --disable-warning=ExperimentalWarning --experimental-test-module-mocks --import ./src/test/setup.ts --test <file>
```

## Review Focus

1. **A wall end rounded off the wall it was snapped onto** (a tenth-pixel rounding leaves it up to 0.07 px short): the flood must still not leak past the junction. Test in Task 3.
2. **The players' copy of a drawing that has walls and floods**: the SVG the server writes must hold no wall and no wall color. Test in Task 4.
3. **A wall erased after a flood it bounded**: the flood's outline in the mask is unchanged (the anti-goal "a reveal that changes after it was made"). Test in Task 4.
4. **Undo that takes a flood off, or a save mixing a wall with a flood**: an ordinary save, turning the picture on and asking for a copy, not a walls-only save. Test in Task 5.
5. **A large map** (10000 by 6000): the flood still answers with an outline in picture pixels, within the step's caps, reaching the wall's middle line. Test in Task 3.

---

### Task 1: The new steps in the schema

**Files:**
- Modify: `apps/web/src/lib/annotation-schemas.ts`
- Test: `apps/web/src/lib/annotation-schemas.test.ts`

**Interfaces:**
- Produces: `MAX_WALL_POINTS = 500`, `MAX_FLOOD_RINGS = 200`, `MAX_FLOOD_POINTS = 10_000` (points across all rings); op members `{ t: "wall"; points: number[] }` (at least 2 points), `{ t: "wallErase"; targets: number[] }` (1..`MAX_ERASE_TARGETS`), `{ t: "flood"; mode: AnnotationMode; rings: number[][] }` (1..`MAX_FLOOD_RINGS` rings, each at least 3 points, flat x then y, total points at most `MAX_FLOOD_POINTS`); types `WallOp = Extract<AnnotationOp, { t: "wall" }>`, `FloodOp = Extract<AnnotationOp, { t: "flood" }>`; `isWallStep(op): boolean` (true for `wall` and `wallErase`); `eraseRefusal` extended to `wallErase`.

- [ ] **Step 1: Write the failing tests** in `annotation-schemas.test.ts`:

```ts
it("accepts a wall, a wall eraser's drag and a flood", () => {
  for (const op of [
    { t: "wall", points: [0, 10, 50, 10] },
    { t: "wallErase", targets: [0] },
    { t: "flood", mode: "reveal", rings: [[0, 0, 10, 0, 10, 10]] },
    { t: "flood", mode: "cover", rings: [[0, 0, 9, 0, 9, 9, 0, 9], [2, 2, 3, 2, 3, 3]] },
  ]) expect(annotationOpSchema.safeParse(op).success).toBe(true);
});

it("refuses a wall of one point, a ring of two, and a flood past its caps", () => {
  const bad = [
    { t: "wall", points: [0, 10] },
    { t: "flood", mode: "reveal", rings: [] },
    { t: "flood", mode: "reveal", rings: [[0, 0, 10, 0]] },
    { t: "flood", mode: "reveal", rings: Array.from({ length: MAX_FLOOD_RINGS + 1 }, () => [0, 0, 1, 0, 1, 1]) },
    // Two rings each under the per-ring bound, together over the step's.
    { t: "flood", mode: "reveal", rings: [0, 1].map(() => Array(MAX_FLOOD_POINTS + 2).fill(1)) },
    { t: "wall", points: Array((MAX_WALL_POINTS + 1) * 2).fill(1) },
  ];
  for (const op of bad) expect(annotationOpSchema.safeParse(op).success).toBe(false);
});

it("holds a wall eraser to walls drawn before it, and an eraser to marks", () => {
  const wall: AnnotationOp = { t: "wall", points: [0, 0, 10, 10] };
  const pen: AnnotationOp = { t: "pen", color: "#000000", width: 2, points: [1, 1] };
  expect(eraseRefusal([wall, pen, { t: "wallErase", targets: [0] }])).toBeNull();
  expect(eraseRefusal([wall, pen, { t: "wallErase", targets: [1] }])).toBe(
    "A wall eraser can only take away a wall drawn before it.",
  );
  expect(eraseRefusal([{ t: "wallErase", targets: [1] }, wall])).toBe(
    "A wall eraser can only take away a wall drawn before it.",
  );
  expect(eraseRefusal([wall, { t: "erase", targets: [0] }])).toBe(
    "An eraser can only take away a mark drawn before it.",
  );
});
```

- [ ] **Step 2: Run** `T src/lib/annotation-schemas.test.ts`. Expected: the three new tests FAIL (unknown discriminator, missing exports).

- [ ] **Step 3: Implement** the three members in `annotationOpSchema`, the caps, `WallOp`, `FloodOp`, `isWallStep`, and the `wallErase` branch of `eraseRefusal` with the message above. The flood's total-points check is a `.refine` on the rings array, not on the object, so the member stays a plain object for the discriminated union. Bring the file's top comment's list of step kinds up to date, with one sentence that a wall is the storyteller's alone and never drawn into the players' copy.

- [ ] **Step 4: Run** `T src/lib/annotation-schemas.test.ts`. Expected: PASS.

---

### Task 2: Wall geometry (`lib/fog-walls.ts`)

**Files:**
- Create: `apps/web/src/lib/fog-walls.ts`
- Modify: `apps/web/src/lib/annotation-drawing.ts` (`toSegment` moves out)
- Test: `apps/web/src/lib/fog-walls.test.ts`

**Interfaces:**
- Consumes: `AnnotationOp`, `WallOp` (Task 1).
- Produces:
  - `TOUCH_PX = 0.5`: within this many picture pixels an end touches an edge, a wall or a side.
  - `type StandingWall = { at: number; op: WallOp }`; `standingWalls(ops): StandingWall[]`: every wall step no `wallErase` took away, in drawing order, `at` its place in `ops`.
  - `wallsAt(ops, x, y, tolerance): number[]`: places of standing walls whose line passes within `tolerance`.
  - `type Snap = { x: number; y: number; on: "first" | "touch" | null }`.
  - `type WallDraft = { points: number[]; startTouches: boolean }`: the wall in progress.
  - `snapPoint(x, y, reach, walls: readonly (readonly number[])[], draft: WallDraft | null, width, height): Snap`.
  - `placeCorner(draft: WallDraft | null, snap: Snap): { draft: WallDraft | null; wall: number[] | null }`.
  - `closeWall(draft: WallDraft, walls, width, height): number[] | null`: the wall as Escape finishes it, null when too little to close.
  - `closedWalls(walls, width, height): boolean[]`: per wall, whether both its ends touch.
  - `closedShapes(walls, width, height): boolean[]`: per wall, whether every wall in its shape is closed.
  - Every `walls` parameter is the walls' flat points, in the order given; results line up with it.

Rules the tests pin and the code follows:

- **Ends touching** (`closedWalls`): an end touches when within `TOUCH_PX` of the map's edge, of any side of any other wall, or of one of its own sides other than the side meeting at that end, counted by index (the start excludes side 0, the end excludes the last side). A loop, first point repeated last, is closed by this rule.
- **Shapes** (`closedShapes`): two walls are one shape when any side of one passes within `TOUCH_PX` of any side of the other (an end on it, or a crossing); shapes chain through shared walls. Never through the map's edge.
- **Snapping** (`snapPoint`), in this order, the nearest within `reach` winning within each tier:
  1. Corners: the draft's first corner when the draft has at least 3 corners (`on: "first"`); every corner of the other walls and the map's four corners (`"touch"`); the draft's own corners other than its first and its last two (`"touch"`).
  2. Lines: the other walls' sides, the draft's sides other than its last, the map's four edges, landing on the nearest point (`"touch"`).
  3. Neither: the point itself, `on: null`.
  The result is rounded to a tenth.
- **Placing a corner** (`placeCorner`): no draft starts one, `startTouches` being `snap.on === "touch"`. `"first"` finishes a loop (the first corner repeated last). `"touch"` with `startTouches` finishes the wall at the snap. A snap equal to the last corner is ignored. Otherwise the corner is added; a draft reaching `MAX_WALL_POINTS - 1` corners is finished by `closeWall`.
- **The closing line** (`closeWall`): fewer than 3 corners gives null. With `startTouches` false, the wall loops back to its first corner. With it true, the line runs from the last corner toward the first and stops at the nearest crossing past the last corner with another wall's side, one of the draft's own sides other than its last, or the map's edge; failing any, it ends on the first corner. The crossing is rounded to a tenth.

- [ ] **Step 1: Write the failing tests** in `fog-walls.test.ts`, on a 400 by 200 picture:

```ts
const W = 400, H = 200;

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
  const walls = [[100, 100, 300, 100], [0, 104, 50, 104]];
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
    let step = placeCorner(null, { x: 0, y: 50, on: "touch" });
    expect(step).toEqual({ draft: { points: [0, 50], startTouches: true }, wall: null });
    step = placeCorner(step.draft, { x: 400, y: 50, on: "touch" });
    expect(step).toEqual({ draft: null, wall: [0, 50, 400, 50] });

    let free = placeCorner(null, { x: 20, y: 20, on: null });
    free = placeCorner(free.draft, { x: 200, y: 50, on: "touch" });
    expect(free.wall).toBeNull();
    free = placeCorner(free.draft, { x: 20, y: 80, on: null });
    free = placeCorner(free.draft, { x: 20, y: 80, on: null }); // same point: ignored
    expect(free.draft?.points).toEqual([20, 20, 200, 50, 20, 80]);
    expect(placeCorner(free.draft, { x: 20, y: 20, on: "first" }).wall).toEqual([
      20, 20, 200, 50, 20, 80, 20, 20,
    ]);
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
```

- [ ] **Step 2: Run** `T src/lib/fog-walls.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/fog-walls.ts` to the interfaces and rules above, no React. The point-to-segment distance `toSegment` moves from `annotation-drawing.ts` into this file, exported, and `annotation-drawing.ts` imports it back for `marksAt`, so the two share one and no import runs in a circle. Segment-to-segment distance is zero when they cross, else the least of the four end-to-segment distances. A union-find over walls is enough for shapes; prune pairs whose bounding boxes, grown by `TOUCH_PX`, do not meet.

- [ ] **Step 4: Run** `T src/lib/fog-walls.test.ts`. Expected: PASS.

---

### Task 3: The hidden grid, the flood and the enclosed areas (`lib/fog-areas.ts`)

**Files:**
- Create: `apps/web/src/lib/fog-areas.ts`
- Test: `apps/web/src/lib/fog-areas.test.ts`

**Interfaces:**
- Consumes: `standingWalls`, `closedShapes` (Task 2); `MAX_FLOOD_RINGS`, `MAX_FLOOD_POINTS`, `WallOp` (Task 1).
- Produces:
  - `GRID_LONG_SIDE = 1024`.
  - `type Rings = number[][]`: each ring flat x then y, drawn as one path with the even-odd rule.
  - `floodAt(walls: readonly (readonly number[])[], width, height, x, y): Rings | null`: null for a click on a wall.
  - `enclosedAreas(walls, width, height): Rings`: from the walls given (the caller passes closed shapes' walls only).
  - `insideRings(rings: Rings, x, y): boolean`: even-odd.
  - `type StorytellerView = { walls: { op: WallOp; closed: boolean }[]; enclosed: Rings }`; `storytellerView(ops: readonly AnnotationOp[], width, height): StorytellerView`: the standing walls with their shapes' closed state, and the enclosed areas of the closed shapes.

The grid and the outline, decided here:

- The cell is `max(width, height) / GRID_LONG_SIDE`; columns `round(width / cell)`, rows `round(height / cell)` (at least 1 each), the cell's width and height then `width / columns` and `height / rows`, so the grid meets the picture's edges exactly.
- A cell is wall when some wall side passes within 2 cells of its centre. Any such band contains every cell the side passes through, so it is connected and a 4-connected fill cannot slip through it.
- The flood fills 4-connected from the clicked cell through free cells, then grows into wall cells only, up to 5 steps through wall cells (8-neighbors), so it reaches under its walls past their middle line without running along the wall network.
- The outline is traced along the region's cell edges into closed loops (each boundary edge used once; how a loop turns where two cells meet only at a corner does not matter under even-odd), collinear corners dropped, then simplified ring by ring (Ramer-Douglas-Peucker, tolerance 1 cell), coordinates mapped back to picture pixels and rounded to a tenth.
- Past the caps: keep the `MAX_FLOOD_RINGS` rings of largest area, then while the points exceed `MAX_FLOOD_POINTS` simplify again at twice the tolerance.
- Enclosed areas: label the free cells' 4-connected areas over the given walls; an area touching no edge is enclosed; of those touching an edge, the one of most cells is the outside and the rest are enclosed. The union of enclosed areas grows into wall cells as the flood does, and is traced and simplified the same way.

The tests below assume the 1024 grid; on a 1024 by 512 picture a cell is one pixel. If tuning the band, the growth or the tolerance is needed to pass them, the tests stand and the numbers move.

- [ ] **Step 1: Write the failing tests** in `fog-areas.test.ts`:

```ts
const W = 1024, H = 512;
const split = [[512, 0, 512, 512]];

describe("floodAt", () => {
  it("fills the whole picture when there are no walls", () => {
    const rings = floodAt([], W, H, 10, 10)!;
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(8);
    for (const [x, y] of [[0.5, 0.5], [1023.5, 511.5]]) expect(insideRings(rings, x, y)).toBe(true);
  });

  it("does nothing for a click on a wall", () => {
    expect(floodAt(split, W, H, 512, 256)).toBeNull();
  });

  it("reaches past a wall's middle line on both sides, and no further than a few pixels", () => {
    const left = floodAt(split, W, H, 100, 100)!;
    const right = floodAt(split, W, H, 900, 100)!;
    for (let y = 0.5; y < H; y += 0.5) {
      expect(insideRings(left, 512.5, y)).toBe(true);
      expect(insideRings(right, 511.5, y)).toBe(true);
    }
    expect(insideRings(left, 517, 256)).toBe(false);
    expect(insideRings(right, 507, 256)).toBe(false);
  });

  it("leaves no fog along a slanted wall when both sides are flooded, and draws it straight", () => {
    const slant = [[300, 0, 700, 512]];
    const left = floodAt(slant, W, H, 100, 256)!;
    const right = floodAt(slant, W, H, 900, 256)!;
    // Short of the picture's edges, where a point sits on the outline itself.
    for (let t = 0.001; t < 1; t += 0.001) {
      const [x, y] = [300 + 400 * t, 512 * t];
      expect(insideRings(left, x, y) && insideRings(right, x, y)).toBe(true);
    }
    // A staircase along a 650 px slant would be hundreds of corners.
    expect(left).toHaveLength(1);
    expect(left[0].length / 2).toBeLessThanOrEqual(8);
  });

  it("gives a square room a few corners, not a staircase", () => {
    const room = [[200, 100, 600, 100, 600, 400, 200, 400, 200, 100]];
    const rings = floodAt(room, W, H, 400, 250)!;
    expect(rings).toHaveLength(1);
    expect(rings[0].length / 2).toBeLessThanOrEqual(8);
  });

  it("fills the ring between a room and a room inside it, as an outline with a hole", () => {
    const rooms = [
      [100, 50, 900, 50, 900, 450, 100, 450, 100, 50],
      [400, 200, 600, 200, 600, 300, 400, 300, 400, 200],
    ];
    const rings = floodAt(rooms, W, H, 200, 100)!;
    expect(rings).toHaveLength(2);
    expect(insideRings(rings, 200, 100)).toBe(true);
    expect(insideRings(rings, 500, 250)).toBe(false);
    expect(insideRings(rings, 50, 25)).toBe(false);
  });

  // Review Focus 1: an end rounded to a tenth sits up to 0.07 px off the
  // wall it was snapped onto.
  it("does not leak past a wall end that stops just short of the wall it meets", () => {
    const walls = [[300, 0, 700, 512], [0, 256, 499.93, 256]];
    const rings = floodAt(walls, W, H, 100, 100)!;
    expect(insideRings(rings, 100, 400)).toBe(false);
  });

  // Review Focus 5.
  it("answers on a large map in its pixels, within the step's caps", () => {
    const rings = floodAt([[5000, 0, 5000, 6000]], 10_000, 6000, 1000, 1000)!;
    const points = rings.reduce((sum, ring) => sum + ring.length / 2, 0);
    expect(points).toBeLessThanOrEqual(MAX_FLOOD_POINTS);
    expect(Math.max(...rings.flat())).toBeLessThanOrEqual(10_000);
    expect(insideRings(rings, 5000, 3000)).toBe(true);
    expect(insideRings(rings, 5100, 3000)).toBe(false);
  });
});

describe("enclosedAreas", () => {
  it("encloses a room, and the smaller side of a wall from edge to edge", () => {
    const room = [[200, 100, 600, 100, 600, 400, 200, 400, 200, 100]];
    expect(insideRings(enclosedAreas(room, W, H), 400, 250)).toBe(true);
    expect(insideRings(enclosedAreas(room, W, H), 800, 450)).toBe(false);
    const side = enclosedAreas([[200, 0, 200, 512]], W, H);
    expect(insideRings(side, 100, 256)).toBe(true);
    expect(insideRings(side, 600, 256)).toBe(false);
    expect(enclosedAreas([], W, H)).toEqual([]);
  });
});

describe("storytellerView", () => {
  it("takes the enclosed areas' color off a room whose shape an open wall touches", () => {
    const room: AnnotationOp = { t: "wall", points: [200, 100, 600, 100, 600, 400, 200, 400, 200, 100] };
    const spur: AnnotationOp = { t: "wall", points: [600, 250, 800, 250] };
    const closed = storytellerView([room], W, H);
    expect(closed.walls).toEqual([{ op: room, closed: true }]);
    expect(insideRings(closed.enclosed, 400, 250)).toBe(true);
    const open = storytellerView([room, spur], W, H);
    expect(open.walls.map((wall) => wall.closed)).toEqual([false, false]);
    expect(open.enclosed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `T src/lib/fog-areas.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/fog-areas.ts` as decided above, no React: the grid in a `Uint8Array`, the fill and the labelling with an `Int32Array` queue, no recursion.

- [ ] **Step 4: Run** `T src/lib/fog-areas.test.ts`. Expected: PASS.

---

### Task 4: Drawing the flood, the walls and the enclosed areas' color

**Files:**
- Modify: `apps/web/src/lib/annotations.ts`, `apps/web/src/lib/annotation-drawing.ts`
- Test: `apps/web/src/lib/annotation-drawing.test.ts`, `apps/web/src/lib/annotation-render.test.ts`

**Interfaces:**
- Consumes: `FloodOp`, `WallOp` (Task 1); `StorytellerView`, `Rings` (Task 3).
- Produces:
  - In `annotations.ts`: `WALL_OPEN = { color: "#a5f3fc", outline: "#0c4a6e", width: 2 }` and `WALL_CLOSED = { color: "#1d4ed8", outline: "#ffffff", width: 4 }`, widths in screen pixels, the outline drawn 2 px wider under the line.
  - In `annotation-drawing.ts`: `TreeOptions.storyteller?: StorytellerView`; `ringsPath(rings): string` (`M x yL x y…Z` per ring, a tenth each).
  - Tree with `storyteller`: after the fog, `{ tag: "g", key: "walls", attrs: { "data-layer": "walls" } }` holding per wall an outline path then a line path, both `fill: "none"`, round caps and joins, `"vector-effect": "non-scaling-stroke"`, straight `M…L…` data (never `strokePath`). With enclosed rings and fog showing: the fog rect wrapped in a `g` (key `fog-open`) masked by `${maskId}-open` (white base, enclosed path black), and beside it a `g` (key `fog-enclosed`) masked by `${maskId}-enclosed` (black base, enclosed path white) holding a rect in `WALL_CLOSED.color` at the fog's opacity under the fog mask. The fog rect keeps `data-layer="fog"`.

- [ ] **Step 1: Write the failing tests** in `annotation-drawing.test.ts`, with the file's `size` and `parts`:

```ts
const room: AnnotationOp = { t: "wall", points: [10, 10, 100, 10, 100, 100, 10, 100, 10, 10] };
const flood: AnnotationOp = { t: "flood", mode: "reveal", rings: [[0, 0, 50, 0, 50, 50, 0, 50]] };

it("draws a flood into the mask as one even-odd path, and drops it after Cover all", () => {
  const { mask } = parts(annotationTree([room, flood], size));
  expect(mask?.children?.slice(1)).toEqual([
    { tag: "path", attrs: { d: "M0 0L50 0L50 50L0 50Z", "fill-rule": "evenodd", fill: "black" } },
  ]);
  const covered = parts(annotationTree([flood, { t: "fogAll", mode: "cover" }], size));
  expect(covered.mask?.children).toHaveLength(1);
});

// Review Focus 3.
it("keeps a flood as it was when a wall it was bounded by is erased", () => {
  const before = parts(annotationTree([room, flood], size)).mask;
  const after = parts(annotationTree([room, flood, { t: "wallErase", targets: [0] }], size)).mask;
  expect(after).toEqual(before);
});

it("leaves walls out unless the storyteller's view is asked for, and draws them above the fog then", () => {
  expect(parts(annotationTree([room], size)).children.some((n) => n.key === "walls")).toBe(false);
  const view = { walls: [{ op: room as WallOp, closed: true }], enclosed: [] };
  const { children, fog } = parts(annotationTree([room], { ...size, storyteller: view }));
  const walls = children.find((n) => n.key === "walls")!;
  expect(children.indexOf(walls)).toBeGreaterThan(children.indexOf(fog!));
  expect(walls.children?.map((n) => n.attrs.stroke)).toEqual([WALL_CLOSED.outline, WALL_CLOSED.color]);
  expect(walls.children?.[1].attrs).toMatchObject({
    d: "M10 10L100 10L100 100L10 100L10 10",
    "stroke-width": WALL_CLOSED.width,
    "vector-effect": "non-scaling-stroke",
  });
});

it("draws the storyteller's fog over an enclosed area in the closed walls' blue, only while the fog shows", () => {
  const view = { walls: [{ op: room as WallOp, closed: true }], enclosed: [[10, 10, 100, 10, 100, 100, 10, 100]] };
  const tree = annotationTree([room], { ...size, fogOpacity: 40, storyteller: view });
  const svg = toSvgString(tree);
  expect(svg).toContain(`fill="${WALL_CLOSED.color}" fill-opacity="0.4"`);
  expect(toSvgString(annotationTree([room], { ...size, fogOpacity: 0, storyteller: view }))).not.toContain(
    `fill="${WALL_CLOSED.color}"`,
  );
});

it("runs a stroke straight into and out of a point given twice", () => {
  expect(strokePath([0, 0, 10, 0, 10, 0, 20, 10])).toBe("M0 0Q10 0 10 0Q10 0 15 5L20 10");
});
```

and in `annotation-render.test.ts` (Review Focus 2), beside its existing render tests:

```ts
it("writes no wall and no wall color into the players' copy", async () => {
  // The SVG the render composes, from a drawing with a closed room wall and a flood
  // (`room` and `flood` as in annotation-drawing.test.ts).
  const svg = toSvgString(annotationTree([room, flood], { width: 400, height: 200, fogOpacity: 100, maskId: "fog" }));
  for (const text of [WALL_OPEN.color, WALL_CLOSED.color, 'data-layer="walls"', "-enclosed"]) {
    expect(svg).not.toContain(text);
  }
});
```

(If `annotation-render.test.ts` already intercepts the SVG handed to sharp, assert on that instead of rebuilding it.)

- [ ] **Step 2: Run** `T src/lib/annotation-drawing.test.ts` and `T src/lib/annotation-render.test.ts`. Expected: the new tests FAIL; the doubled-point `strokePath` test already PASSES, pinning behavior Task 6 relies on.

- [ ] **Step 3: Implement** the wall looks in `annotations.ts`; in `annotation-drawing.ts` the flood case of `shapeOf` (cached like the rest), floods among the fog steps after the last `fogAll`, the storyteller part as specified above, and the wall nodes cached per wall step and closed state so a redraw under a moving pointer reuses them. `annotation-render.ts` does not change: it never passes `storyteller`. Bring the file's top comment up to date: the flood in the mask, and the storyteller-only part the server never asks for.

- [ ] **Step 4: Run** both files. Expected: PASS.

---

### Task 5: Saving walls and floods

**Files:**
- Modify: `apps/web/src/components/annotations/actions.ts`, `apps/web/src/components/annotations/use-annotation-session.ts`, `db/custom/create_attachment_annotations_table.sql` (comment only)
- Test: `apps/web/src/components/annotations/actions.test.ts` (database), `apps/web/src/components/annotations/use-annotation-session.test.tsx`

**Interfaces:**
- Consumes: `isWallStep`, extended `eraseRefusal` (Task 1).
- Produces: `sa_saveAnnotation` treating a **walls-only save** (every appended step and every step taken off by `keep` is a wall step, and neither the players' fog nor the fog's color changes) as: revision up by one; the picture's on/off untouched; no `publishPictureChanged`; no `renderPlayersCopyLater`; and when the copy was current before (`playerRevision === revision`) `playerRevision` set to the new revision with it. Every other save as today.

- [ ] **Step 1: Write the failing tests** in `actions.test.ts`, with its fixtures:

```ts
const wall: AnnotationOp = { t: "wall", points: [0, 50, 400, 50] };
const flood: AnnotationOp = { t: "flood", mode: "reveal", rings: [[0, 0, 400, 0, 400, 50, 0, 50]] };

it("saves walls without turning the picture on, publishing, or asking for a copy", async () => {
  await actions.sa_openAnnotation(map);
  expect(await actions.sa_saveAnnotation(map, { baseRevision: 0, keep: 0, append: [wall] })).toEqual({ ok: true, revision: 1 });
  expect(await actions.sa_saveAnnotation(map, { baseRevision: 1, keep: 1, append: [{ t: "wallErase", targets: [0] }] })).toEqual({ ok: true, revision: 2 });
  // Undo of the wall eraser's drag alone is walls-only too.
  expect(await actions.sa_saveAnnotation(map, { baseRevision: 2, keep: 1, append: [] })).toEqual({ ok: true, revision: 3 });
  expect(await stored()).toMatchObject({ isActive: false, revision: 3, ops: [wall] });
  expect(renderPlayersCopyLater.mock.callCount()).toBe(0);
  expect(mocks.published.publishPictureChanged.mock.callCount()).toBe(0);
});

it("keeps a current players' copy current through a walls-only save, and a behind one behind", async () => {
  await db.insert(tables.attachmentAnnotations).values({
    idAttachment: map, width: 400, height: 200, isActive: true, revision: 3, playerRevision: 3, playerUrl: COPY_URL,
  });
  await actions.sa_saveAnnotation(map, { baseRevision: 3, keep: 0, append: [wall] });
  expect(await stored()).toMatchObject({ revision: 4, playerRevision: 4, playerUrl: COPY_URL });
  await db.update(tables.attachmentAnnotations).set({ playerRevision: 2 }).where(eq(tables.attachmentAnnotations.idAttachment, map));
  await actions.sa_saveAnnotation(map, { baseRevision: 4, keep: 1, append: [wall] });
  expect(await stored()).toMatchObject({ revision: 5, playerRevision: 2 });
});

// Review Focus 4.
it("makes an ordinary save of walls mixed with a flood, and of a flood undone", async () => {
  await actions.sa_openAnnotation(map);
  await actions.sa_saveAnnotation(map, { baseRevision: 0, keep: 0, append: [wall, flood] });
  expect(await stored()).toMatchObject({ isActive: true, revision: 1 });
  expect(renderPlayersCopyLater.mock.callCount()).toBe(1);
  await actions.sa_setAnnotated(map, false);
  renderPlayersCopyLater.mock.resetCalls();
  await actions.sa_saveAnnotation(map, { baseRevision: 1, keep: 1, append: [] });
  expect(await stored()).toMatchObject({ isActive: true, ops: [wall] });
  expect(renderPlayersCopyLater.mock.callCount()).toBe(1);
});

it("refuses a wall eraser that names anything but a wall", async () => {
  await annotate();
  await actions.sa_saveAnnotation(map, { baseRevision: 0, keep: 0, append: [pen, wall] });
  expect(await actions.sa_saveAnnotation(map, { baseRevision: 1, keep: 2, append: [{ t: "wallErase", targets: [0] }] })).toEqual({
    ok: false,
    error: "A wall eraser can only take away a wall drawn before it.",
  });
});
```

and in `use-annotation-session.test.tsx`, with its `elapse` and mocks:

```ts
it("counts a flood's outline toward a save's size, so two large ones go in two saves", async () => {
  const ring = Array.from({ length: 30_000 }, (_, i) => i % 400);
  const big: AnnotationOp = { t: "flood", mode: "reveal", rings: [ring] };
  // render the hook, draw(big) twice, elapse(SAVE_DELAY_MS), settle the first save
  // then expect sa_saveAnnotation's calls' append lengths to be [1, 1]
});
```

(write it in the shape of the file's existing backlog test, which does the same for long pen strokes.)

- [ ] **Step 2: Run** `T src/components/annotations/actions.test.ts` (needs the local database; `just migrate` first if it is behind) and `T src/components/annotations/use-annotation-session.test.tsx`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** In `sa_saveAnnotation`'s transaction, decide `wallsOnly` from `append`, `row.ops.slice(keep)`, `changesOpacity` and `changesColor`; for it write `ops`, `revision`, `idUpdatedByUser` and, when `row.playerRevision === row.revision`, `playerRevision`; return without `turnedOn` so neither publishing nor the render follows. Update the action's docblock (walls are the storyteller's alone, so their saves leave what the players see alone). In `use-annotation-session.ts`, `coordinatesOf` counts a wall's points, a flood's ring coordinates and a wall eraser's targets. In the SQL file, the `ops` comment lists wall, wall eraser and flood among the steps and says walls are never drawn into the players' copy.

- [ ] **Step 4: Run** both test files. Expected: PASS.

---

### Task 6: The stage: wall pen, wall eraser, flood, straight pen

**Files:**
- Modify: `apps/web/src/components/annotations/annotator-stage.tsx`, `apps/web/src/components/annotations/annotation-overlay.tsx`
- Test: `apps/web/src/components/annotations/annotator-stage.test.tsx`, `apps/web/src/components/annotations/annotation-overlay.test.tsx`

**Interfaces:**
- Consumes: `standingWalls`, `wallsAt`, `snapPoint`, `Snap`, `WallDraft` (Task 2); `floodAt`, `storytellerView` (Task 3); `WALL_OPEN` (Task 4).
- Produces:
  - `AnnotationTool` gains `"flood" | "wall" | "wallEraser"`.
  - `SNAP_REACH_PX = 10` (screen pixels, as `ERASER_REACH_PX`).
  - New stage props: `wallDraft?: WallDraft | null`, `onWallCorner?: (snap: Snap) => void`.
  - The overlay works out `storytellerView` itself and passes it to `annotationTree` as `storyteller`, again only when the standing walls change: a ref holds the last walls (compared step by step by identity) and their view.

Behavior:

- **Wall pen and flood act on a click**: the pointer that pressed is let go without a second pointer coming down meanwhile. The wall pen hands `onWallCorner` the snapped point at the release (`snapPoint` with the reach in picture pixels). The flood calls `floodAt` with the standing walls' points at the release and draws `{ t: "flood", mode, rings }` when it is not null.
- **While the wall pen is in hand**, the stage draws above the overlay, in `WALL_OPEN`'s look with non-scaling strokes: the draft's corners joined, a line from the last corner to the snapped hover point, and a small ring at the hover point when it snaps (`on` not null). Cursor: crosshair for the wall pen and the flood.
- **The overlay's walls** come from the drawing with the step under the pointer on the end, so a wall eraser's drag hides each wall it takes as it goes, as the eraser does marks.
- **The wall eraser** drags as the eraser does (same reach, same ring for a cursor, swept between samples), gathering `wallsAt` instead of `marksAt`, and draws `{ t: "wallErase", targets }`; one that touched no wall is no step. `erase` takes which finder to use rather than being copied.
- **Straight pen**: a pen move whose event (or coalesced sample) has `shiftKey` starts a straight run from the stroke's last point, which is given twice (the corner); while Shift stays down each move replaces the run's end; the first move without Shift gives the run's end twice and carries on freehand. A run that would pass `MAX_STROKE_POINTS` finishes the stroke first and starts the next from its last point, as a long stroke does now.

- [ ] **Step 1: Write the failing tests** in `annotator-stage.test.tsx`, with the file's `stage`, `drag` and 400 by 200 picture shown at 200 by 100 (a screen pixel is two picture pixels, the reach 20):

```ts
const click = (surface: HTMLElement, x: number, y: number) => drag(surface, [[x, y]]);

it("hands the wall pen's clicks over snapped, onto the edge or a wall, else where they land", () => {
  const onWallCorner = mock.fn((_snap: Snap) => {});
  const surface = stage({ tool: "wall", onWallCorner, ops: [{ t: "wall", points: [200, 0, 200, 200] }] });
  click(surface, 1, 50);
  click(surface, 95, 50);
  click(surface, 50, 50);
  expect(onWallCorner.mock.calls.map((c) => c.arguments[0])).toEqual([
    { x: 0, y: 100, on: "touch" },
    { x: 200, y: 100, on: "touch" },
    { x: 100, y: 100, on: null },
  ]);
  expect(onDraw.mock.callCount()).toBe(0);
});

it("floods the area clicked, and nothing for a click on a wall", () => {
  const wall: AnnotationOp = { t: "wall", points: [200, 0, 200, 200] };
  const surface = stage({ tool: "flood", mode: "cover", ops: [wall] });
  click(surface, 100, 50);
  expect(onDraw.mock.callCount()).toBe(0);
  click(surface, 25, 50);
  const op = onDraw.mock.calls[0].arguments[0] as FloodOp;
  expect(op).toMatchObject({ t: "flood", mode: "cover" });
  expect(insideRings(op.rings, 50, 100)).toBe(true);
  expect(insideRings(op.rings, 300, 100)).toBe(false);
});

const crossed: AnnotationOp[] = [
  { t: "wall", points: [0, 40, 400, 40] },
  { t: "pen", color: "#000000", width: 2, points: [0, 160, 400, 160] },
];

it("takes walls away with the wall eraser, and never a mark", () => {
  drag(stage({ tool: "wallEraser", ops: crossed }), [[10, 20], [10, 80]]);
  expect(onDraw.mock.calls.map((c) => c.arguments[0])).toEqual([{ t: "wallErase", targets: [0] }]);
});

it("never takes a wall away with the annotations' eraser", () => {
  drag(stage({ tool: "eraser", ops: crossed }), [[10, 20], [20, 20]]);
  expect(onDraw.mock.callCount()).toBe(0);
});

it("draws the pen straight while Shift is held, and freehand again once it is let go", () => {
  const surface = stage({ tool: "pen" });
  fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
  fireEvent.pointerMove(surface, { clientX: 30, clientY: 10, pointerId: 1, shiftKey: true });
  fireEvent.pointerMove(surface, { clientX: 50, clientY: 30, pointerId: 1, shiftKey: true });
  fireEvent.pointerMove(surface, { clientX: 60, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(surface, { clientX: 60, clientY: 30, pointerId: 1 });
  expect(onDraw.mock.calls.map((c) => c.arguments[0])).toEqual([
    { t: "pen", color: "#e53935", width: 3, points: [20, 20, 20, 20, 100, 60, 100, 60, 120, 60] },
  ]);
});
```

and in `annotation-overlay.test.tsx`:

```ts
it("draws walls above the fog whether the fog is shown or not", () => {
  // render AnnotationOverlay with ops [a closed room wall] at fogOpacity 0, then 50;
  // expect a [data-layer="walls"] group in both, after the [data-layer="fog"] rect in the second.
});
```

- [ ] **Step 2: Run** `T src/components/annotations/annotator-stage.test.tsx` and `T src/components/annotations/annotation-overlay.test.tsx`. Expected: the new tests FAIL. If `shiftKey` does not reach the handler under jsdom, check `src/test/setup.ts` for the PointerEvent stand-in and pass `shiftKey` through it.

- [ ] **Step 3: Implement** the stage and the overlay as above. Update the stage's docblock for the new tools, the click rule, and the straight run.

- [ ] **Step 4: Run** both files. Expected: PASS.

---

### Task 7: The toolbar and the annotator: tools, Finish wall, Escape, Undo, the opening tool

**Files:**
- Create: `apps/web/src/components/annotations/use-wall-draft.ts`
- Modify: `apps/web/src/components/annotations/annotator-toolbar.tsx`, `apps/web/src/components/annotations/annotator-dialog.tsx`
- Test: `apps/web/src/components/annotations/use-wall-draft.test.tsx`, `apps/web/src/components/annotations/annotator-toolbar.test.tsx`, `apps/web/src/components/annotations/annotator-dialog.test.tsx`

**Interfaces:**
- Consumes: `placeCorner`, `closeWall`, `standingWalls`, `WallDraft`, `Snap` (Task 2); the stage's new props and tools (Task 6).
- Produces:
  - `useWallDraft(walls: readonly (readonly number[])[], width: number, height: number, onWall: (points: number[]) => void): { draft: WallDraft | null; place: (snap: Snap) => void; finish: () => boolean; undo: () => boolean }`. `finish` closes the draft as Escape does (`closeWall`, dropping it when null) and `undo` takes back its last corner (with one left, drops it); each returns whether there was a draft. The draft is mirrored in a ref so a key handler reads it as it stands.
  - Toolbar props `wallInProgress: boolean`, `onFinishWall: () => void`. The fog half's tools: the `Fog tool` radiogroup gains Flood (`PaintBucket`) after Fog rectangle; Reveal/Cover shows for brush, rectangle and flood; a `Wall tool` radiogroup after Clear all with Wall pen (`BrickWall`) and Wall eraser (`Pickaxe`); Finish wall (`CheckLine`, tooltip `Finish wall (Escape)`) after it while `wallInProgress`. Tooltips: `Flood: reveal or cover the area clicked, up to its walls`; `Wall pen: click corner by corner, Escape to finish`; `Wall eraser: drag over walls to take them away`.
  - `AnnotatorDialog` gives `Dialog.Root` an `onEscapeKeyDown` that calls a `takeEscape` ref (`useRef<(() => boolean) | null>`) handed to `AnnotatorBody` and on to `AnnotatorWorkspace`, and calls `event.preventDefault()` when it returns true (zag then leaves the dialog open).
  - `AnnotatorWorkspace`: the tool starts as `"flood"` when `standingWalls(annotation.ops)` is not empty, else `"brush"`; a tool change, Escape (through `takeEscape`) and Finish wall call `walls.finish()` first; Ctrl+Z and the Undo button call `walls.undo()` and fall back to `session.undo()` when it returns false; Undo is enabled while a draft exists. Closing the annotator mid-wall drops the draft: it is not a step yet, and finishing it during unmount would race the session's own save on leaving.

- [ ] **Step 1: Write the failing tests.** In `use-wall-draft.test.tsx` (`renderHook`):

```ts
it("finishes a wall on a touching click, closes one on finish, and takes corners back on undo", () => {
  const onWall = mock.fn((_points: number[]) => {});
  const { result } = renderHook(() => useWallDraft([], 400, 200, onWall));
  act(() => result.current.place({ x: 20, y: 20, on: null }));
  act(() => result.current.place({ x: 80, y: 20, on: null }));
  act(() => result.current.place({ x: 80, y: 80, on: null }));
  act(() => void expect(result.current.undo()).toBe(true));
  expect(result.current.draft?.points).toEqual([20, 20, 80, 20]);
  act(() => result.current.place({ x: 80, y: 80, on: null }));
  act(() => void expect(result.current.finish()).toBe(true));
  expect(onWall.mock.calls.map((c) => c.arguments[0])).toEqual([[20, 20, 80, 20, 80, 80, 20, 20]]);
  expect(result.current.draft).toBeNull();
  act(() => void expect(result.current.finish()).toBe(false));
  act(() => void expect(result.current.undo()).toBe(false));
});
```

In `annotator-toolbar.test.tsx`, with its render helper:

```ts
it("offers the flood among the fog tools, under Reveal or Cover", () => { /* tool="flood": radio "Flood" checked in "Fog tool"; radiogroup "Fog mode" present */ });
it("offers the wall pen and wall eraser, without Reveal or Cover", () => { /* tool="wall": radio "Wall pen" checked in "Wall tool"; no "Fog mode" */ });
it("shows Finish wall only while a wall is being drawn", () => {
  /* wallInProgress false: no button "Finish wall"; true: clicking it calls onFinishWall once */
});
```

In `annotator-dialog.test.tsx`, with its mocks and `measured`:

```ts
const walled: PictureAnnotation = { ...drawing, ops: [{ t: "wall", points: [200, 0, 200, 200] }] };

it("opens with the flood in hand on a drawing with walls, and the brush on one without", async () => {
  /* open on `walled`: radio "Flood" checked; on `drawing`: radio "Fog brush" checked */
});

it("finishes a wall on Escape and stays open, and closes on the next Escape", async () => {
  /* choose "Wall pen"; click the surface at (20,20), (60,20), (60,60) screen;
     userEvent.keyboard("{Escape}"): onOpenChange not called; after SAVE_DELAY the save's append is
     [{ t: "wall", points: [40, 40, 120, 40, 120, 120, 40, 40] }];
     Escape again: onOpenChange called with false */
});

it("takes back the last corner on Ctrl+Z while a wall is drawn, saving nothing", async () => {
  /* two corners; Ctrl+Z: "Finish wall" still shown; Ctrl+Z: gone; no save, and the drawing's own
     last step is still there */
});

it("finishes the wall in progress when another tool is taken", async () => {
  /* three corners, then click "Fog brush": a wall step is saved */
});
```

Write the bodies in the files' existing style; the comments say exactly what each asserts.

- [ ] **Step 2: Run** the three files with `T`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement** `use-wall-draft.ts`, the toolbar, and the dialog as specified. Update the toolbar's docblock (the fog half's tools, the walls group, Finish wall) and the dialog's (Escape and Undo while a wall is drawn, the opening tool).

- [ ] **Step 4: Run** the three files. Expected: PASS.

---

### Task 8: Glossary, whole-suite checks, and a look in the browser

**Files:**
- Modify: `GLOSSARY.md`

- [ ] **Step 1: Glossary.** Under Annotated pictures: add **Wall** (drawn with the Wall pen corner by corner on the fog, snapping to the edge and other walls; closed or open, a shape's colors; never in the players' copy; the Wall eraser), and **Flood** (the fog tool that reveals or covers the area clicked, bounded by every wall and the edges, saved as its outline so later wall changes never change it). In **Annotated**, after "Any change made in the annotator turns it on too", add that changes to walls alone are the exception, and leave a current players' copy current. In **Drawing**, add walls, the wall eraser's drags and floods to the step list. In **Annotator**, add Flood, Wall pen, Wall eraser and Finish wall to the fog half's list, the opening tool, and Escape finishing a wall.

- [ ] **Step 2: Whole suite and checks.** From `apps/web`: `npm run typecheck`, `npm run lint`, then from the root `just test`. Expected: all clean and green; any failure is fixed in the task that owns the code, not skipped.

- [ ] **Step 3: Look at it.** `just dev`, sign in locally, open a picture in the Claude sandbox story 40418 (never one of the user's stories), and check by eye: walls pale then deep blue once closed; the enclosed area's fog blue at My fog's opacity; walls shown with Show fog off; a flood on each side of a wall leaving no strip; Escape finishing a wall and then closing the annotator; Shift making a straight pen line; the picture's preview outside the annotator showing no walls. Report what was seen, including anything that looks off.

---

### Task 9: Fog sliders from 50 to 100, and brighter fog colors (added at the user's request, 2026-11-23)

The user asked, during the run: "for the My fog, let's have the fog % bars go from 50-100 (they can enter values in the edit boxes from 0-100 still), and let's have the storyteller colors be brighter so that they stand out." Asked which, they chose **both fog sliders** and **the Fog color swatches**.

**Files:**
- Modify: `apps/web/src/components/annotations/annotator-toolbar.tsx`, `apps/web/src/lib/annotations.ts`
- Test: `apps/web/src/components/annotations/annotator-toolbar.test.tsx`, `apps/web/src/lib/annotations.test.ts` (create it if it does not exist)

**Interfaces:**
- Produces: `FOG_SLIDER = { min: 50, max: 100 } as const` in `annotations.ts` (the range both fog sliders offer); the typed percentage boxes keep taking any whole number from 0 to 100. `FOG_COLORS` with the new values below; `FOG_COLOR` unchanged.

Decided:

- **Both fog sliders (My fog, Players' fog) run from 50 to 100.** The typed box beside each still takes 0 to 100 and commits as today. A value under 50 (typed, or saved before) shows its own number in the box and the slider's thumb at the slider's start, and showing it commits nothing: no `onCommit` until the storyteller drags the slider or types a new number. Dragging the slider gives 50 to 100. The pen Width and Brush size sliders do not change.
- **Fog colors:** five of the eight swatches are brightened so they stand out from each other and from a dark map. Slate (`#1b1d23`) stays: it is `FOG_COLOR`, the database column's default (`db/custom/create_attachment_annotations_table.sql`) and every existing drawing's color, and changing it would need a migration and leave those drawings on a color no longer offered. Black and White stay. Labels stay. New values:
  - Storm `#4a5160` → `#7b8599`
  - Night `#16233d` → `#2f5fb3`
  - Forest `#1d3324` → `#3a8f5c`
  - Mist `#cfd4dc` → `#e6ebf2`
  - Parchment `#e9dcbf` → `#f5e6b8`
  A drawing already saved in an old Storm, Night, Forest, Mist or Parchment keeps its color (stored data is never rewritten); its swatch simply shows none ticked until a new one is picked.

- [ ] **Step 1: Write the failing tests.** In `annotator-toolbar.test.tsx`, with its `slider` helper and render helper:

```ts
it("offers both fogs' sliders from 50 to 100", () => {
  for (const name of ["My fog", "Players' fog"]) {
    expect(slider(bar, name)).toHaveAttribute("aria-valuemin", "50");
    expect(slider(bar, name)).toHaveAttribute("aria-valuemax", "100");
  }
});

it("takes a fog under 50 typed in, and shows one without committing it", () => {
  // Render with ownFog 30: the "My fog percentage" box shows 30 and onOwnFogChange is not called.
  // Type 20 into "Players' fog percentage" and press Enter: onPlayersFogChange called once with 20.
});
```

In `annotations.test.ts`:

```ts
it("keeps Slate as the default fog color and offers the brighter swatches", () => {
  expect(FOG_COLORS[0]).toEqual({ value: FOG_COLOR, label: "Slate" });
  expect(FOG_COLOR).toBe("#1b1d23");
  expect(FOG_COLORS.map((c) => c.value)).toEqual([
    "#1b1d23", "#000000", "#7b8599", "#2f5fb3", "#3a8f5c", "#e6ebf2", "#f5e6b8", "#ffffff",
  ]);
});
```

- [ ] **Step 2: Run** both files with `T`. Expected: the new tests FAIL (min 0, old colors).

- [ ] **Step 3: Implement.** `ToolbarSlider` takes the slider's range from its props as now; the fog sliders pass `FOG_SLIDER`, and the `PercentField` keeps its own 0 to 100 check. Make sure a value below the slider's `min` neither throws nor makes the slider report a change on render (zag may clamp the thumb; it must not call `onValueChangeEnd`). Update `FOG_COLORS` and its docblock (brighter so they stand out; Slate kept as the stored default). Update the toolbar's docblock if it states the sliders' range.

- [ ] **Step 4: Run** both files and `annotator-dialog.test.tsx`. Expected: PASS.

---

### Task 10: Every area blue once walls divide the map's edge (user's correction, 2026-11-23)

The user, on their tower map where walls run out to the map's edges, reported: "the upper left area is not blue and it should be". The spec's rule made the largest edge-touching area the uncolored outside; on that map it is the kitchen plus the outer ring, a room to the storyteller.

**Files:**
- Modify: `apps/web/src/lib/fog-areas.ts` (`enclosedAreas`), `docs/superpowers/specs/2026-11-20-fog-walls-and-flood-design.md` (the "The outside" bullet, to the new rule), `GLOSSARY.md` (only if it states the old outside rule)
- Test: `apps/web/src/lib/fog-areas.test.ts`

Decided (supersedes the spec's "The outside" bullet):

- Areas are still worked out from the walls of closed shapes only, and an area that touches no edge is still enclosed.
- **When exactly one area touches the map's edge**, the closed walls do not divide the edge: that area is the outside and gets no color (rooms drawn in the middle of a map, including a room joined to the edge by a single wall).
- **When two or more areas touch the edge**, the walls divide the map: every area is enclosed, the edge-touching ones included. A wall from edge to edge therefore colors both sides.
- The outside, when there is one, is still what the enclosed areas grow against under walls; with no outside, the enclosed areas grow under every wall (as when no area touches the edge today).

- [ ] **Step 1: Write the failing tests** in `fog-areas.test.ts` (1024×512):
  - the existing "encloses a room, and the smaller side of a wall from edge to edge" test changes: a wall from edge to edge (`[[200, 0, 200, 512]]`) now encloses both sides (`insideRings(side, 100, 256)` and `insideRings(side, 600, 256)` both true); rename the test to say so. The room part stays: a lone room's surroundings are not enclosed.
  - a room joined to the left edge by one wall (`[[200,100,600,100,600,400,200,400,200,100],[0,250,200,250]]`): only one area touches the edge, so the room is enclosed and (800, 450) is not.
  - the user's case in small: walls dividing the map into several edge-touching areas, e.g. a vertical wall `[300,0,300,512]`, a horizontal wall `[0,300,300,300]` and `[300,200,1024,200]`: the largest edge-touching area (for example the one right of x=300 below y=200) is enclosed, as are the others: points (150,150), (150,400), (600,100) and (600,400) are each inside the enclosed rings.
  - `storytellerView` with the same walls (all closed) colors every area.
- [ ] **Step 2: Run** `T src/lib/fog-areas.test.ts`. Expected: the new and changed tests FAIL.
- [ ] **Step 3: Implement** in `enclosedAreas`: count the edge-touching labels; with one, it is the outside; with two or more, there is no outside. Update the function's docblock and the file's comments. Bring the spec's "The outside" bullet to the rule above (say it was changed at the user's request), and the glossary if it states the old rule.
- [ ] **Step 4: Run** `T src/lib/fog-areas.test.ts` and `T src/components/annotations/annotation-overlay.test.tsx`. Expected: PASS.

---

### Task 11: "Image is covered in fog" over a fully fogged picture (user's request, 2026-11-23)

The user asked: "in an image preview that is fully covered by fog of war, add a text overlay that says 'image is covered in fog'". Asked, they chose: **the storyteller's previews and the players' pictures too**, and **only when nothing can be seen** (no part revealed and Players' fog at 100%).

**Files (the implementer finds every surface):**
- Modify: `apps/web/src/db/attachment-url.ts` (a shared SQL fragment beside `shownUrl`, and the flag carried wherever a players' copy URL is selected for a storyteller's preview or a player's picture), `apps/web/src/lib/annotations.ts` / `apps/web/src/lib/attachments.ts` (the types that carry a shown URL gain the flag), every component that shows a players' copy as a picture to the storyteller (pill previews, the Attachments card, play-mode panels under `components/run/`) or to a player.
- Create: one shared component for the overlay (e.g. `apps/web/src/components/annotations/fog-covered-note.tsx`), used by every surface.
- Test: the SQL fragment against the database (beside the existing db tests for these reads), the shared component, and at least one storyteller surface and one player surface showing the note.

Decided:

- **Fully covered**, worked out in SQL from the stored drawing (no migration, no new column): the drawing is on (`is_active`), its players' copy is rendered (`player_url is not null`), `fog_opacity_players >= 100`, and nothing is revealed: the last `fogAll` step, if any, is a Cover all (`mode = 'cover'`), and no `brush`, `rect` or `flood` step after it (after the start when there is none) has `mode = 'reveal'`. A drawing with no `fogAll` starts fogged whole (`annotationTree`'s base). Walls, wall eraser drags and pen marks do not matter. One fragment, reused by every query; computed with `jsonb_array_elements ... with ordinality`, never by loading `ops` into the app.
- **Text:** "Image is covered in fog" (the user's words, in the app's sentence case), centered over the picture, readable on any fog color (light text on a translucent dark backing), not blocking clicks on the picture (pointer-events none) and not hiding the picture's own controls.
- **Where:** every place the storyteller is shown a players' copy as a picture (`shownUrl` and its siblings), and every place a player is shown one (`playerSceneElementImageUrl` and any other player read of a players' copy). Not inside the annotator (the storyteller's own view there is the drawing, not the copy). Where the raw picture is shown (drawing off, or the copy not yet rendered), no note.
- The note is presentational only: it adds nothing to the players' copy image itself.

- [ ] **Step 1: Find every surface** and list them in the report (file, component, storyteller or player).
- [ ] **Step 2: Write the failing tests**: the SQL fragment on throwaway fixtures (covered: new drawing; covered: reveal then Cover all; not covered: a reveal brush/rect/flood after the last Cover all; not covered: Clear all last; not covered: opacity 90; not covered: off; not covered: copy not rendered); the shared component renders the text; one storyteller surface and one player surface show it for a covered picture and not for an uncovered one.
- [ ] **Step 3: Run** them. Expected: FAIL.
- [ ] **Step 4: Implement** the fragment, carry the flag through the reads and types, the shared component, and use it on every surface found in Step 1.
- [ ] **Step 5: Run** the new tests and every test file of every module changed; typecheck and lint. Expected: PASS.

---

### Task 12: A wall pen click off the picture lands on its edge (user's request, 2026-11-23)

The user asked: "when I draw a line off the image into the surrounding area, can we have the wall end at the edge, rather than disappear?" Today the drawing surface is exactly the picture: a click in the area around it (the annotator's scroll area, `Box flex="1" … p="4" bg="bg.muted"` in `annotator-dialog.tsx`) never reaches the stage, and the wall pen's preview line vanishes on leaving the picture (`onPointerLeave`).

**Files:**
- Modify: `apps/web/src/components/annotations/annotator-stage.tsx`, `apps/web/src/components/annotations/annotator-dialog.tsx` (only if the surrounding area has to move into the stage)
- Test: `apps/web/src/components/annotations/annotator-stage.test.tsx`

Decided:

- **While the Wall pen is in hand**, the whole surrounding area of the annotator (the space around the picture inside its scroll area, padding included) takes the pen's pointer events. A position there maps to the picture's pixels through the picture's own box and is clamped onto the picture (`pointOf` already clamps), so a click off the picture lands on the nearest point of its edge, and past a corner on that corner; `snapPoint` then gives it as a touch (`on: "touch"`), so a wall that started touching ends there, and one that started free gets an edge corner.
- **The preview** (the line from the last corner and the snap ring) follows the pointer into the surrounding area, drawn to the clamped edge point; it disappears only when the pointer leaves the surrounding area too.
- **Every other tool is unchanged**: a press in the surrounding area does nothing (no stroke starts, no flood, no erase). Strokes already under way keep their pointer capture as today.
- **No look change**: the surrounding area keeps its size, padding and color; the cursor over it is the crosshair while the Wall pen is in hand.
- The click rule stays: the pointer that pressed is released with no second pointer meanwhile.

- [ ] **Step 1: Write the failing tests** in `annotator-stage.test.tsx`, with the file's helpers (the picture 400×200 shown at 200×100 at the surface's measured box): with `tool: "wall"`, a click in the surrounding area left of the picture at the height of screen y 50 hands `onWallCorner` `{ x: 0, y: 100, on: "touch" }`; one above the picture at screen x 50 gives `{ x: 100, y: 0, on: "touch" }`; one beyond the bottom-right corner gives `{ x: 400, y: 200, on: "touch" }`; hovering in the surrounding area with a draft draws the preview line ending on the clamped edge point; with `tool: "pen"` (and `"flood"`), a press and release in the surrounding area draws nothing.
- [ ] **Step 2: Run** `T src/components/annotations/annotator-stage.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Give the stage an outer area that fills the scroll area (taking over its padding and background so the look is unchanged, and the dialog's Box then holds it without its own padding) and handles the wall pen's pointer events there, mapping through the inner picture box; other tools ignore presses there. Update the stage's docblock.
- [ ] **Step 4: Run** `annotator-stage.test.tsx` and `annotator-dialog.test.tsx`. Expected: PASS.

---

## Execution note

The tasks build on each other's interfaces in order (1 → 2 → 3 → 4, then 5, 6, 7; 5 needs only 1). Task 9, added during the run, is independent of the others and runs after Task 3; Task 8 runs last. Task 3's tuning (band, growth, tolerance) is the one place the numbers may move to meet the tests; the tests do not.
