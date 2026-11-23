import { chakra } from "@chakra-ui/react";
import { CloudFog } from "lucide-react";

// A frame this small on either side is too small for the words: they wrap
// to lines clipped by the frame, or shrink to an unreadable smudge at 6px.
// There the note is a fog glyph on the same backing instead.
const SMALL_FRAME = "@container (max-width: 44px), (max-height: 44px)";

// Chakra's srOnly, inside the container query: out of sight in a small frame,
// still read out by a screen reader.
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: "0",
};

/**
 * "Image is covered in fog", centered over a picture that is a players' copy
 * showing nothing of it (PictureState.fogCovered): fogged whole, the copy is
 * a plain block of the fog's color, and neither the storyteller nor a player
 * could otherwise tell what it is. Only words over the picture; the copy
 * itself is unchanged.
 *
 * Laid over the whole of its positioned parent, the picture's frame, and
 * let every press through to the picture under it (pointer-events none);
 * a control drawn after it in the frame, the fog mark, the tack or the
 * cover star, stays on top. The frame is its size container, so the words
 * are sized to the picture: about a sixth of its smaller side, small on a
 * thumbnail and capped on a full-size preview. In a frame of 44px or less
 * on either side (a library row, the scene's pictures trigger) the words
 * cannot be read, so a fog glyph takes their place on the same backing; the
 * words stay, visually hidden, for a screen reader. Spans throughout, since
 * a thumbnail's frame is a button.
 *
 * Light words on a translucent dark backing rather than theme tokens: the
 * fog is whatever color the storyteller chose, and the words have to read
 * the same over a light fog and a dark one in every theme.
 */
export function FogCoveredNote() {
  return (
    <chakra.span
      data-testid="fog-covered-note"
      position="absolute"
      inset="0"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
      pointerEvents="none"
      css={{ containerType: "size" }}
    >
      <chakra.span
        maxW="90%"
        px="0.5em"
        py="0.25em"
        rounded="sm"
        bg="blackAlpha.700"
        color="white"
        fontWeight="medium"
        lineHeight="1.15"
        textAlign="center"
        css={{ fontSize: "clamp(6px, 16cqmin, 18px)", [SMALL_FRAME]: { padding: "2px" } }}
      >
        <chakra.span css={{ [SMALL_FRAME]: VISUALLY_HIDDEN }}>Image is covered in fog</chakra.span>
        <chakra.span
          display="none"
          css={{
            [SMALL_FRAME]: { display: "block" },
            "& svg": { boxSize: "clamp(8px, 50cqmin, 20px)" },
          }}
        >
          <CloudFog />
        </chakra.span>
      </chakra.span>
    </chakra.span>
  );
}
