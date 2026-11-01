import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { SessionNeighbourChevron } from "./session-neighbour-chevron";

describe("SessionNeighbourChevron", () => {
  it("links to the session beside this one, with its heading as the tooltip", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <SessionNeighbourChevron
        direction="next"
        session={{ idStorySession: 7, number: 3, title: "Kildealg" }}
      />,
    );

    const link = screen.getByRole("link", { name: "Next session: 3. Kildealg" });
    expect(link).toHaveAttribute("href", "/sessions/7");
    await u.hover(link);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("3. Kildealg");
  });

  it("names an untitled session by its number", () => {
    renderWithProviders(
      <SessionNeighbourChevron
        direction="previous"
        session={{ idStorySession: 6, number: 2, title: null }}
      />,
    );
    expect(screen.getByRole("link", { name: "Previous session: Session 2" })).toBeInTheDocument();
  });

  it("stays, disabled, where there is no session that way", () => {
    renderWithProviders(<SessionNeighbourChevron direction="previous" session={null} />);
    expect(screen.getByRole("button", { name: "No earlier session" })).toBeDisabled();
  });
});
