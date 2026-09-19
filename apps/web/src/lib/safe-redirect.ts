const DEFAULT_DESTINATION = "/home";

/**
 * Narrows a caller-supplied `redirectTo` to a same-origin path.
 *
 * The value reaches us through a query string, so it is attacker-controlled:
 * "https://evil.example" or "//evil.example" would otherwise send a freshly
 * signed-in user straight off the site. Only a single-slash absolute path is
 * allowed through; anything else falls back to the default destination.
 */
export function safeRedirect(
  value: string | string[] | undefined,
  fallback = DEFAULT_DESTINATION,
) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.startsWith("/\\")
  ) {
    return fallback;
  }

  return candidate;
}
