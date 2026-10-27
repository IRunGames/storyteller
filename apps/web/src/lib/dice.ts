import { DiceRoll, NumberGenerator } from "@dice-roller/rpg-dice-roller";
import type { Roll } from "./roll";

// The table chat's /roll, made on the server so a result cannot be faked:
// sa_postChat is the only caller. The browser never loads this, nor the
// dice library and the mathjs it brings; it reads rolls through lib/roll.ts.

const MAX_NOTATION = 100;
const MAX_DICE = 100;
const MAX_SIDES = 1000;
const UNREADABLE = "That is not a roll I can read. Try /roll 2d6+1.";

/** What the library draws its numbers from: anything with a next() giving a 32-bit integer. */
type Engine = { next(): number };

// The library's own nodeCrypto engine calls require(), which its ESM build
// cannot do, so this is the same thing over Web Crypto.
const cryptoEngine: Engine = {
  next: () => crypto.getRandomValues(new Int32Array(1))[0],
};

/** One die as the library hands it back. */
type LibraryDie = { value: number; useInTotal: boolean };

// A dice group as written: "2d6", "d%", "4dF". Counted before the library
// sees the notation, since a thousand dice of a million sides would be
// rolled before anything could refuse them.
const GROUP = /(\d*)d(\d+|%|F)/gi;

/**
 * A roll of the given notation, or why it cannot be made: too long, too
 * many dice or sides, or not a roll at all (a notation with no dice in it,
 * "12", is refused too, since there is nothing to roll). `engine` is for
 * tests, which pass the library's lowest- or highest-rolling one.
 */
export function rollDice(
  notation: string,
  label: string | null,
  engine: Engine = cryptoEngine,
): { ok: true; roll: Roll } | { ok: false; error: string } {
  if (notation.length > MAX_NOTATION) {
    return { ok: false, error: `Keep a roll under ${MAX_NOTATION} characters.` };
  }
  const groups = [...notation.matchAll(GROUP)];
  if (groups.length === 0) return { ok: false, error: UNREADABLE };
  const count = groups.reduce((sum, [, n]) => sum + (n === "" ? 1 : Number(n)), 0);
  const sides = Math.max(...groups.map(([, , s]) => (/^\d+$/.test(s) ? Number(s) : 100)));
  if (count > MAX_DICE || sides > MAX_SIDES) {
    return {
      ok: false,
      error: `Keep a roll to ${MAX_DICE} dice of up to ${MAX_SIDES} sides each.`,
    };
  }

  // The generator is the library's one shared instance; set on every roll
  // so a test's engine never outlives the roll it was passed for.
  NumberGenerator.generator.engine = engine;
  let rolled: DiceRoll;
  try {
    rolled = new DiceRoll(notation);
  } catch {
    return { ok: false, error: UNREADABLE };
  }

  // rolls holds each group's dice between the operators and numbers.
  const dice = rolled.rolls.flatMap((part) =>
    typeof part === "object" && part !== null && "rolls" in part
      ? (part.rolls as LibraryDie[]).map((die) => ({
          value: die.value,
          dropped: !die.useInTotal,
        }))
      : [],
  );
  return {
    ok: true,
    roll: { notation, label, total: rolled.total, dice, detail: rolled.output },
  };
}
