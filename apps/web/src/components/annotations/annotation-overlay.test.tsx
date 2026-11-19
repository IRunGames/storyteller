import { describe, it } from "node:test";
import { expect } from "expect";

import type { AnnotationOp } from "@/lib/annotation-schemas";
import { render } from "@/test/render";
import { AnnotationOverlay } from "./annotation-overlay";

const ops: AnnotationOp[] = [
  { t: "rect", mode: "reveal", x: 10, y: 10, w: 50, h: 20 },
  { t: "pen", color: "#e53935", width: 4, points: [1, 2, 30, 40] },
];

describe("AnnotationOverlay", () => {
  it("draws the drawing over the picture's own pixels, the pen under the fog", () => {
    const { container } = render(
      <AnnotationOverlay ops={ops} width={400} height={200} fogOpacity={50} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 200");
    const mask = svg.querySelector("mask")!;
    expect(mask.querySelector('rect[fill="black"]')).not.toBeNull();
    const pen = svg.querySelector('[data-layer="pen"] path')!;
    expect(pen.getAttribute("stroke")).toBe("#e53935");
    expect(pen.getAttribute("stroke-width")).toBe("4");
    const fog = svg.querySelector('[data-layer="fog"]')!;
    expect(fog.getAttribute("fill-opacity")).toBe("0.5");
    // The fog reads its mask by the mask's own id.
    expect(fog.getAttribute("mask")).toBe(`url(#${mask.id})`);
    expect(pen.compareDocumentPosition(fog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws the step being made after the saved ones", () => {
    const { container } = render(
      <AnnotationOverlay
        ops={ops}
        pending={{ t: "pen", color: "#000000", width: 2, points: [5, 5] }}
        width={400}
        height={200}
        fogOpacity={50}
      />,
    );
    expect(container.querySelectorAll('[data-layer="pen"] > *')).toHaveLength(2);
  });

  it("gives two overlays on one page masks of their own", () => {
    const { container } = render(
      <>
        <AnnotationOverlay ops={ops} width={400} height={200} fogOpacity={50} />
        <AnnotationOverlay ops={ops} width={400} height={200} fogOpacity={50} />
      </>,
    );
    const ids = [...container.querySelectorAll("mask")].map((mask) => mask.id);
    expect(new Set(ids).size).toBe(2);
  });

  // Drawn again under a moving pointer, the saved steps' elements stay the
  // ones already on the page, layers and all, so a long drawing does not
  // rebuild itself on every move.
  it("keeps the drawn elements in place as the step being made changes", () => {
    const props = { ops, width: 400, height: 200, fogOpacity: 50 };
    const { container, rerender } = render(
      <AnnotationOverlay
        {...props}
        pending={{ t: "pen", color: "#000000", width: 2, points: [5, 5] }}
      />,
    );
    const layer = container.querySelector('[data-layer="pen"]');
    const mark = container.querySelector('[data-layer="pen"] path');
    const reveal = container.querySelector('mask rect[fill="black"]');

    rerender(
      <AnnotationOverlay
        {...props}
        pending={{ t: "pen", color: "#000000", width: 2, points: [5, 5, 9, 9] }}
      />,
    );

    expect(container.querySelector('[data-layer="pen"]')).toBe(layer);
    expect(container.querySelector('[data-layer="pen"] path')).toBe(mark);
    expect(container.querySelector('mask rect[fill="black"]')).toBe(reveal);
  });
});
