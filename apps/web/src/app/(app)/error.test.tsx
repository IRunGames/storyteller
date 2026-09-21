import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import AppError from "./error";

describe("AppError", () => {
  it("explains what happened and offers a retry and a way to sign in", async () => {
    const user = userEvent.setup();
    const reset = mock.fn();

    renderWithProviders(<AppError error={new Error("boom")} reset={reset} />);

    expect(screen.getByText("Something went wrong loading this page.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset.mock.callCount()).toBe(1);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("shows the digest of a server error so it can be matched to the log", () => {
    const error = Object.assign(new Error("boom"), { digest: "1234567890" });

    renderWithProviders(<AppError error={error} reset={() => {}} />);

    expect(screen.getByText("Reference: 1234567890")).toBeInTheDocument();
  });
});
