import { useEffect, useRef } from "react";

/**
 * A ref that always holds the newest `value`, for a callback or a piece of
 * state that something living across renders reads: a channel's message
 * handler, an interval, an unmount cleanup, an upload that finishes under a
 * later render than it started in. Reading `ref.current` there gives what
 * the latest render passed, without the effect that owns the long-lived
 * thing having to restart whenever the value changes.
 *
 * The ref is written in an effect rather than during render, as the rules
 * of hooks ask; whatever reads it always runs after the commit that changed
 * it, since nothing reads a ref while React is still rendering.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
