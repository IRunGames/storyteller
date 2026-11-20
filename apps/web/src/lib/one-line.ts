// Its own module rather than a helper in email.ts, as escape-html.ts is:
// tests that replace @/lib/email with a mock would otherwise take this away
// from the mail builders that import it.

/** Longest a value runs in a mail before it is cut short. */
const MAX_LENGTH = 200;

// Whitespace and every control character. \s alone misses NEL (U+0085),
// which some readers break the line on, and the rest of C0 and C1.
const BREAKS = /[\s\p{Cc}]+/gu;

// Bidi embeddings, overrides and isolates, which reorder the text after them
// on the line. The single marks (U+200E, U+200F) and the joiners stay: they
// reorder nothing, and emoji and some scripts need them.
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g;

/**
 * Text typed by people as a single line of bounded length, for a subject or
 * a mail's text part. A name or title can reach a mail builder unchecked
 * (Better Auth's endpoints do not run the forms' schemas, and Google's
 * profile name never meets them), and a line break in it would let it add
 * lines of its own: an "Email:" row in a notice, or a second link in an
 * invitation.
 */
export function oneLine(text: string): string {
  const line = text.replace(BIDI_CONTROLS, "").replace(BREAKS, " ").trim();
  return line.length > MAX_LENGTH ? `${line.slice(0, MAX_LENGTH)}…` : line;
}
