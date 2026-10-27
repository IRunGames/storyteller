import { z } from "zod";

// A roll as the table chat keeps and shows it, made on the server by
// rollDice (lib/dice.ts). Kept apart from the roller so the browser, which
// checks a roll off the chat topic against this, never loads the dice
// library.

export const rollSchema = z.object({
  /** As typed: "2d4+2". */
  notation: z.string(),
  /** The text typed after the dice: "for initiative", or null. */
  label: z.string().nullable(),
  total: z.number(),
  /** Every die as it landed, and whether it counted (a kept or dropped die). */
  dice: z.array(z.object({ value: z.number(), dropped: z.boolean() })),
  /** The roll written out: "2d4+2: [3, 1]+2 = 6". */
  detail: z.string(),
});
export type Roll = z.infer<typeof rollSchema>;

/** The line a roll says in the chat: the total then its text, "6 for initiative", or "6". */
export function rollText(roll: Pick<Roll, "total" | "label">): string {
  return roll.label ? `${roll.total} ${roll.label}` : String(roll.total);
}
