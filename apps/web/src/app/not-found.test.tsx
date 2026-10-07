import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("says the page is missing or not the visitor's, and offers a way home", () => {
    renderWithProviders(<NotFound />);

    expect(screen.getByRole("heading", { name: "Nothing waits here" })).toBeInTheDocument();
    expect(
      screen.getByText("This page doesn't exist, or it isn't yours to see."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/home");
  });
});
