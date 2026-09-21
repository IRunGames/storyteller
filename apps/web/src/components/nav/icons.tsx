// Inline stroke icons sized to the header's 44px buttons. All are decorative:
// the buttons they sit in carry the accessible names.

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
    >
      <path d="M11 4 L12.8 9.2 L18 11 L12.8 12.8 L11 18 L9.2 12.8 L4 11 L9.2 9.2 Z" />
      <path d="M18.5 3 L19.2 5 L21 5.7 L19.2 6.4 L18.5 8.4 L17.8 6.4 L16 5.7 L17.8 5 Z" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 16 V11 a6 6 0 0 1 12 0 v5 l1.5 2 H4.5 Z" />
      <path d="M10 20 a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

// Heart for the story card's favorite toggle. `filled` mirrors aria-pressed on
// the button; the button carries the accessible name.
export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20.5 C7.5 16.8 4 13.9 4 9.9 A4 4 0 0 1 12 8 A4 4 0 0 1 20 9.9 C20 13.9 16.5 16.8 12 20.5 Z" />
    </svg>
  );
}
