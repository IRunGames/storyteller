import { describe, it } from "node:test";
import { expect } from "expect";

import {
  MAX_ANNOTATION_OPS,
  MAX_APPENDED_OPS,
  MAX_FLOOD_POINTS,
  MAX_FLOOD_RINGS,
  MAX_STROKE_POINTS,
  MAX_WALL_POINTS,
  annotationOpSchema,
  annotationOpsSchema,
  eraseRefusal,
  fogColorSchema,
  fogOpacitySchema,
  saveAnnotationSchema,
  type AnnotationOp,
} from "./annotation-schemas";

describe("annotationOpSchema", () => {
  it("accepts each kind of step", () => {
    for (const op of [
      { t: "brush", mode: "reveal", radius: 40, points: [10, 20, 30, 40] },
      { t: "brush", mode: "cover", radius: 12.5, points: [10, 20] },
      { t: "rect", mode: "reveal", x: 5, y: 6, w: 100, h: 50 },
      { t: "fogAll", mode: "cover" },
      { t: "fogAll", mode: "reveal" },
      { t: "pen", color: "#ff8800", width: 4, points: [1, 2, 3, 4, 5, 6] },
      { t: "penClear" },
      { t: "shape", shape: "hexagon", color: "#43a047", width: 4, cx: 50, cy: 60, r: 20 },
      { t: "erase", targets: [0, 3] },
    ]) {
      expect(annotationOpSchema.safeParse(op).success).toBe(true);
    }
  });

  it("refuses an unknown step, an unknown mode, and a color that is not #rrggbb", () => {
    expect(annotationOpSchema.safeParse({ t: "spray" }).success).toBe(false);
    expect(annotationOpSchema.safeParse({ t: "fogAll", mode: "melt" }).success).toBe(false);
    for (const color of ["red", "#f80", "#ff880", "url(#x)", "#ff8800;"]) {
      expect(
        annotationOpSchema.safeParse({ t: "pen", color, width: 4, points: [1, 2] }).success,
      ).toBe(false);
    }
  });

  it("refuses a stroke with no point, half a point, or more points than the cap", () => {
    const brush = { t: "brush", mode: "reveal", radius: 10 };
    expect(annotationOpSchema.safeParse({ ...brush, points: [] }).success).toBe(false);
    expect(annotationOpSchema.safeParse({ ...brush, points: [1, 2, 3] }).success).toBe(false);
    const tooMany = Array.from({ length: (MAX_STROKE_POINTS + 1) * 2 }, (_, i) => i);
    expect(annotationOpSchema.safeParse({ ...brush, points: tooMany }).success).toBe(false);
  });

  it("refuses a coordinate that is not a finite number, and a size that is not above zero", () => {
    expect(
      annotationOpSchema.safeParse({ t: "brush", mode: "reveal", radius: 10, points: [1, NaN] })
        .success,
    ).toBe(false);
    expect(
      annotationOpSchema.safeParse({ t: "brush", mode: "reveal", radius: 0, points: [1, 2] })
        .success,
    ).toBe(false);
    expect(
      annotationOpSchema.safeParse({ t: "pen", color: "#000000", width: -1, points: [1, 2] })
        .success,
    ).toBe(false);
    expect(
      annotationOpSchema.safeParse({ t: "rect", mode: "cover", x: 0, y: 0, w: 0, h: 10 }).success,
    ).toBe(false);
  });
});

describe("annotationOpsSchema", () => {
  it("accepts an empty drawing and refuses one over the step cap", () => {
    expect(annotationOpsSchema.safeParse([]).success).toBe(true);
    const many = Array.from({ length: MAX_ANNOTATION_OPS + 1 }, () => ({ t: "penClear" }));
    expect(annotationOpsSchema.safeParse(many).success).toBe(false);
  });
});

describe("fogOpacitySchema", () => {
  it("accepts a whole percentage and refuses anything else", () => {
    expect(fogOpacitySchema.safeParse(0).success).toBe(true);
    expect(fogOpacitySchema.safeParse(100).success).toBe(true);
    expect(fogOpacitySchema.safeParse(101).success).toBe(false);
    expect(fogOpacitySchema.safeParse(-1).success).toBe(false);
    expect(fogOpacitySchema.safeParse(50.5).success).toBe(false);
  });
});

describe("saveAnnotationSchema", () => {
  it("accepts the steps kept and the steps added, with the players' opacity optional", () => {
    expect(
      saveAnnotationSchema.safeParse({ baseRevision: 3, keep: 2, append: [{ t: "penClear" }] })
        .success,
    ).toBe(true);
    expect(
      saveAnnotationSchema.safeParse({
        baseRevision: 0,
        keep: 0,
        append: [],
        fogOpacityPlayers: 80,
      }).success,
    ).toBe(true);
  });

  it("refuses a negative count and more added steps than one save may carry", () => {
    expect(saveAnnotationSchema.safeParse({ baseRevision: -1, keep: 0, append: [] }).success).toBe(
      false,
    );
    expect(saveAnnotationSchema.safeParse({ baseRevision: 0, keep: -1, append: [] }).success).toBe(
      false,
    );
    const many = Array.from({ length: MAX_APPENDED_OPS + 1 }, () => ({ t: "penClear" }));
    expect(saveAnnotationSchema.safeParse({ baseRevision: 0, keep: 0, append: many }).success).toBe(
      false,
    );
  });
});

describe("shapes and the eraser", () => {
  it("knows each shape, and refuses another, a shape of no size, and a color not #rrggbb", () => {
    const shape = { t: "shape", color: "#ff0000", width: 3, cx: 10, cy: 10, r: 5 };
    for (const kind of ["circle", "triangle", "square", "pentagon", "hexagon"]) {
      expect(annotationOpSchema.safeParse({ ...shape, shape: kind }).success).toBe(true);
    }
    expect(annotationOpSchema.safeParse({ ...shape, shape: "star" }).success).toBe(false);
    expect(annotationOpSchema.safeParse({ ...shape, shape: "circle", r: 0 }).success).toBe(false);
    expect(annotationOpSchema.safeParse({ ...shape, shape: "square", angle: 45 }).success).toBe(
      true,
    );
    expect(annotationOpSchema.safeParse({ ...shape, shape: "square", angle: 720 }).success).toBe(
      false,
    );
    expect(
      annotationOpSchema.safeParse({ ...shape, shape: "circle", color: "url(#x)" }).success,
    ).toBe(false);
  });

  it("takes an eraser of at least one mark, by its place in the drawing", () => {
    expect(annotationOpSchema.safeParse({ t: "erase", targets: [] }).success).toBe(false);
    expect(annotationOpSchema.safeParse({ t: "erase", targets: [-1] }).success).toBe(false);
    expect(annotationOpSchema.safeParse({ t: "erase", targets: [1.5] }).success).toBe(false);
  });

  // An eraser names marks by where they stand in the drawing, so the whole
  // drawing is needed to say whether it may: only a pen mark or a shape
  // drawn before it.
  it("lets an eraser take away only a pen mark or a shape drawn before it", () => {
    const pen: AnnotationOp = { t: "pen", color: "#ff0000", width: 3, points: [1, 2] };
    const shape: AnnotationOp = {
      t: "shape",
      shape: "circle",
      color: "#ff0000",
      width: 3,
      cx: 5,
      cy: 5,
      r: 4,
    };
    const fog: AnnotationOp = { t: "fogAll", mode: "cover" };
    expect(eraseRefusal([pen, shape, { t: "erase", targets: [0, 1] }])).toBeNull();
    expect(eraseRefusal([pen, { t: "erase", targets: [1] }])).not.toBeNull();
    expect(eraseRefusal([fog, { t: "erase", targets: [0] }])).not.toBeNull();
    expect(eraseRefusal([{ t: "erase", targets: [1] }, pen])).not.toBeNull();
  });
});

describe("walls and the flood", () => {
  it("accepts a wall, a wall eraser's drag and a flood", () => {
    for (const op of [
      { t: "wall", points: [0, 10, 50, 10] },
      { t: "wallErase", targets: [0] },
      { t: "flood", mode: "reveal", rings: [[0, 0, 10, 0, 10, 10]] },
      {
        t: "flood",
        mode: "cover",
        rings: [
          [0, 0, 9, 0, 9, 9, 0, 9],
          [2, 2, 3, 2, 3, 3],
        ],
      },
    ]) {
      expect(annotationOpSchema.safeParse(op).success).toBe(true);
    }
  });

  it("refuses a wall of one point, a ring of two, and a flood past its caps", () => {
    const bad = [
      { t: "wall", points: [0, 10] },
      { t: "flood", mode: "reveal", rings: [] },
      { t: "flood", mode: "reveal", rings: [[0, 0, 10, 0]] },
      {
        t: "flood",
        mode: "reveal",
        rings: Array.from({ length: MAX_FLOOD_RINGS + 1 }, () => [0, 0, 1, 0, 1, 1]),
      },
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
});

describe("fogColorSchema", () => {
  it("takes a color as #rrggbb and nothing else", () => {
    expect(fogColorSchema.safeParse("#1b1d23").success).toBe(true);
    expect(fogColorSchema.safeParse("red").success).toBe(false);
    expect(
      saveAnnotationSchema.safeParse({ baseRevision: 0, keep: 0, append: [], fogColor: "#ffffff" })
        .success,
    ).toBe(true);
    expect(
      saveAnnotationSchema.safeParse({ baseRevision: 0, keep: 0, append: [], fogColor: "white" })
        .success,
    ).toBe(false);
  });
});
