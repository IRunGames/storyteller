import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDebouncedSearch } from "./use-debounced-search";

// Real timers, kept short: fake timers would also have to drive React's
// scheduler, and ten milliseconds is long enough to tell "waited" from "at
// once" without slowing the suite.
const DELAY = 30;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A promise the test settles by hand, so a slow answer can arrive after a newer search. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Props = { key: string; typed?: string; enabled?: boolean };

describe("useDebouncedSearch", () => {
  it("asks once the pause after the last change, and hands the answer to onResult", async () => {
    const search = mock.fn(async (key: string) => `found ${key}`);
    const results: string[] = [];
    const { result, rerender } = renderHook(
      ({ key }: Props) =>
        useDebouncedSearch(() => search(key), {
          key,
          delay: DELAY,
          onResult: (r) => results.push(r),
        }),
      { initialProps: { key: "a" } },
    );
    expect(result.current.isSearching).toBe(true);

    // Two more keystrokes inside the pause: only the last asks.
    rerender({ key: "ab" });
    rerender({ key: "abc" });
    await sleep(DELAY / 2);
    expect(search.mock.callCount()).toBe(0);

    await waitFor(() => expect(results).toEqual(["found abc"]));
    expect(search.mock.callCount()).toBe(1);
    expect(result.current.isSearching).toBe(false);
  });

  it("drops a slow answer that a newer search has outdated", async () => {
    const first = deferred<string>();
    const results: string[] = [];
    const { rerender } = renderHook(
      ({ key }: Props) =>
        useDebouncedSearch(() => (key === "a" ? first.promise : Promise.resolve(`found ${key}`)), {
          key,
          delay: DELAY,
          onResult: (r) => results.push(r),
        }),
      { initialProps: { key: "a" } },
    );
    // Let the first search be asked, then move on before it answers.
    await sleep(DELAY * 2);
    rerender({ key: "b" });
    await waitFor(() => expect(results).toEqual(["found b"]));

    await act(async () => first.resolve("found a"));
    await sleep(DELAY);
    expect(results).toEqual(["found b"]);
  });

  it("leaves the last answer in place when a search fails, and is no longer searching", async () => {
    let fail = false;
    const results: string[] = [];
    const { result, rerender } = renderHook(
      ({ key }: Props) =>
        useDebouncedSearch(
          () => (fail ? Promise.reject(new Error("network")) : Promise.resolve(`found ${key}`)),
          { key, delay: DELAY, onResult: (r) => results.push(r) },
        ),
      { initialProps: { key: "a" } },
    );
    await waitFor(() => expect(results).toEqual(["found a"]));

    fail = true;
    rerender({ key: "b" });
    expect(result.current.isSearching).toBe(true);
    await waitFor(() => expect(result.current.isSearching).toBe(false));
    expect(results).toEqual(["found a"]);
  });

  it("asks nothing while disabled, and drops an answer in flight when it becomes disabled", async () => {
    const pending = deferred<string>();
    const search = mock.fn(() => pending.promise);
    const results: string[] = [];
    const { result, rerender } = renderHook(
      ({ key, enabled }: Props) =>
        useDebouncedSearch(search, {
          key,
          delay: DELAY,
          enabled,
          onResult: (r) => results.push(r),
        }),
      { initialProps: { key: "", enabled: false } },
    );
    expect(result.current.isSearching).toBe(false);
    await sleep(DELAY * 2);
    expect(search.mock.callCount()).toBe(0);

    rerender({ key: "a", enabled: true });
    await waitFor(() => expect(search.mock.callCount()).toBe(1));
    rerender({ key: "", enabled: false });
    expect(result.current.isSearching).toBe(false);
    await act(async () => pending.resolve("found a"));
    await sleep(DELAY);
    expect(results).toEqual([]);
  });

  it("asks at once when the key changed but what was typed did not", async () => {
    const search = mock.fn(async (key: string) => key);
    const { rerender } = renderHook(
      ({ key, typed }: Props) =>
        useDebouncedSearch(() => search(key), { key, typed, delay: DELAY, onResult: () => {} }),
      { initialProps: { key: "tab1|", typed: "" } },
    );
    await waitFor(() => expect(search.mock.callCount()).toBe(1));

    // A change of tab with the same text asks without the pause.
    rerender({ key: "tab2|", typed: "" });
    await sleep(DELAY / 3);
    expect(search.mock.callCount()).toBe(2);

    // A keystroke waits.
    rerender({ key: "tab2|x", typed: "x" });
    await sleep(DELAY / 3);
    expect(search.mock.callCount()).toBe(2);
    await waitFor(() => expect(search.mock.callCount()).toBe(3));
  });

  it("counts the searches asked for, so a loader working for one can tell when it is outdated", async () => {
    const { result, rerender } = renderHook(
      ({ key }: Props) =>
        useDebouncedSearch(async () => key, { key, delay: DELAY, onResult: () => {} }),
      { initialProps: { key: "a" } },
    );
    const before = result.current.count();
    rerender({ key: "b" });
    expect(result.current.count()).toBe(before + 1);
    expect(result.current.count()).toBe(before + 1);
  });
});
