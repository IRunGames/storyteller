"use client";

import { useEffect, useRef, useState } from "react";

/** How long the table may go untouched before the storyteller is asked. */
export const INACTIVE_AFTER_MS = 20 * 60_000;
/** How long the question waits for an answer before it counts as no. */
export const ANSWER_WITHIN_MS = 5 * 60_000;
// How often the clock is read. The check compares timestamps rather than
// waiting on one long timer, because a browser slows the timers of a tab in
// the background and stops them while the computer sleeps; a timestamp is
// right whenever it is next read.
const CHECK_EVERY_MS = 15_000;

// What counts as someone at the table. Listened for on the window in the
// capture phase, so a component that stops propagation still counts.
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];

/**
 * Watches the page for someone using it while `enabled`. After
 * INACTIVE_AFTER_MS with nothing, `asking` turns true; `stillHere` answers
 * yes and starts the wait again. With no answer for ANSWER_WITHIN_MS more,
 * `onTimeout` is called once.
 *
 * The answer's deadline runs from when the table went quiet plus
 * INACTIVE_AFTER_MS, not from when the question was first drawn, so a
 * computer woken from a long sleep times out at once rather than asking a
 * room that has been empty for hours. While asking, activity is not
 * counted: only an answer to the question keeps the session going.
 */
export function useInactivity({
  enabled,
  onTimeout,
}: {
  enabled: boolean;
  onTimeout: () => void;
}): { asking: boolean; stillHere: () => void } {
  const [asking, setAsking] = useState(false);
  // Set when the watch starts; see the effect.
  const lastActivity = useRef(0);
  const askingRef = useRef(false);
  // Kept in a ref so the interval need not restart when the caller passes a
  // new function each render.
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!enabled) return;
    // A table that has just become active (a resumed session) starts its
    // wait from now rather than from its last activity before the pause.
    lastActivity.current = Date.now();

    const seen = () => {
      if (!askingRef.current) lastActivity.current = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, seen, { capture: true, passive: true });
    }
    const check = () => {
      const quiet = Date.now() - lastActivity.current;
      if (quiet >= INACTIVE_AFTER_MS + ANSWER_WITHIN_MS) {
        // Started again from now, so a refused suspension is not retried
        // every check; the caller's status change usually ends the watch.
        lastActivity.current = Date.now();
        askingRef.current = false;
        setAsking(false);
        onTimeoutRef.current();
      } else if (quiet >= INACTIVE_AFTER_MS && !askingRef.current) {
        askingRef.current = true;
        setAsking(true);
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      // A question left up when the watch ends (the session suspended or
      // ended from the chip) is taken down, so a later watch starts clean.
      askingRef.current = false;
      setAsking(false);
      clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, seen, { capture: true });
      }
    };
  }, [enabled]);

  const stillHere = () => {
    lastActivity.current = Date.now();
    askingRef.current = false;
    setAsking(false);
  };

  return { asking, stillHere };
}
