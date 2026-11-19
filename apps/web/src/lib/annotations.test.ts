import { describe, it } from "node:test";
import { expect } from "expect";

import type { AnnotationOp } from "./annotation-schemas";
import {
  BRUSH_SIZES,
  PEN_COLORS,
  PEN_WIDTHS,
  brushRadiusPx,
  pendingChange,
  penWidthPx,
} from "./annotations";

const a: AnnotationOp = { t: "fogAll", mode: "reveal" };
const b: AnnotationOp = { t: "penClear" };
const c: AnnotationOp = { t: "rect", mode: "cover", x: 1, y: 2, w: 3, h: 4 };
const d: AnnotationOp = { t: "fogAll", mode: "cover" };

describe("pendingChange", () => {
  it("keeps every saved step and sends the ones drawn since", () => {
    expect(pendingChange([a, b], [a, b, c])).toEqual({ keep: 2, append: [c] });
  });

  it("keeps all but the last step after an undo, sending nothing", () => {
    expect(pendingChange([a, b, c], [a, b])).toEqual({ keep: 2, append: [] });
  });

  it("keeps the common start after an undo followed by a new step", () => {
    expect(pendingChange([a, b, c], [a, b, d])).toEqual({ keep: 2, append: [d] });
  });

  it("is nothing to send when the drawing is as saved", () => {
    expect(pendingChange([a, b], [a, b])).toEqual({ keep: 2, append: [] });
  });

  it("tells steps apart by identity, so a step drawn alike is still sent", () => {
    const again: AnnotationOp = { t: "penClear" };
    expect(pendingChange([a, b], [a, again])).toEqual({ keep: 1, append: [again] });
  });
});

describe("sizes", () => {
  it("scales the pen's width and the brush's radius with the picture's long side", () => {
    expect(penWidthPx(5, 2000, 1000)).toBe(10);
    expect(penWidthPx(5, 1000, 2000)).toBe(10);
    expect(brushRadiusPx(4, 2000, 1000)).toBe(80);
  });

  it("offers the default among the choices", () => {
    expect(PEN_WIDTHS.min).toBeLessThanOrEqual(PEN_WIDTHS.initial);
    expect(PEN_WIDTHS.initial).toBeLessThanOrEqual(PEN_WIDTHS.max);
    expect(BRUSH_SIZES.min).toBeLessThanOrEqual(BRUSH_SIZES.initial);
    expect(BRUSH_SIZES.initial).toBeLessThanOrEqual(BRUSH_SIZES.max);
    for (const color of PEN_COLORS) expect(color.value).toMatch(/^#[0-9a-f]{6}$/);
  });
});
