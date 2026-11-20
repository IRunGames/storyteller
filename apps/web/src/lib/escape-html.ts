// Its own module rather than a helper in email.ts: tests that replace
// @/lib/email with a mock would otherwise take this away from the mail
// builders that import it.

/** Escapes text for an HTML body; names and titles are typed by people. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
