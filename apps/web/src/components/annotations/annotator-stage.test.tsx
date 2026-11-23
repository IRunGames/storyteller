import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

import type { AnnotationOp, FloodOp } from "@/lib/annotation-schemas";
import { insideRings } from "@/lib/fog-areas";
import type { Snap } from "@/lib/fog-walls";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import { AnnotatorStage } from "./annotator-stage";

const onDraw = mock.fn((_op: AnnotationOp) => {});

// The picture is 400 by 200 and shown at half that, from the page's corner,
// so a point on screen is twice as far into the picture.
function stage(props: Partial<Parameters<typeof AnnotatorStage>[0]> = {}) {
  renderWithProviders(
    <AnnotatorStage
      imageUrl="https://abc.public.blob.vercel-storage.com/uploads/u/map.png"
      label="Harbour map"
      width={400}
      height={200}
      ops={[]}
      fogOpacity={50}
      tool="brush"
      mode="reveal"
      brushRadius={8}
      penWidth={3}
      penColor="#e53935"
      onDraw={onDraw}
      {...props}
    />,
  );
  return screen.getByRole("application", { name: "Drawing surface" });
}

function drag(surface: HTMLElement, points: [number, number][]) {
  const [first, ...rest] = points;
  fireEvent.pointerDown(surface, { clientX: first[0], clientY: first[1], pointerId: 1, button: 0 });
  for (const [x, y] of rest)
    fireEvent.pointerMove(surface, { clientX: x, clientY: y, pointerId: 1 });
  const last = points.at(-1)!;
  fireEvent.pointerUp(surface, { clientX: last[0], clientY: last[1], pointerId: 1 });
}

const click = (surface: HTMLElement, x: number, y: number) => drag(surface, [[x, y]]);

// The area round the picture, which it sits in: a hundred of the screen's
// pixels either side of it and sixteen above and below.
function around(surface: HTMLElement) {
  const area = surface.parentElement!;
  mock.method(area, "getBoundingClientRect", () => ({
    left: -100,
    top: -16,
    width: 400,
    height: 132,
    right: 300,
    bottom: 116,
    x: -100,
    y: -16,
    toJSON: () => ({}),
  }));
  return area;
}

// A wall across the top of the picture and a pen mark across the bottom.
const crossed: AnnotationOp[] = [
  { t: "wall", points: [0, 40, 400, 40] },
  { t: "pen", color: "#000000", width: 2, points: [0, 160, 400, 160] },
];

describe("AnnotatorStage", () => {
  beforeEach(() => {
    onDraw.mock.resetCalls();
    mock.method(HTMLElement.prototype, "getBoundingClientRect", () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => mock.restoreAll());

  it("draws a brush stroke in the picture's own pixels, in the mode chosen", () => {
    drag(stage({ mode: "cover" }), [
      [10, 10],
      [30, 10],
      [50, 20],
    ]);
    expect(onDraw.mock.calls.map((call) => call.arguments[0])).toEqual([
      { t: "brush", mode: "cover", radius: 8, points: [20, 20, 60, 20, 100, 40] },
    ]);
  });

  it("draws a rectangle from corner to corner, whichever way it was dragged", () => {
    drag(stage({ tool: "rect" }), [
      [60, 40],
      [10, 10],
    ]);
    expect(onDraw.mock.calls.map((call) => call.arguments[0])).toEqual([
      { t: "rect", mode: "reveal", x: 20, y: 20, w: 100, h: 60 },
    ]);
  });

  it("draws a pen mark in the pen's color and width, a dot for a single press", () => {
    drag(stage({ tool: "pen" }), [[25, 25]]);
    expect(onDraw.mock.calls.map((call) => call.arguments[0])).toEqual([
      { t: "pen", color: "#e53935", width: 3, points: [50, 50] },
    ]);
  });

  it("draws no rectangle for a press that did not drag", () => {
    drag(stage({ tool: "rect" }), [[25, 25]]);
    expect(onDraw.mock.callCount()).toBe(0);
  });

  it("keeps a point inside the picture when the pointer leaves it mid-stroke", () => {
    drag(stage({ tool: "pen" }), [
      [190, 90],
      [260, 130],
    ]);
    expect(onDraw.mock.calls[0].arguments[0]).toMatchObject({ points: [380, 180, 400, 200] });
  });

  // A second finger (a pinch on a tablet) or a palm beside a stylus must not
  // draw: in Reveal it would lift the fog between them for the players.
  it("draws nothing when a second pointer comes down mid-stroke, and ignores the second's moves", () => {
    const surface = stage();
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 10, pointerId: 1 });
    fireEvent.pointerDown(surface, { clientX: 150, clientY: 80, pointerId: 2, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 140, clientY: 70, pointerId: 2 });
    fireEvent.pointerMove(surface, { clientX: 50, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 140, clientY: 70, pointerId: 2 });
    fireEvent.pointerUp(surface, { clientX: 50, clientY: 10, pointerId: 1 });
    expect(onDraw.mock.callCount()).toBe(0);
  });

  it("draws nothing for a stroke the browser cancels", () => {
    const surface = stage({ tool: "pen" });
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 10, pointerId: 1 });
    fireEvent.pointerCancel(surface, { pointerId: 1 });
    expect(onDraw.mock.callCount()).toBe(0);
  });

  // The drag ends 60 right and 80 down of the centre, in the picture's
  // pixels: a corner there, 100 out, turned 53.1 degrees below the right.
  it("draws a shape from its centre out with a corner under the pointer, in the pen's paint", () => {
    drag(stage({ tool: "shape", shape: "pentagon" }), [
      [50, 50],
      [65, 70],
      [80, 90],
    ]);
    expect(onDraw.mock.calls.map((call) => call.arguments[0])).toEqual([
      {
        t: "shape",
        shape: "pentagon",
        color: "#e53935",
        width: 3,
        cx: 100,
        cy: 100,
        r: 100,
        angle: 53.1,
      },
    ]);
  });

  it("draws no shape for a press that did not drag", () => {
    drag(stage({ tool: "shape", shape: "circle" }), [[50, 50]]);
    expect(onDraw.mock.callCount()).toBe(0);
  });

  // The eraser reaches ten of the screen's pixels round the pointer, twenty
  // of the picture's at half size.
  it("takes away the marks the eraser is dragged across, in one step", () => {
    const ops: AnnotationOp[] = [
      { t: "pen", color: "#000000", width: 2, points: [0, 20, 200, 20] },
      { t: "pen", color: "#000000", width: 2, points: [0, 150, 200, 150] },
      { t: "shape", shape: "circle", color: "#000000", width: 2, cx: 300, cy: 100, r: 40 },
    ];
    drag(stage({ tool: "eraser", ops }), [
      [50, 10],
      [150, 50],
      [170, 50],
    ]);
    expect(onDraw.mock.calls.map((call) => call.arguments[0])).toEqual([
      { t: "erase", targets: [0, 2] },
    ]);
  });

  it("makes no step when the eraser touches nothing", () => {
    const ops: AnnotationOp[] = [{ t: "pen", color: "#000000", width: 2, points: [0, 20, 10, 20] }];
    drag(stage({ tool: "eraser", ops }), [
      [150, 80],
      [160, 90],
    ]);
    expect(onDraw.mock.callCount()).toBe(0);
  });

  // The wall pen's reach is ten of the screen's pixels, twenty of the
  // picture's at half size: the first click lands two from the left edge,
  // the second ten from the wall, the third far from both.
  it("hands the wall pen's clicks over snapped, onto the edge or a wall, else where they land", () => {
    const onWallCorner = mock.fn((_snap: Snap) => {});
    const surface = stage({
      tool: "wall",
      onWallCorner,
      ops: [{ t: "wall", points: [200, 0, 200, 200] }],
    });
    click(surface, 1, 50);
    click(surface, 95, 50);
    click(surface, 50, 50);
    expect(onWallCorner.mock.calls.map((call) => call.arguments[0])).toEqual([
      { x: 0, y: 100, on: "touch" },
      { x: 200, y: 100, on: "touch" },
      { x: 100, y: 100, on: null },
    ]);
    expect(onDraw.mock.callCount()).toBe(0);
  });

  it("places no corner when a second pointer comes down before the first is let go", () => {
    const onWallCorner = mock.fn((_snap: Snap) => {});
    const surface = stage({ tool: "wall", onWallCorner });
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 50, pointerId: 1, button: 0 });
    fireEvent.pointerDown(surface, { clientX: 150, clientY: 50, pointerId: 2, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 150, clientY: 50, pointerId: 2 });
    fireEvent.pointerUp(surface, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(onWallCorner.mock.callCount()).toBe(0);
    click(surface, 50, 50);
    expect(onWallCorner.mock.callCount()).toBe(1);
  });

  // The draft runs from (100, 100) to (200, 100); the pointer is first two
  // of the picture's pixels short of the right edge, then nowhere near
  // anything.
  it("draws the wall in progress with a line to where the pointer would land, ringed when it snaps", () => {
    const surface = stage({
      tool: "wall",
      wallDraft: { points: [100, 100, 200, 100], startTouches: false },
    });
    fireEvent.pointerMove(surface, { clientX: 199, clientY: 30, pointerId: 1 });
    const draft = surface.querySelector('[data-layer="wall-draft"]')!;
    const lines = [...draft.querySelectorAll("path")].map((path) => path.getAttribute("d"));
    expect(lines).toEqual(["M100 100L200 100L400 60", "M100 100L200 100L400 60"]);
    expect(draft.querySelectorAll("circle").length).toBeGreaterThan(0);

    fireEvent.pointerMove(surface, { clientX: 75, clientY: 25, pointerId: 1 });
    expect(draft.querySelector("path")!.getAttribute("d")).toBe("M100 100L200 100L150 50");
    expect(draft.querySelectorAll("circle")).toHaveLength(0);
  });

  // Left of the picture at half its height, above it a quarter of the way
  // across, and beyond its bottom right corner.
  it("lands a wall pen's click in the area round the picture on the picture's edge", () => {
    const onWallCorner = mock.fn((_snap: Snap) => {});
    const area = around(stage({ tool: "wall", onWallCorner }));
    click(area, -50, 50);
    click(area, 50, -10);
    click(area, 250, 110);
    expect(onWallCorner.mock.calls.map((call) => call.arguments[0])).toEqual([
      { x: 0, y: 100, on: "touch" },
      { x: 100, y: 0, on: "touch" },
      { x: 400, y: 200, on: "touch" },
    ]);
  });

  // The pointer goes from (300, 60) on the picture out past its right edge,
  // level with where it was, then out of the area too.
  it("draws the wall in progress on to the edge while the pointer is round the picture, until it leaves that area", () => {
    const surface = stage({
      tool: "wall",
      wallDraft: { points: [100, 100, 200, 100], startTouches: false },
    });
    const area = around(surface);
    const draft = surface.querySelector('[data-layer="wall-draft"]')!;
    const line = () => draft.querySelector("path")!.getAttribute("d");
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 30, pointerId: 1 });
    fireEvent.pointerLeave(surface, { relatedTarget: area });
    expect(line()).toBe("M100 100L200 100L300 60");

    fireEvent.pointerMove(area, { clientX: 250, clientY: 30, pointerId: 1 });
    expect(line()).toBe("M100 100L200 100L400 60");
    expect(draft.querySelectorAll("circle").length).toBeGreaterThan(0);

    fireEvent.pointerLeave(area);
    expect(line()).toBe("M100 100L200 100");
    expect(draft.querySelectorAll("circle")).toHaveLength(0);
  });

  it("starts no pen mark in the area round the picture", () => {
    click(around(stage({ tool: "pen" })), -50, 50);
    expect(onDraw.mock.callCount()).toBe(0);
  });

  it("floods nothing for a click in the area round the picture", () => {
    click(around(stage({ tool: "flood" })), -50, 50);
    expect(onDraw.mock.callCount()).toBe(0);
  });

  it("shows the brush's ring over the picture only", () => {
    const surface = stage();
    const area = around(surface);
    fireEvent.pointerMove(surface, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(surface.querySelectorAll("circle")).toHaveLength(2);
    fireEvent.pointerLeave(surface, { relatedTarget: area });
    fireEvent.pointerMove(area, { clientX: -50, clientY: 50, pointerId: 1 });
    expect(surface.querySelectorAll("circle")).toHaveLength(0);
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

  it("takes walls away with the wall eraser, and never a mark", () => {
    drag(stage({ tool: "wallEraser", ops: crossed }), [
      [10, 20],
      [10, 80],
    ]);
    expect(onDraw.mock.calls.map((call) => call.arguments[0])).toEqual([
      { t: "wallErase", targets: [0] },
    ]);
  });

  it("makes no step when the wall eraser touches no wall", () => {
    drag(stage({ tool: "wallEraser", ops: crossed }), [
      [10, 70],
      [150, 90],
    ]);
    expect(onDraw.mock.callCount()).toBe(0);
  });

  it("never takes a wall away with the annotations' eraser", () => {
    drag(stage({ tool: "eraser", ops: crossed }), [
      [10, 20],
      [20, 20],
    ]);
    expect(onDraw.mock.callCount()).toBe(0);
  });

  // The corner where Shift went down and the run's end are each given twice,
  // so the stroke's smoothing turns there instead of curving into the run.
  it("draws the pen straight while Shift is held, and freehand again once it is let go", () => {
    const surface = stage({ tool: "pen" });
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 10, pointerId: 1, shiftKey: true });
    fireEvent.pointerMove(surface, { clientX: 50, clientY: 30, pointerId: 1, shiftKey: true });
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 60, clientY: 30, pointerId: 1 });
    expect(onDraw.mock.calls.map((call) => call.arguments[0])).toEqual([
      { t: "pen", color: "#e53935", width: 3, points: [20, 20, 20, 20, 100, 60, 100, 60, 120, 60] },
    ]);
  });
});
