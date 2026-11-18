import { Box } from "@chakra-ui/react";
import { cssUrlValue } from "@/lib/stories";

type Props = {
  /** The picture, filling the parent; with null only the fallback colour is drawn. */
  url: string | null;
  /**
   * What darkens the picture so text reads on it. "gradient" is the pages':
   * dark at the bottom for the date, lighter but present at the top so the
   * title reads on a bright cover. "deep-gradient" is the cards': the same
   * ends, deeper in the middle, since white summary text runs through it and
   * a pale cover would wash it out. "flat" is the tables': an even tint under
   * the pills. "none" shows the picture as it is, for a table whose details
   * are hidden.
   */
  scrim: "gradient" | "deep-gradient" | "flat" | "none";
  /** A colour behind the picture, for a card drawn before any cover is chosen. */
  fallback?: string;
  /** For a test to find the picture by. */
  testId?: string;
};

/**
 * A cover picture filling its parent, with the scrim over it. The parent is
 * `position="relative"` and what sits on the cover comes after this with
 * `position="relative"` too, so it draws above. The picture is a background
 * image set by inline style: `cssUrlValue` escapes the address, since a
 * url() built from a stored string is otherwise a way into the stylesheet.
 */
export function CoverBackdrop({ url, scrim, fallback, testId }: Props) {
  return (
    <>
      <Box
        aria-hidden
        data-testid={testId}
        position="absolute"
        inset="0"
        bg={fallback}
        bgSize="cover"
        bgPos="center"
        style={url ? { backgroundImage: `url("${cssUrlValue(url)}")` } : undefined}
      />
      {(scrim === "gradient" || scrim === "deep-gradient") && (
        <Box
          position="absolute"
          inset="0"
          bgGradient="to-b"
          gradientFrom="blackAlpha.700"
          gradientVia={scrim === "deep-gradient" ? "blackAlpha.600" : "blackAlpha.400"}
          gradientTo="blackAlpha.800"
        />
      )}
      {scrim === "flat" && <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.400" />}
    </>
  );
}
