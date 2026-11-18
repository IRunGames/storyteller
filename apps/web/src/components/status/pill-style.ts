import { chakra, defineRecipe } from "@chakra-ui/react";

/**
 * Every status pill looks the same: the theme's highlight at full strength
 * with the contrasting text on it. No ramp, no mixing — which status a row
 * holds is said by the word, not by a shade, and a row of pills at nine
 * different intensities is harder to read than one that is flat.
 *
 * One recipe, so a status is the same colour wherever it is seen, worn by
 * the span that shows a row's status and the buttons that open a menu or
 * filter a column by status. A site's own touches (the hover edge, a
 * switched-off filter's outline) go on as props over it.
 */
export const statusPillRecipe = defineRecipe({
  base: {
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
    whiteSpace: "nowrap",
    bg: "status.accent",
    borderColor: "status.accent",
    color: "status.contrast",
  },
});

/** The pill that only shows a status. */
export const StatusPillSpan = chakra("span", statusPillRecipe);

/**
 * The pill that is pressed: a real button, which a span polymorphed with
 * `as` would not type as, and a trigger inside a form must not default to
 * submitting it, so every use gives it `type="button"`.
 */
export const StatusPillButton = chakra("button", statusPillRecipe);
