import { toaster } from "@/components/ui/toaster";
import { rollText } from "@/lib/roll";
import type { RollAllResult } from "./actions";

/** The toast when a roll never reached the server. */
export const ROLLS_FAILED = "The rolls could not be made. Try again.";

/**
 * Says what a Roll All did, as a single die's roll is said: a refusal in an
 * error toast, nothing to roll as a note, and the quiet rolls, the ones not
 * posted to the chat, together in one toast under the group's or stat's
 * label. A roll that was posted is in the chat already and needs no toast.
 * Shared by the stat block's group header and the run page's stats pane.
 */
export function toastRollAll(label: string, result: RollAllResult) {
  if (!result.ok) {
    toaster.create({ title: result.error, type: "error" });
    return;
  }
  if (result.rolls.length === 0) {
    toaster.create({ title: "There was nothing to roll.", type: "info" });
    return;
  }
  const quiet = result.rolls.filter((rolled) => !rolled.posted);
  if (quiet.length > 0) {
    toaster.create({
      title: `${label} rolled quietly`,
      description: quiet.map((rolled) => rollText(rolled.roll)).join(" · "),
      type: "info",
    });
  }
}
