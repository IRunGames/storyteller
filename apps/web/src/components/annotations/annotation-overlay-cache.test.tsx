// The overlay works out the walls' view (storytellerView, a grid filled
// across the whole picture, tens of milliseconds on a large map) only when a
// wall comes or goes, never on a redraw under a moving pointer. Kept apart
// from annotation-overlay.test.tsx because counting the calls means mocking
// lib/fog-areas before the overlay is imported.
import { before, describe, it, mock } from "node:test";
import { expect } from "expect";

import type { AnnotationOp } from "@/lib/annotation-schemas";
import { render } from "@/test/render";

let AnnotationOverlay: typeof import("./annotation-overlay").AnnotationOverlay;
let storytellerView: ReturnType<typeof mock.fn<typeof import("@/lib/fog-areas").storytellerView>>;

// A closed room, and a wall standing on its own.
const room: AnnotationOp = { t: "wall", points: [100, 50, 300, 50, 300, 150, 100, 150, 100, 50] };
const lone: AnnotationOp = { t: "wall", points: [10, 10, 50, 10] };
const ops: AnnotationOp[] = [room, lone];
const size = { width: 400, height: 200, fogOpacity: 50 };

before(async () => {
  const fogAreas = await import("@/lib/fog-areas");
  storytellerView = mock.fn(fogAreas.storytellerView);
  mock.module("@/lib/fog-areas", { namedExports: { ...fogAreas, storytellerView } });
  ({ AnnotationOverlay } = await import("./annotation-overlay"));
});

describe("AnnotationOverlay's walls", () => {
  it("works out the walls' view again only when a wall comes or goes", () => {
    const { rerender } = render(<AnnotationOverlay {...size} ops={ops} />);
    expect(storytellerView.mock.callCount()).toBe(1);

    // A pen stroke growing under the pointer, each length drawn twice (a
    // redraw that changes nothing), then the list of steps rebuilt with the
    // same steps in it.
    for (let i = 1; i < 30; i++) {
      const pending: AnnotationOp = { t: "pen", color: "#000000", width: 2, points: [0, 0, i, i] };
      rerender(<AnnotationOverlay {...size} ops={ops} pending={pending} />);
      rerender(<AnnotationOverlay {...size} ops={ops} pending={pending} />);
    }
    rerender(<AnnotationOverlay {...size} ops={[...ops]} />);
    expect(storytellerView.mock.callCount()).toBe(1);

    // A wall eraser's drag taking the lone wall, then a new step for the same drag.
    const erase: AnnotationOp = { t: "wallErase", targets: [1] };
    rerender(<AnnotationOverlay {...size} ops={ops} pending={erase} />);
    expect(storytellerView.mock.callCount()).toBe(2);
    rerender(<AnnotationOverlay {...size} ops={ops} pending={{ t: "wallErase", targets: [1] }} />);
    expect(storytellerView.mock.callCount()).toBe(2);

    // The drag saved: the same walls stand.
    rerender(<AnnotationOverlay {...size} ops={[...ops, erase]} />);
    expect(storytellerView.mock.callCount()).toBe(2);
  });
});
