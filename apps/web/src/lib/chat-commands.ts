// A table chat line that starts with "/" is a command, not something said.
// Read the same way in the chat panel, which refuses a mistyped command
// before sending it, and in sa_postChat, which is what acts on it.

const EXAMPLE = "/roll 2d6+1 for initiative";
const MAX_LABEL = 200;

// The dice at the start of a /roll, which may have spaces in them
// ("2d4 + 2"): an operand, then any number of operator-and-operand pairs.
// An operand is a dice group with whatever modifiers follow it unbroken
// ("4d6kh3", "3d6!", "4dF"), or a number, either in brackets. Whatever
// follows is the roll's text, so it starts at the first word that does not
// carry the sum on: "1d20 3 goblins" is 1d20 for "3 goblins", since a
// number with no operator before it is not part of the roll. Anything the
// shape lets through that the library cannot read is refused by rollDice.
const DICE = String.raw`\d*d(?:\d+|%|F)[a-z!<>=\d]*`;
const NUMBER = String.raw`\d+(?:\.\d+)?`;
const OPERAND = String.raw`\(*\s*(?:${DICE}|${NUMBER})(?:\s*\))*`;
const NOTATION = new RegExp(
  String.raw`^(${OPERAND}(?:\s*[-+*/^]\s*${OPERAND})*)(?=\s|$)([\s\S]*)$`,
  "i",
);

export type ChatCommand =
  | { ok: true; command: "roll"; notation: string; label: string | null }
  | { ok: false; error: string };

/**
 * The command a line asks for, or null for a line that is not a command.
 * The only command so far is /roll: its dice, then any text, which the
 * table sees after the total ("5 for initiative").
 */
export function parseChatCommand(text: string): ChatCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  const [, name = "", rest = ""] = /^\/(\S*)\s*([\s\S]*)$/.exec(trimmed) ?? [];
  if (name.toLowerCase() !== "roll") {
    return { ok: false, error: `There is no /${name}. Try ${EXAMPLE}.` };
  }

  const match = NOTATION.exec(rest);
  if (!match) return { ok: false, error: `Start with the dice: ${EXAMPLE}.` };
  const label = match[2].trim();
  if (label.length > MAX_LABEL) {
    return { ok: false, error: `Keep what the roll is for under ${MAX_LABEL} characters.` };
  }
  return { ok: true, command: "roll", notation: match[1], label: label === "" ? null : label };
}
