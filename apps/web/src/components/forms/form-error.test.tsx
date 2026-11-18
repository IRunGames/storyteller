import { describe, it } from "node:test";
import { expect } from "expect";
import { renderWithProviders, screen } from "@/test/render";
import { FormError } from "./form-error";

describe("FormError", () => {
  it("announces the message as an alert", () => {
    renderWithProviders(<FormError message="That could not be saved." />);
    expect(screen.getByRole("alert")).toHaveTextContent("That could not be saved.");
  });

  it("draws nothing without a message", () => {
    renderWithProviders(<FormError message={undefined} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
