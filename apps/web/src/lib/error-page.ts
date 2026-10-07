/**
 * The pictures behind the error page, (app)/error.tsx. Each is a 1920-wide
 * WebP for the same reason as the waiting room's: the picture fills the
 * window, and a smaller one is stretched until its compression shows.
 */
export const ERROR_BACKGROUNDS = [
  "/images/m_error.webp",
  "/images/f_error.webp",
  "/images/d_error.webp",
] as const;

/**
 * One of ERROR_BACKGROUNDS. The error page is a client component with no
 * server render of its own to pick for it, as the waiting room's page does.
 * When the error came from the server it carries a digest, and the server
 * and the browser both see the same one, so the picture is read from the
 * digest and the markup each side draws agrees. An error thrown in the
 * browser has no digest, but it is only ever drawn there, so chance is safe.
 */
export function pickErrorBackground(
  digest: string | undefined,
  random: () => number = Math.random,
): string {
  if (digest) {
    let hash = 0;
    for (const char of digest) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return ERROR_BACKGROUNDS[hash % ERROR_BACKGROUNDS.length];
  }
  return ERROR_BACKGROUNDS[Math.floor(random() * ERROR_BACKGROUNDS.length)];
}
