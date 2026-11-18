import { describe, it } from "node:test";
import { expect } from "expect";
import { act, renderHook } from "@testing-library/react";
import { useLatest } from "./use-latest";

describe("useLatest", () => {
  it("holds the value of the latest render once it has committed", () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: "first" },
    });
    expect(result.current.current).toBe("first");
    rerender({ value: "second" });
    expect(result.current.current).toBe("second");
  });

  it("is one ref for the life of the component, so a closure made once still reads the newest value", () => {
    const { result, rerender } = renderHook(({ onEvent }) => useLatest(onEvent), {
      initialProps: { onEvent: (() => "a") as () => string },
    });
    const ref = result.current;
    // What a long-lived handler would hold: the ref, taken on the first render.
    const read = () => ref.current();
    expect(read()).toBe("a");
    act(() => rerender({ onEvent: () => "b" }));
    expect(result.current).toBe(ref);
    expect(read()).toBe("b");
  });
});
