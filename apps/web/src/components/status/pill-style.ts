/**
 * Every status pill looks the same: the theme's highlight at full strength
 * with the contrasting text on it. No ramp, no mixing — which status a row
 * holds is said by the word, not by a shade, and a row of pills at nine
 * different intensities is harder to read than one that is flat.
 *
 * Shared by the pill that shows a row's status and the pills that filter a
 * column by status, so a status is the same colour wherever it is seen.
 */
export function pillStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    px: "2",
    py: "0.5",
    // Square: a status is a block of colour with its word inside, not a
    // lozenge. The corners are sharp on purpose.
    rounded: "none",
    borderWidth: "1px",
    fontSize: "xs",
    fontWeight: "medium",
    lineHeight: "1.4",
    whiteSpace: "nowrap" as const,
    bg: "status.accent",
    borderColor: "status.accent",
    color: "status.contrast",
  };
}
