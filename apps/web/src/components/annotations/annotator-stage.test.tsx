import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

import type { AnnotationOp } from "@/lib/annotation-schemas";
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
});
