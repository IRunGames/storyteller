import { describe, it } from "node:test";
import { expect } from "expect";

import type { AnnotationOp } from "./annotation-schemas";
import {
  annotationTree,
  marksAt,
  shapePoints,
  strokePath,
  toSvgString,
  type SvgNode,
} from "./annotation-drawing";
import { FOG_COLOR } from "./annotations";

const size = { width: 400, height: 200, fogOpacity: 100, maskId: "fog" };

// The tree's parts by what they are for, so a test reads the layer it is about.
function parts(tree: SvgNode) {
  const children = tree.children ?? [];
  const pen = children.find((node) => node.attrs["data-layer"] === "pen");
  const mask = children
    .find((node) => node.tag === "defs")
    ?.children?.find((node) => node.tag === "mask");
  const fog = children.find((node) => node.attrs["data-layer"] === "fog");
  return { children, pen, mask, fog };
}

describe("annotationTree", () => {
  it("draws the picture's own pixels into the size it is shown at", () => {
    const tree = annotationTree([], { ...size, outWidth: 200, outHeight: 100 });
    expect(tree.tag).toBe("svg");
    expect(tree.attrs).toMatchObject({ viewBox: "0 0 400 200", width: 200, height: 100 });
  });

  it("covers the whole picture until something is revealed", () => {
    const { mask, fog } = parts(annotationTree([], size));
    expect(mask?.attrs.id).toBe("fog");
    expect(mask?.children?.[0]).toMatchObject({
      tag: "rect",
      attrs: { width: 400, height: 200, fill: "white" },
    });
    expect(fog?.attrs).toMatchObject({
      fill: FOG_COLOR,
      "fill-opacity": 1,
      mask: "url(#fog)",
    });
  });

  it("paints reveals black and covers white on the mask, in the order they were made", () => {
    const ops: AnnotationOp[] = [
      { t: "rect", mode: "reveal", x: 10, y: 20, w: 30, h: 40 },
      { t: "brush", mode: "cover", radius: 5, points: [0, 0, 10, 10] },
    ];
    const { mask } = parts(annotationTree(ops, size));
    expect(mask?.children?.slice(1)).toEqual([
      { tag: "rect", attrs: { x: 10, y: 20, width: 30, height: 40, fill: "black" } },
      {
        tag: "path",
        attrs: expect.objectContaining({ stroke: "white", "stroke-width": 10, fill: "none" }),
      },
    ]);
  });

  it("leaves out every fog step before the last Cover all or Clear all, and starts from it", () => {
    const ops: AnnotationOp[] = [
      { t: "rect", mode: "reveal", x: 1, y: 1, w: 1, h: 1 },
      { t: "fogAll", mode: "reveal" },
      { t: "rect", mode: "cover", x: 2, y: 2, w: 2, h: 2 },
    ];
    const { mask } = parts(annotationTree(ops, size));
    expect(mask?.children).toEqual([
      expect.objectContaining({ attrs: expect.objectContaining({ fill: "black" }) }),
      { tag: "rect", attrs: { x: 2, y: 2, width: 2, height: 2, fill: "white" } },
    ]);
  });

  it("draws the pen marks under the fog", () => {
    const ops: AnnotationOp[] = [{ t: "pen", color: "#ff0000", width: 3, points: [1, 2, 3, 4] }];
    const { children, pen, fog } = parts(annotationTree(ops, size));
    expect(children.indexOf(pen!)).toBeLessThan(children.indexOf(fog!));
    expect(pen?.children).toEqual([
      {
        tag: "path",
        attrs: expect.objectContaining({
          stroke: "#ff0000",
          "stroke-width": 3,
          "stroke-linecap": "round",
          fill: "none",
        }),
      },
    ]);
  });

  it("leaves out the pen marks made before the last Erase pen marks", () => {
    const ops: AnnotationOp[] = [
      { t: "pen", color: "#ff0000", width: 3, points: [1, 2, 3, 4] },
      { t: "penClear" },
      { t: "pen", color: "#00ff00", width: 3, points: [5, 6, 7, 8] },
    ];
    const { pen } = parts(annotationTree(ops, size));
    expect(pen?.children).toHaveLength(1);
    expect(pen?.children?.[0].attrs.stroke).toBe("#00ff00");
  });

  it("draws a stroke of one point as a dot", () => {
    const ops: AnnotationOp[] = [
      { t: "pen", color: "#0000ff", width: 6, points: [10, 20] },
      { t: "brush", mode: "reveal", radius: 8, points: [30, 40] },
    ];
    const { pen, mask } = parts(annotationTree(ops, size));
    expect(pen?.children?.[0]).toEqual({
      tag: "circle",
      attrs: { cx: 10, cy: 20, r: 3, fill: "#0000ff" },
    });
    expect(mask?.children?.[1]).toEqual({
      tag: "circle",
      attrs: { cx: 30, cy: 40, r: 8, fill: "black" },
    });
  });

  it("draws the fog as thick as asked, and leaves it out at none", () => {
    expect(parts(annotationTree([], { ...size, fogOpacity: 40 })).fog?.attrs["fill-opacity"]).toBe(
      0.4,
    );
    expect(parts(annotationTree([], { ...size, fogOpacity: 0 })).fog).toBeUndefined();
  });

  it("reuses a step's shape between drawings, so a long drawing is cheap to draw again", () => {
    const op: AnnotationOp = { t: "pen", color: "#ff0000", width: 3, points: [1, 2, 3, 4] };
    const first = parts(annotationTree([op], size)).pen?.children?.[0];
    const second = parts(annotationTree([op], size)).pen?.children?.[0];
    expect(second).toBe(first);
  });
});

describe("strokePath", () => {
  it("joins two points with a line", () => {
    expect(strokePath([0, 0, 10, 10])).toBe("M0 0L10 10");
  });

  it("smooths through the midpoints of longer strokes", () => {
    expect(strokePath([0, 0, 10, 0, 10, 10])).toBe("M0 0Q10 0 10 5L10 10");
  });

  it("rounds to one decimal place", () => {
    expect(strokePath([0.123, 0.456, 1.987, 2.001])).toBe("M0.1 0.5L2 2");
  });
});

describe("toSvgString", () => {
  it("writes a tree as SVG text, quoting and escaping its attributes", () => {
    expect(
      toSvgString({
        tag: "svg",
        attrs: { width: 2, "data-x": 'a"<&>' },
        children: [{ tag: "rect", attrs: { x: 1 } }],
      }),
    ).toBe('<svg width="2" data-x="a&quot;&lt;&amp;&gt;"><rect x="1"/></svg>');
  });
});

describe("shapes", () => {
  const shape = (
    kind: "circle" | "triangle" | "square" | "pentagon" | "hexagon",
  ): AnnotationOp => ({
    t: "shape",
    shape: kind,
    color: "#43a047",
    width: 4,
    cx: 100,
    cy: 100,
    r: 50,
  });

  it("draws a circle and the regular shapes as outlines under the fog, with the pen's paint", () => {
    const { pen, children, fog } = parts(annotationTree([shape("circle"), shape("hexagon")], size));
    expect(pen?.children?.[0]).toEqual({
      tag: "circle",
      attrs: { cx: 100, cy: 100, r: 50, fill: "none", stroke: "#43a047", "stroke-width": 4 },
    });
    expect(pen?.children?.[1].tag).toBe("polygon");
    expect(pen?.children?.[1].attrs).toMatchObject({ fill: "none", stroke: "#43a047" });
    expect(children.indexOf(pen!)).toBeLessThan(children.indexOf(fog!));
  });

  // A corner where the drag ended, so the shape turns with the pointer;
  // the rest evenly round the circle of the drag.
  it("puts a corner of each regular shape where the drag ended, the rest round its circle", () => {
    for (const [kind, corners] of [
      ["triangle", 3],
      ["square", 4],
      ["pentagon", 5],
      ["hexagon", 6],
    ] as const) {
      const up = shapePoints(kind, 100, 100, 50, -90);
      expect(up).toHaveLength(corners * 2);
      expect(up.slice(0, 2)).toEqual([100, 50]);
      for (let i = 0; i < up.length; i += 2) {
        expect(Math.hypot(up[i] - 100, up[i + 1] - 100)).toBeCloseTo(50, 0);
      }
      expect(shapePoints(kind, 100, 100, 50, 0).slice(0, 2)).toEqual([150, 100]);
    }
  });

  it("points a corner straight up for a shape that does not say which way it turns", () => {
    const { pen } = parts(
      annotationTree(
        [{ t: "shape", shape: "triangle", color: "#43a047", width: 4, cx: 100, cy: 100, r: 50 }],
        size,
      ),
    );
    expect(String(pen?.children?.[0].attrs.points).split(" ")[0]).toBe("100,50");
  });

  it("leaves out the marks an eraser took away, and leaves the eraser itself undrawn", () => {
    const ops: AnnotationOp[] = [
      { t: "pen", color: "#ff0000", width: 3, points: [1, 2, 3, 4] },
      shape("circle"),
      { t: "pen", color: "#0000ff", width: 3, points: [5, 6, 7, 8] },
      { t: "erase", targets: [0, 1] },
    ];
    const { pen } = parts(annotationTree(ops, size));
    expect(pen?.children).toHaveLength(1);
    expect(pen?.children?.[0].attrs.stroke).toBe("#0000ff");
  });

  it("takes shapes away with every other annotation at Erase all annotations", () => {
    const ops: AnnotationOp[] = [shape("square"), { t: "penClear" }, shape("triangle")];
    expect(parts(annotationTree(ops, size)).pen?.children).toHaveLength(1);
  });
});

describe("the fog's color", () => {
  it("is the drawing's when it has one, and the slate otherwise", () => {
    expect(parts(annotationTree([], size)).fog?.attrs.fill).toBe(FOG_COLOR);
    expect(parts(annotationTree([], { ...size, fogColor: "#e9dcbf" })).fog?.attrs.fill).toBe(
      "#e9dcbf",
    );
  });
});

describe("marksAt", () => {
  const line: AnnotationOp = { t: "pen", color: "#ff0000", width: 4, points: [0, 0, 100, 0] };
  const ring: AnnotationOp = {
    t: "shape",
    shape: "circle",
    color: "#ff0000",
    width: 4,
    cx: 200,
    cy: 100,
    r: 50,
  };
  // Turned a corner to the lower right, so it sits square.
  const square: AnnotationOp = {
    t: "shape",
    shape: "square",
    color: "#ff0000",
    width: 2,
    cx: 300,
    cy: 100,
    r: 40,
    angle: 45,
  };

  it("finds the annotations a point touches, by their stroke, not their inside", () => {
    const ops = [line, ring, square];
    expect(marksAt(ops, 50, 3, 2)).toEqual([0]);
    expect(marksAt(ops, 50, 20, 2)).toEqual([]);
    expect(marksAt(ops, 250, 100, 2)).toEqual([1]);
    // The middle of a ring is not the ring.
    expect(marksAt(ops, 200, 100, 2)).toEqual([]);
    // The square's left side, at x = 300 - 40 / sqrt(2).
    expect(marksAt(ops, 300 - 40 / Math.SQRT2, 100, 2)).toEqual([2]);
  });

  it("passes over marks already taken away, and those before Erase all annotations", () => {
    expect(marksAt([line, { t: "erase", targets: [0] }], 50, 0, 2)).toEqual([]);
    expect(marksAt([line, { t: "penClear" }], 50, 0, 2)).toEqual([]);
  });
});
