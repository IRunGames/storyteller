// The brand marks are the only hand-drawn icons in the app; every other icon
// comes from lucide-react. They are decorative: the link around them carries
// the accessible name. `data-icon` is there so a test can tell them apart,
// since a decorative SVG has no role or name to query by.

export function SparkleIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="sparkle"
    >
      <path d="M11 4 L12.8 9.2 L18 11 L12.8 12.8 L11 18 L9.2 12.8 L4 11 L9.2 9.2 Z" />
      <path d="M18.5 3 L19.2 5 L21 5.7 L19.2 6.4 L18.5 8.4 L17.8 6.4 L16 5.7 L17.8 5 Z" />
    </svg>
  );
}

// The Halloween theme's brand mark: a jack-o'-lantern. The face is cut out
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

// The Blackberry theme's brand mark: a cluster of drupelets under a stem and
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
