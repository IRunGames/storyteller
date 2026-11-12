import { z } from "zod";

// A roll as the table chat keeps and shows it, made on the server by
// rollDice (lib/dice.ts). Kept apart from the roller so the browser, which
// checks a roll off the chat topic against this, never loads the dice
// library.

/** As long as a roll's notation may be. */
export const MAX_ROLL_NOTATION = 100;

/**
 * A dice group as written: "2d6", "d%", "4dF". Shared with the server's
 * roller, which counts the groups before the dice library sees them, and
 * with the template editor, which asks only whether there is one.
 */
export const ROLL_GROUP = /(\d*)d(\d+|%|F)/gi;

/**
 * The dice a dice stat holds, as "xdy" for x dice of y sides, with "+z" or
 * "-z" added on when there is one: "2d6", "1d8", "2d6+2". The count may be
 * left off ("d8") and reads as 1; a modifier of 0 is dropped. Written back
 * tidily, lower-case and without spaces, so the table can roll it as it
 * stands; null for anything else.
 */
export function normalizeDice(text: string): string | null {
  const match = /^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/i.exec(text.trim());
  if (!match) return null;
  const count = match[1] === "" ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  if (count < 1 || sides < 1) return null;
  const modifier = match[4] === undefined ? 0 : Number(match[4]);
  return `${count}d${sides}${modifier === 0 ? "" : `${match[3]}${modifier}`}`;
}

/**
 * Whether a text could be a roll: short enough and holding at least one
 * dice group. The roller on the server has the last word; this is what the
 * browser can say without the dice library.
 */
export function isRollNotation(text: string): boolean {
  return text.length <= MAX_ROLL_NOTATION && [...text.matchAll(ROLL_GROUP)].length > 0;
}

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
