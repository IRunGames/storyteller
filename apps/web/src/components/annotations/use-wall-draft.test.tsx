import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, renderHook } from "@testing-library/react";

import { useWallDraft } from "./use-wall-draft";

describe("useWallDraft", () => {
  // Every corner in open space on a picture of 400 by 200: the wall finished
  // by finish() loops back to its first corner.
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
    expect(onWall.mock.calls.map((c) => c.arguments[0])).toEqual([
      [20, 20, 80, 20, 80, 80, 20, 20],
    ]);
    expect(result.current.draft).toBeNull();
    act(() => void expect(result.current.finish()).toBe(false));
    act(() => void expect(result.current.undo()).toBe(false));
  });

  // A wall that starts on the map's edge ends on the next touch: the click
  // there hands it over, with no Escape.
  it("hands a wall over when a click lands on a touch, its first corner touching too", () => {
    const onWall = mock.fn((_points: number[]) => {});
    const { result } = renderHook(() => useWallDraft([], 400, 200, onWall));
    act(() => result.current.place({ x: 0, y: 50, on: "touch" }));
    act(() => result.current.place({ x: 100, y: 50, on: null }));
    act(() => result.current.place({ x: 100, y: 0, on: "touch" }));
    expect(onWall.mock.calls.map((c) => c.arguments[0])).toEqual([[0, 50, 100, 50, 100, 0]]);
    expect(result.current.draft).toBeNull();
  });

  it("drops a wall of one corner on undo, and one too short to close on finish", () => {
    const onWall = mock.fn((_points: number[]) => {});
    const { result } = renderHook(() => useWallDraft([], 400, 200, onWall));
    act(() => result.current.place({ x: 20, y: 20, on: null }));
    act(() => void expect(result.current.undo()).toBe(true));
    expect(result.current.draft).toBeNull();

    act(() => result.current.place({ x: 20, y: 20, on: null }));
    act(() => result.current.place({ x: 80, y: 20, on: null }));
    act(() => void expect(result.current.finish()).toBe(true));
    expect(result.current.draft).toBeNull();
    expect(onWall.mock.callCount()).toBe(0);
  });
});
