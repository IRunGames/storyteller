import { describe, it } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { SystemHeading } from "./system-heading";

describe("SystemHeading", () => {
  it("names the system, with the way back to the systems beside it, arrow first", () => {
    renderWithProviders(<SystemHeading label="Palladium Fantasy Role-Playing Game (2e)" />);

    expect(
      screen.getByRole("heading", { name: "Palladium Fantasy Role-Playing Game (2e)" }),
    ).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Back to systems" });
    expect(back).toHaveAttribute("href", "/admin/systems");
    // The go-back arrow leads the words.
    expect(back.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(within(back).getByText("Back to systems")).toBeInTheDocument();
  });
});
