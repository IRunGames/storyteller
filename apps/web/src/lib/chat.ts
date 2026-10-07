/** One line in the table chat: something said, or a roll. */
export type ChatEntry = {
  id: string;
  /** Who sent it, as the chat shows them; the palette is keyed off this. */
  from: string;
  /** "8:05 PM", already formatted. */
  time: string;
} & (
  | { kind: "text"; text: string }
  | {
      kind: "roll";
      /** Each die as it landed. */
      dice: number[];
      /** What was added for an ability or skill, and its name. */
      modifier: { value: number; label: string } | null;
      total: number;
      /** "2d6". */
      formula: string;
      /** What the roll was for: "Spot the box". */
      label: string;
      outcome: "SUCCESS" | "FAILURE";
    }
);

// The palettes a sender's name and avatar can take. Chakra palettes rather
// than theme tokens: each needs a solid shade for the avatar and a readable
// one for the name, which colorPalette.solid and colorPalette.fg give in
// every theme.
const PALETTES = ["orange", "cyan", "purple", "teal", "pink", "blue", "yellow", "green"];

/**
 * The palette for a sender, the same every time for the same name, so a
 * person keeps their colour through the conversation. A small string hash;
 * it only has to spread names over eight colours.
 */
export function senderPalette(from: string): string {
  let hash = 0;
  for (const char of from) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

/**
 * The letters in a sender's avatar: the first letter of each of the first
 * two words ("David Williams" is DW), or the first two letters of a single
 * word ("Harry" is HA), so every avatar carries two and a one-word name is
 * not left with a lone letter.
 */
export function senderInitials(from: string): string {
  const words = from.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}
