/**
 * The pictures behind the landing page at "/", served from public/images.
 * Each is a 1920-wide WebP for the same reason as the waiting room's: the
 * picture fills the window, and a smaller one is stretched until its
 * compression shows. One is picked at random for each visit; see
 * pickWelcomeBackground.
 */
export const WELCOME_BACKGROUNDS = [
  "/images/hearth_welcome.webp",
  "/images/tavern_welcome.webp",
  "/images/dice_welcome.webp",
  "/images/laughter_welcome.webp",
  "/images/campfire_welcome.webp",
  "/images/starfire_welcome.webp",
  "/images/circle_welcome.webp",
] as const;

/**
 * One of WELCOME_BACKGROUNDS at random. The landing page calls it on the
 * server, as the waiting room's page does, rather than choosing in the
 * browser: a pick made during render on both sides would differ, and the
 * markup the server sent would not match the one React hydrates. The random
 * source is a parameter so a test can pin it.
 */
export function pickWelcomeBackground(random: () => number = Math.random): string {
  return WELCOME_BACKGROUNDS[Math.floor(random() * WELCOME_BACKGROUNDS.length)];
}
