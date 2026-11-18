// The halo every table sets its words in over the scene's cover: widening
// blurs of the background colour, the tightest repeated, so the halo is
// solid close to the letters and fades out rather than ending in a hard
// edge. In the page's own background colour rather than a box behind the
// words: dark text gets a light halo and light text a dark one, whichever
// theme is on, and with no cover the halo is the page itself and shows as
// nothing. HALO_FILTER is the same for an icon, which text-shadow cannot reach.
const HALO_COLOUR = "var(--chakra-colors-bg)";
export const HALO = [1, 1, 2, 4, 8, 12].map((px) => `0 0 ${px}px ${HALO_COLOUR}`).join(", ");
export const HALO_FILTER = [1, 2, 4, 6]
  .map((px) => `drop-shadow(0 0 ${px}px ${HALO_COLOUR})`)
  .join(" ");
