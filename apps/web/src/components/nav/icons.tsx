// The themes' marks are the only hand-drawn icons in the app; every other
// icon comes from lucide-react. The theme menu shows them beside each theme's
// name and on its button. They are decorative: the control around them
// carries the accessible name. `data-icon` is there so a test can tell them apart,
// since a decorative SVG has no role or name to query by.

// The Halloween theme's mark: a jack-o'-lantern. The face is cut out
// of the body with the even-odd rule, so the header background shows through
// rather than a second colour, and the body has no stroke because a stroke
// would creep into the cut-outs.
export function PumpkinIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="pumpkin"
    >
      <path d="M12 6.5 C12.1 4.8 12.7 3.7 14 3" fill="none" />
      <path
        fillRule="evenodd"
        stroke="none"
        d="M12 7 C10.8 6 9.2 5.7 7.7 6.2 C4.9 7.1 3 9.7 3 13 C3 16.7 5.4 20 8.4 20 C9.8 20 11 19.5 12 18.7 C13 19.5 14.2 20 15.6 20 C18.6 20 21 16.7 21 13 C21 9.7 19.1 7.1 16.3 6.2 C14.8 5.7 13.2 6 12 7 Z M7.6 12 L10.2 12 L8.9 9.8 Z M13.8 12 L16.4 12 L15.1 9.8 Z M7 14.2 L9.2 15.6 L10.6 14.2 L12 15.6 L13.4 14.2 L14.8 15.6 L17 14.2 L16 17 L8 17 Z"
      />
    </svg>
  );
}

// The Blackberry theme's mark: a cluster of drupelets under a stem and
// leaf. The circles are packed so their outline stays bumpy at 28px, which
// is what makes the shape read as a berry rather than a blob.
export function BerryIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="berry"
    >
      <path d="M12 6.5 C12 4.8 12.8 3.5 14.5 2.8" fill="none" />
      <path d="M11.5 6 C10 4.6 8.4 4.3 6.6 5 C7.8 6.4 9.5 6.9 11.5 6 Z" stroke="none" />
      <g stroke="none">
        <circle cx="9.7" cy="9" r="2.6" />
        <circle cx="14.3" cy="9" r="2.6" />
        <circle cx="7.4" cy="13" r="2.6" />
        <circle cx="12" cy="13" r="2.6" />
        <circle cx="16.6" cy="13" r="2.6" />
        <circle cx="9.7" cy="17" r="2.6" />
        <circle cx="14.3" cy="17" r="2.6" />
        <circle cx="12" cy="20.4" r="2.6" />
      </g>
    </svg>
  );
}

// The Mint theme's mark: a sprig of three leaves on a stem. Each
// midrib is cut out of its leaf with the even-odd rule, as the pumpkin's face
// is, so the header background shows through and the leaves keep a single
// colour. The leaves have no stroke for the same reason as the pumpkin body.
export function SprigIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="sprig"
    >
      <path d="M12 21 L12 14" fill="none" />
      <g stroke="none" fillRule="evenodd">
        <path d="M12 13.5 C8.4 10.8 8.4 4.6 12 2 C15.6 4.6 15.6 10.8 12 13.5 Z M11.6 11.8 L11.6 4.4 L12.4 4.4 L12.4 11.8 Z" />
        <path d="M12 14.5 C10 10.5 5.8 9.3 2.3 11 C3.6 15.6 8.4 17.2 12 14.5 Z M10.6 13.8 L4.2 11.3 L4.5 10.6 L10.9 13.1 Z" />
        <path d="M12 14.5 C14 10.5 18.2 9.3 21.7 11 C20.4 15.6 15.6 17.2 12 14.5 Z M13.4 13.8 L19.8 11.3 L19.5 10.6 L13.1 13.1 Z" />
      </g>
    </svg>
  );
}

// The Wave theme's mark: a breaking wave over a ripple. The crest's
// curl is the hollow of a single filled shape rather than a stroked spiral,
// so it keeps its weight at 28px, and it has no stroke for the same reason
// as the pumpkin body. The ripple is a stroke, as the stems are.
export function WaveIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="wave"
    >
      <path
        stroke="none"
        d="M2 19 C2.5 11.5 7.5 4.5 14.5 3.6 C18.6 3.1 21.6 5.2 22 8.6 C20.2 6.9 17.2 7 15.6 8.9 C14 10.8 14.6 13.4 17 14 C14.6 15.8 11.4 15.2 10.4 12.8 C8.8 15.2 8.8 17.4 10.2 19 Z"
      />
      <path
        d="M2 21.5 C4 20.3 6 20.3 8 21.5 C10 22.7 12 22.7 14 21.5 C16 20.3 18 20.3 20 21.5"
        fill="none"
        strokeWidth="1.6"
      />
    </svg>
  );
}

// The Ember theme's mark: a flame with two sparks drifting off it. The
// inner tongue is cut out of the flame with the even-odd rule, as the
// pumpkin's face is, so the header background shows through and the mark
// keeps a single colour. No stroke, for the same reason as the pumpkin body.
export function FlameIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="flame"
    >
      <g stroke="none">
        <path
          fillRule="evenodd"
          d="M12 2 C13 5.5 17.5 8 17.5 13.5 C17.5 17.5 15 21 12 21 C9 21 6.5 18.5 6.5 15 C6.5 12 8.3 10.2 9.4 8.6 C9.6 10.3 10.4 11.4 11.4 11.8 C11 8.4 11.2 5 12 2 Z M12 19 C13.6 19 14.8 17.6 14.8 15.8 C14.8 14 13.4 12.8 12.6 11.6 C12.3 13.2 11.4 14 10.4 14.4 C9.6 14.8 9.2 15.6 9.2 16.4 C9.2 17.9 10.5 19 12 19 Z"
        />
        <circle cx="18.8" cy="5.2" r="1.1" />
        <circle cx="5.6" cy="7" r="0.8" />
      </g>
    </svg>
  );
}

// The White Out theme's mark: a snowman in a top hat, with stick arms. The
// eyes and buttons are cut out of the head and body with the even-odd rule,
// as the pumpkin's face is, so the header background shows through. Head and
// body are separate paths because, under the even-odd rule, the place where
// one path's circles overlap would be cut out too. No stroke on the fills,
// for the same reason as the pumpkin body; the arms are strokes, as the
// stems are.
export function SnowmanIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="snowman"
    >
      <path d="M7.4 16.2 L3.4 13 M16.6 16.2 L20.6 13" fill="none" strokeWidth="1.6" />
      <g stroke="none">
        <path d="M9.6 2.2 H14.4 V6.6 H9.6 Z M7.8 6.4 H16.2 V7.8 H7.8 Z" />
        <path
          fillRule="evenodd"
          d="M8.4 10.6 A3.6 3.6 0 1 0 15.6 10.6 A3.6 3.6 0 1 0 8.4 10.6 Z M9.85 10.2 A0.75 0.75 0 1 0 11.35 10.2 A0.75 0.75 0 1 0 9.85 10.2 Z M12.65 10.2 A0.75 0.75 0 1 0 14.15 10.2 A0.75 0.75 0 1 0 12.65 10.2 Z"
        />
        <path
          fillRule="evenodd"
          d="M7.2 18.2 A4.8 4.8 0 1 0 16.8 18.2 A4.8 4.8 0 1 0 7.2 18.2 Z M11.2 16.6 A0.8 0.8 0 1 0 12.8 16.6 A0.8 0.8 0 1 0 11.2 16.6 Z M11.2 19.8 A0.8 0.8 0 1 0 12.8 19.8 A0.8 0.8 0 1 0 11.2 19.8 Z"
        />
      </g>
    </svg>
  );
}

// The Yule theme's mark: a wreath of leaves tied with a bow. The ring is
// one scalloped path, open at the bottom where the bow sits, and its berries
// are cut out of it with the even-odd rule, as the pumpkin's face is, so the
// header background shows through. It is one outline rather than a ring of
// overlapping circles because, under the even-odd rule, the overlaps would be
// cut out too. No stroke on the fills, for the same reason as the pumpkin
// body; the bow's tails are strokes, as the stems are.
export function WreathIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="wreath"
    >
      <path d="M11.2 18.4 L9.6 22 M12.8 18.4 L14.4 22" fill="none" strokeWidth="1.6" />
      <g stroke="none">
        <path
          fillRule="evenodd"
          d="M6.73 16.68 A2.46 2.46 0 0 1 4.24 13.05 A2.46 2.46 0 0 1 3.99 8.66 A2.46 2.46 0 0 1 6.04 4.77 A2.46 2.46 0 0 1 9.8 2.5 A2.46 2.46 0 0 1 14.2 2.5 A2.46 2.46 0 0 1 17.96 4.77 A2.46 2.46 0 0 1 20.01 8.66 A2.46 2.46 0 0 1 19.76 13.05 A2.46 2.46 0 0 1 17.27 16.68 L15.47 14.54 A1.68 1.68 0 0 1 17.11 12.15 A1.68 1.68 0 0 1 17.28 9.26 A1.68 1.68 0 0 1 15.93 6.69 A1.68 1.68 0 0 1 13.45 5.2 A1.68 1.68 0 0 1 10.55 5.2 A1.68 1.68 0 0 1 8.07 6.69 A1.68 1.68 0 0 1 6.72 9.26 A1.68 1.68 0 0 1 6.89 12.15 A1.68 1.68 0 0 1 8.53 14.54 Z M4.38 10.99 A0.85 0.85 0 1 0 6.08 10.99 A0.85 0.85 0 1 0 4.38 10.99 Z M7.25 4.83 A0.85 0.85 0 1 0 8.95 4.83 A0.85 0.85 0 1 0 7.25 4.83 Z M14.02 4.24 A0.85 0.85 0 1 0 15.72 4.24 A0.85 0.85 0 1 0 14.02 4.24 Z M17.92 9.81 A0.85 0.85 0 1 0 19.62 9.81 A0.85 0.85 0 1 0 17.92 9.81 Z"
        />
        <path d="M11 16.8 C9.4 15 6.8 14.8 6.8 17.4 C6.8 20 9.4 19.8 11 18 Z M13 16.8 C14.6 15 17.2 14.8 17.2 17.4 C17.2 20 14.6 19.8 13 18 Z" />
        <circle cx="12" cy="17.4" r="1.4" />
      </g>
    </svg>
  );
}
