import { describe, it } from "node:test";
import { expect } from "expect";
import { renderWithProviders, screen } from "@/test/render";
import { CoverBackdrop } from "./cover-backdrop";

describe("CoverBackdrop", () => {
  it("draws the picture as an escaped background image", () => {
    renderWithProviders(
      <CoverBackdrop url={'https://x.test/a").png'} scrim="gradient" testId="cover" />,
    );
    const cover = screen.getByTestId("cover");
    expect(cover.style.backgroundImage).toContain("https://x.test/a");
    expect(cover.style.backgroundImage).not.toContain('a").png');
  });

  // The scrim is a sibling after the picture; "none" leaves the picture alone.
  it("draws a scrim for every value but none", () => {
    for (const scrim of ["gradient", "deep-gradient", "flat"] as const) {
      const { unmount } = renderWithProviders(
        <CoverBackdrop url="https://x.test/a.png" scrim={scrim} testId="cover" />,
      );
      expect(screen.getByTestId("cover").nextElementSibling).not.toBeNull();
      unmount();
    }
    renderWithProviders(<CoverBackdrop url="https://x.test/a.png" scrim="none" testId="cover" />);
    expect(screen.getByTestId("cover").nextElementSibling).toBeNull();
  });

  it("draws no picture without an address", () => {
    renderWithProviders(<CoverBackdrop url={null} scrim="flat" testId="cover" />);
    expect(screen.getByTestId("cover").style.backgroundImage).toBe("");
  });
});
