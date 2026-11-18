import { useState, useTransition } from "react";
import { toaster } from "@/components/ui/toaster";

/**
 * What an action answers an optimistic change: ok, with the value it settled
 * on when that may differ from what was asked (a status the workflow mapped),
 * or a refusal with the words to show.
 */
export type OptimisticResult<T> = { ok: true; value?: T } | { ok: false; error: string };

type Options<T> = {
  /**
   * Whoever else holds the value, told what is shown now: the choice at once,
   * then what the action settled on, or the value put back after a refusal.
   * A pill whose list the parent owns passes the parent's setter here.
   */
  onShow?: (value: T) => void;
  /**
   * The toast when the action could not be reached at all. A refusal carries
   * its own words and is toasted as it is.
   */
  failed: string;
};

/**
 * A value changed from a control and saved by an action, shown changed
 * before the action answers: a menu that closes on a pill still reading the
 * old word looks like nothing happened. The change goes back if the action
 * refuses or cannot be reached, with the reason in a toast, since there is
 * nothing on the page for the user to correct.
 *
 * `shown` follows `current` whenever that changes underneath: a list that
 * reloaded, or another control's change to the same row, wins over what
 * this one last chose. The reset happens during render, as React asks for
 * state derived from a prop, rather than in an effect that would draw the
 * stale value for a frame first.
 */
export function useOptimisticAction<T>(
  current: T,
  run: (next: T) => Promise<OptimisticResult<T>>,
  { onShow, failed }: Options<T>,
): [shown: T, choose: (next: T) => void, pending: boolean] {
  const [shown, setShown] = useState(current);
  const [pending, startTransition] = useTransition();

  const [lastGiven, setLastGiven] = useState(current);
  if (lastGiven !== current) {
    setLastGiven(current);
    setShown(current);
  }

  function show(value: T) {
    setShown(value);
    onShow?.(value);
  }

  function choose(next: T) {
    const previous = shown;
    show(next);
    startTransition(async () => {
      try {
        const result = await run(next);
        if (result.ok) {
          if (result.value !== undefined) show(result.value);
          return;
        }
        show(previous);
        toaster.create({ title: result.error, type: "error" });
      } catch {
        show(previous);
        toaster.create({ title: failed, type: "error" });
      }
    });
  }

  return [shown, choose, pending];
}
