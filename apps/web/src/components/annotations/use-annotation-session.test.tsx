import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, renderHook } from "@testing-library/react";

import {
  MAX_APPENDED_OPS,
  type AnnotationOp,
  type SaveAnnotationInput,
} from "@/lib/annotation-schemas";
import type { PictureAnnotation } from "@/lib/annotations";

type SaveResult = { ok: true; revision: number } | { ok: false; error: string; stale?: true };

const sa_saveAnnotation =
  mock.fn<(idAttachment: number, input: SaveAnnotationInput) => Promise<SaveResult>>();
const sa_getAnnotation = mock.fn<(idAttachment: number) => Promise<PictureAnnotation | null>>();
const sa_refreshPlayersCopy = mock.fn<
  (idAttachment: number) => Promise<{ ok: boolean; behind: boolean }>
>(async () => ({ ok: true, behind: false }));
const toast = mock.fn((_options: { title: string; type: string }) => {});

let useAnnotationSession: typeof import("./use-annotation-session").useAnnotationSession;
let SAVE_DELAY_MS: number;
let REFRESH_DELAY_MS: number;

const brush: AnnotationOp = { t: "brush", mode: "reveal", radius: 10, points: [1, 2] };
const pen: AnnotationOp = { t: "pen", color: "#000000", width: 2, points: [3, 4] };
const rect: AnnotationOp = { t: "rect", mode: "cover", x: 1, y: 1, w: 2, h: 2 };

const initial: PictureAnnotation = {
  idAttachment: 5,
  imageUrl: "https://abc.public.blob.vercel-storage.com/uploads/u/map.png",
  isActive: true,
  width: 400,
  height: 200,
  ops: [brush],
  revision: 3,
  fogOpacityPlayers: 100,
  fogColor: "#1b1d23",
};

// Lets the promises the hook is waiting on settle: setImmediate is not one
// of the mocked timers, so it runs after every microtask queued so far.
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function elapse(ms: number) {
  await act(async () => {
    mock.timers.tick(ms);
    await settle();
    await settle();
  });
}

before(async () => {
  mock.module("./actions", {
    namedExports: { sa_saveAnnotation, sa_getAnnotation, sa_refreshPlayersCopy },
  });
  mock.module("@/components/ui/toaster", { namedExports: { toaster: { create: toast } } });
  ({ useAnnotationSession, SAVE_DELAY_MS, REFRESH_DELAY_MS } =
    await import("./use-annotation-session"));
});

describe("useAnnotationSession", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] });
    sa_saveAnnotation.mock.resetCalls();
    sa_saveAnnotation.mock.mockImplementation(async (_p, input) => ({
      ok: true,
      revision: input.baseRevision + 1,
    }));
    sa_getAnnotation.mock.resetCalls();
    sa_refreshPlayersCopy.mock.resetCalls();
    sa_refreshPlayersCopy.mock.mockImplementation(async () => ({ ok: true, behind: false }));
    toast.mock.resetCalls();
  });

  afterEach(() => mock.timers.reset());

  const start = () => renderHook(() => useAnnotationSession(5, initial));

  it("shows a step at once and saves it after a pause, as the steps kept and the steps added", async () => {
    const { result } = start();
    act(() => result.current.draw(pen));
    expect(result.current.ops).toEqual([brush, pen]);
    expect(result.current.status).toBe("unsaved");
    expect(sa_saveAnnotation.mock.callCount()).toBe(0);

    await elapse(SAVE_DELAY_MS);

    expect(sa_saveAnnotation.mock.calls.map((call) => call.arguments)).toEqual([
      [5, { baseRevision: 3, keep: 1, append: [pen] }],
    ]);
    expect(result.current.status).toBe("saved");
  });

  it("sends an undo and a step drawn after it in one save", async () => {
    const { result } = start();
    act(() => result.current.undo());
    act(() => result.current.draw(rect));
    await elapse(SAVE_DELAY_MS);

    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toEqual({
      baseRevision: 3,
      keep: 0,
      append: [rect],
    });
  });

  it("sends what was drawn while a save was out once it is back, from the revision it made", async () => {
    let answer: (result: SaveResult) => void = () => {};
    sa_saveAnnotation.mock.mockImplementationOnce(
      () => new Promise<SaveResult>((resolve) => (answer = resolve)),
    );
    const { result } = start();
    act(() => result.current.draw(pen));
    await elapse(SAVE_DELAY_MS);
    act(() => result.current.draw(rect));
    await elapse(SAVE_DELAY_MS);
    expect(sa_saveAnnotation.mock.callCount()).toBe(1);

    await act(async () => {
      answer({ ok: true, revision: 4 });
      await settle();
      await settle();
    });

    expect(sa_saveAnnotation.mock.calls[1].arguments[1]).toEqual({
      baseRevision: 4,
      keep: 2,
      append: [rect],
    });
  });

  it("saves the players' fog with the drawing", async () => {
    const { result } = start();
    act(() => result.current.setFogOpacityPlayers(70));
    await elapse(SAVE_DELAY_MS);
    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toEqual({
      baseRevision: 3,
      keep: 1,
      append: [],
      fogOpacityPlayers: 70,
    });
  });

  it("saves the fog's color with the drawing, and shows it at once", async () => {
    const { result } = start();
    act(() => result.current.setFogColor("#e9dcbf"));
    expect(result.current.fogColor).toBe("#e9dcbf");
    await elapse(SAVE_DELAY_MS);
    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toEqual({
      baseRevision: 3,
      keep: 1,
      append: [],
      fogColor: "#e9dcbf",
    });
  });

  it("loads the drawing again when it was changed elsewhere, and says so", async () => {
    sa_saveAnnotation.mock.mockImplementation(async () => ({
      ok: false,
      error: "Changed elsewhere.",
      stale: true,
    }));
    sa_getAnnotation.mock.mockImplementation(async () => ({
      ...initial,
      ops: [rect],
      revision: 9,
    }));
    const { result } = start();
    act(() => result.current.draw(pen));
    await elapse(SAVE_DELAY_MS);

    expect(result.current.ops).toEqual([rect]);
    expect(result.current.status).toBe("saved");
    expect(toast.mock.calls[0].arguments[0]).toMatchObject({ title: "Changed elsewhere." });

    // The next save builds on what was loaded.
    sa_saveAnnotation.mock.mockImplementation(async (_p, input) => ({
      ok: true,
      revision: input.baseRevision + 1,
    }));
    act(() => result.current.draw(brush));
    await elapse(SAVE_DELAY_MS);
    expect(sa_saveAnnotation.mock.calls.at(-1)?.arguments[1]).toMatchObject({
      baseRevision: 9,
      keep: 1,
    });
  });

  it("keeps a refused step on screen, says why, and tries again with the next change", async () => {
    sa_saveAnnotation.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "Too long.",
    }));
    const { result } = start();
    act(() => result.current.draw(pen));
    await elapse(SAVE_DELAY_MS);
    expect(result.current.ops).toEqual([brush, pen]);
    expect(result.current.status).toBe("unsaved");
    expect(toast.mock.calls[0].arguments[0]).toMatchObject({ title: "Too long.", type: "error" });

    act(() => result.current.draw(rect));
    await elapse(SAVE_DELAY_MS);
    expect(sa_saveAnnotation.mock.calls[1].arguments[1]).toEqual({
      baseRevision: 3,
      keep: 1,
      append: [pen, rect],
    });
  });

  it("asks for the players' copy as it opens, a while after the last save, and as it closes", async () => {
    const { result, unmount } = start();
    await elapse(0);
    expect(sa_refreshPlayersCopy.mock.callCount()).toBe(1);

    act(() => result.current.draw(pen));
    await elapse(SAVE_DELAY_MS);
    expect(sa_refreshPlayersCopy.mock.callCount()).toBe(1);
    await elapse(REFRESH_DELAY_MS);
    expect(sa_refreshPlayersCopy.mock.callCount()).toBe(2);

    // Closed with nothing waiting, it still asks once more.
    unmount();
    await elapse(0);
    expect(sa_refreshPlayersCopy.mock.callCount()).toBe(3);
  });

  it("saves what is waiting as it closes, then asks for the players' copy", async () => {
    const { result, unmount } = start();
    await elapse(0);
    act(() => result.current.draw(rect));
    unmount();
    await elapse(0);
    expect(sa_saveAnnotation.mock.calls.map((call) => call.arguments[1])).toEqual([
      { baseRevision: 3, keep: 1, append: [rect] },
    ]);
    expect(sa_refreshPlayersCopy.mock.callCount()).toBe(2);
  });

  // What the annotator was opened from reads the picture back once the
  // closing save has landed: a drawing changed here is now on.
  it("says it has been left once what was waiting is saved", async () => {
    const onLeave = mock.fn(() => {});
    const order: string[] = [];
    sa_saveAnnotation.mock.mockImplementationOnce(async () => {
      order.push("saved");
      return { ok: true, revision: 4 };
    });
    onLeave.mock.mockImplementation(() => void order.push("left"));
    const { result, unmount } = renderHook(() => useAnnotationSession(5, initial, { onLeave }));
    await elapse(0);
    act(() => result.current.draw(rect));
    unmount();
    await elapse(0);
    expect(order).toEqual(["saved", "left"]);

    // Left with nothing waiting, it says so at once.
    const quiet = mock.fn(() => {});
    renderHook(() => useAnnotationSession(5, initial, { onLeave: quiet })).unmount();
    await elapse(0);
    expect(quiet.mock.callCount()).toBe(1);
  });

  it("keeps asking for the players' copy while it is behind the drawing", async () => {
    let behind = 2;
    sa_refreshPlayersCopy.mock.mockImplementation(async () => ({ ok: true, behind: behind-- > 0 }));
    start();
    await elapse(0);
    await elapse(REFRESH_DELAY_MS);
    await elapse(REFRESH_DELAY_MS);
    expect(sa_refreshPlayersCopy.mock.callCount()).toBe(3);
    await elapse(REFRESH_DELAY_MS);
    expect(sa_refreshPlayersCopy.mock.callCount()).toBe(3);
  });

  it("sends a long run of waiting steps a save's worth at a time", async () => {
    const { result } = start();
    const many = Array.from({ length: MAX_APPENDED_OPS + 5 }, (): AnnotationOp => ({
      t: "penClear",
    }));
    act(() => {
      for (const op of many) result.current.draw(op);
    });
    await elapse(SAVE_DELAY_MS);
    expect(sa_saveAnnotation.mock.calls.map((call) => call.arguments[1])).toEqual([
      { baseRevision: 3, keep: 1, append: many.slice(0, MAX_APPENDED_OPS) },
      { baseRevision: 4, keep: 1 + MAX_APPENDED_OPS, append: many.slice(MAX_APPENDED_OPS) },
    ]);
    expect(result.current.status).toBe("saved");
  });

  it("counts a flood's outline toward a save's size, so two large ones go in two saves", async () => {
    const { result } = start();
    const ring = Array.from({ length: 30_000 }, (_, i) => i % 400);
    const big: AnnotationOp = { t: "flood", mode: "reveal", rings: [ring] };
    act(() => {
      result.current.draw(big);
      result.current.draw(big);
    });
    await elapse(SAVE_DELAY_MS);
    expect(sa_saveAnnotation.mock.calls.map((call) => call.arguments[1].append.length)).toEqual([
      1, 1,
    ]);
  });

  it("undoes nothing when there is nothing to undo", () => {
    const { result } = start();
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.undo());
    expect(result.current.ops).toEqual([]);
  });
});
