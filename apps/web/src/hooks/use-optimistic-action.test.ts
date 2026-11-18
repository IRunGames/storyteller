import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  OptimisticResult,
  useOptimisticAction as UseOptimisticAction,
} from "./use-optimistic-action";

const create = mock.fn<(toast: { title?: string; type?: string }) => string>(() => "id");
let useOptimisticAction: typeof UseOptimisticAction;

/** A promise the test settles by hand, so it can look at the state between press and answer. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useOptimisticAction", () => {
  before(async () => {
    mock.module("@/components/ui/toaster", { namedExports: { toaster: { create } } });
    ({ useOptimisticAction } = await import("./use-optimistic-action"));
  });

  beforeEach(() => {
    create.mock.resetCalls();
  });

  it("shows the choice at once and keeps it when the action answers ok", async () => {
    const run = mock.fn(async (): Promise<OptimisticResult<string>> => ({ ok: true }));
    const { result } = renderHook(() => useOptimisticAction("a", run, { failed: "Failed." }));

    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");

    await waitFor(() => expect(result.current[2]).toBe(false));
    expect(result.current[0]).toBe("b");
    expect(run.mock.calls[0].arguments).toEqual(["b"]);
    expect(create.mock.callCount()).toBe(0);
  });

  it("settles on the value the action answers with", async () => {
    const run = async (): Promise<OptimisticResult<string>> => ({ ok: true, value: "c" });
    const { result } = renderHook(() => useOptimisticAction("a", run, { failed: "Failed." }));

    act(() => result.current[1]("b"));
    await waitFor(() => expect(result.current[0]).toBe("c"));
  });

  it("puts the previous value back and toasts the refusal's own words", async () => {
    const run = async (): Promise<OptimisticResult<string>> => ({ ok: false, error: "Not yours." });
    const { result } = renderHook(() => useOptimisticAction("a", run, { failed: "Failed." }));

    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");

    await waitFor(() => expect(result.current[0]).toBe("a"));
    expect(create.mock.calls[0].arguments[0]).toEqual({ title: "Not yours.", type: "error" });
  });

  it("puts the previous value back and toasts `failed` when the action throws", async () => {
    const run = async (): Promise<OptimisticResult<string>> => {
      throw new Error("network");
    };
    const { result } = renderHook(() => useOptimisticAction("a", run, { failed: "Failed." }));

    act(() => result.current[1]("b"));
    await waitFor(() => expect(result.current[0]).toBe("a"));
    expect(create.mock.calls[0].arguments[0]).toEqual({ title: "Failed.", type: "error" });
  });

  it("is pending from the press until the answer", async () => {
    const answer = deferred<OptimisticResult<string>>();
    const { result } = renderHook(() =>
      useOptimisticAction("a", () => answer.promise, { failed: "Failed." }),
    );
    expect(result.current[2]).toBe(false);

    act(() => result.current[1]("b"));
    await waitFor(() => expect(result.current[2]).toBe(true));

    await act(async () => answer.resolve({ ok: true }));
    await waitFor(() => expect(result.current[2]).toBe(false));
  });

  it("follows the value given when it changes underneath", () => {
    const run = async (): Promise<OptimisticResult<string>> => ({ ok: true });
    const { result, rerender } = renderHook(
      ({ current }) => useOptimisticAction(current, run, { failed: "Failed." }),
      { initialProps: { current: "a" } },
    );

    rerender({ current: "z" });
    expect(result.current[0]).toBe("z");
  });

  it("tells onShow about the choice, then about what was put back", async () => {
    const shown: string[] = [];
    const run = async (): Promise<OptimisticResult<string>> => ({ ok: false, error: "No." });
    const { result } = renderHook(() =>
      useOptimisticAction("a", run, { onShow: (value) => shown.push(value), failed: "Failed." }),
    );

    act(() => result.current[1]("b"));
    await waitFor(() => expect(result.current[0]).toBe("a"));
    expect(shown).toEqual(["b", "a"]);
  });

  it("tells onShow what the action settled on", async () => {
    const shown: string[] = [];
    const run = async (): Promise<OptimisticResult<string>> => ({ ok: true, value: "c" });
    const { result } = renderHook(() =>
      useOptimisticAction("a", run, { onShow: (value) => shown.push(value), failed: "Failed." }),
    );

    act(() => result.current[1]("b"));
    await waitFor(() => expect(result.current[0]).toBe("c"));
    expect(shown).toEqual(["b", "c"]);
  });
});
