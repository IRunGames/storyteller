import { useEffect, useRef, useState } from "react";
import { useLatest } from "./use-latest";

type Options<T> = {
  /**
   * Everything the search asks about, as one string: what is typed, the
   * filters that go with it, the row it is narrowed to. A change starts the
   * pause over and outdates whatever is still in flight.
   */
  key: string;
  /** How long to wait after the last change before asking, in ms. */
  delay: number;
  /**
   * The typed part of the key, when a change of the rest should ask at once:
   * the keystrokes wait out the pause, a change of tab does not. Left out,
   * every change waits.
   */
  typed?: string;
  /** False asks nothing and drops an answer in flight: a closed popover, an empty box. */
  enabled?: boolean;
  /** Given the answer to the latest search, and only that one. */
  onResult: (result: T) => void;
};

/**
 * A search box that goes to the database: asks once the typing has paused
 * rather than once a letter, and only ever applies the answer to what the
 * box says now. A slow answer to an earlier query is dropped rather than
 * landing on top of newer results, and a failed search leaves the last
 * results in place, since the next keystroke asks again.
 *
 * `search` and `onResult` are read through refs, so the effect re-runs on
 * the key alone and a caller can pass a fresh closure every render.
 *
 * `count()` says how many searches have been asked for so far. A loader
 * that pages on behalf of one search reads it before and after its own
 * request, and drops the page when a later search has outdated it.
 */
export function useDebouncedSearch<T>(
  search: () => Promise<T>,
  { key, delay, typed, enabled = true, onResult }: Options<T>,
) {
  const [isSearching, setSearching] = useState(enabled);
  const seq = useRef(0);
  const lastTyped = useRef(typed);
  const searchRef = useLatest(search);
  const onResultRef = useLatest(onResult);

  useEffect(() => {
    const mine = ++seq.current;
    if (!enabled) return;
    const wait = typed === undefined || typed !== lastTyped.current ? delay : 0;
    lastTyped.current = typed;
    const timer = setTimeout(async () => {
      try {
        const found = await searchRef.current();
        if (mine === seq.current) onResultRef.current(found);
      } catch {
        // Leave the last results in place; the next keystroke tries again.
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, wait);
    return () => clearTimeout(timer);
  }, [key, typed, delay, enabled, searchRef, onResultRef]);

  // Searching from the change itself, not from the effect that starts the
  // timer: an effect that set state on every key change would draw the old
  // flag for a frame first.
  const [lastKey, setLastKey] = useState<[string, boolean]>([key, enabled]);
  if (lastKey[0] !== key || lastKey[1] !== enabled) {
    setLastKey([key, enabled]);
    setSearching(enabled);
  }

  return { isSearching, count: () => seq.current };
}
