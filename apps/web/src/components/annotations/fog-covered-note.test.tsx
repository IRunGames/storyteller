import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import { Box, Image } from "@chakra-ui/react";

import { renderWithProviders } from "@/test/render";
import { FogCoveredNote } from "./fog-covered-note";

describe("FogCoveredNote", () => {
  it("says the picture is covered in fog, and lets every press through to the picture", () => {
    renderWithProviders(
      <Box position="relative">
        <Image src="https://x.test/copy.webp" alt="Harbour map" />
        <FogCoveredNote />
      </Box>,
    );
    expect(screen.getByText("Image is covered in fog")).toBeInTheDocument();
    expect(screen.getByTestId("fog-covered-note")).toHaveStyle({ pointerEvents: "none" });
  });

  // jsdom applies no container query (it keeps none in its style sheets), so
  // the note here is the one a frame over 44px shows: the words, with the
  // glyph a smaller frame shows in their place ready but not shown, and
  // hidden from a screen reader, which reads the words in either.
  it("keeps a fog glyph ready for a frame too small for the words", () => {
    renderWithProviders(
      <Box position="relative" width="32px" height="32px">
        <FogCoveredNote />
      </Box>,
    );
    const note = screen.getByTestId("fog-covered-note");
    expect(note).toHaveTextContent("Image is covered in fog");
    const glyph = note.querySelector("svg");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph?.parentElement).toHaveStyle({ display: "none" });
  });
});
