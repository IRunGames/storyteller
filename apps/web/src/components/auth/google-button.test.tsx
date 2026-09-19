import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

type SignInResult =
  | { data: Record<string, unknown>; error: null }
  | { data: null; error: { message?: string } };

type SocialOptions = { provider: string; callbackURL: string };

const signIn = {
  social: mock.fn<(options: SocialOptions) => Promise<SignInResult>>(
    async () => ({ data: {}, error: null }),
  ),
};

let GoogleButton: typeof import("./google-button").GoogleButton;

describe("GoogleButton", () => {
  before(async () => {
    mock.module("@/lib/auth-client", { namedExports: { signIn } });

    ({ GoogleButton } = await import("./google-button"));
  });

  beforeEach(() => {
    signIn.social.mock.resetCalls();
  });

  it("starts the Google flow with the callback URL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoogleButton callbackURL="/play" />);

    await user.click(screen.getByRole("button", { name: /google/i }));

    await waitFor(() => expect(signIn.social.mock.callCount()).toBe(1));
    expect(signIn.social.mock.calls[0].arguments[0]).toEqual({
      provider: "google",
      callbackURL: "/play",
    });
  });

  it("stays loading on success because the browser is navigating away", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoogleButton callbackURL="/play" />);

    // Chakra hides the label while loading, so hold the element rather than
    // re-querying it by name afterwards.
    const button = screen.getByRole("button", { name: /google/i });
    await user.click(button);

    await waitFor(() => expect(signIn.social.mock.callCount()).toBe(1));
    expect(button).toBeDisabled();
  });

  it("shows the error and re-enables the button when better-auth refuses", async () => {
    // better-fetch resolves with { error } rather than rejecting, so a
    // .catch-only handler would leave the button spinning forever.
    signIn.social.mock.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "Provider not configured" },
    }));

    const user = userEvent.setup();
    renderWithProviders(<GoogleButton callbackURL="/play" />);

    await user.click(screen.getByRole("button", { name: /google/i }));

    expect(await screen.findByText("Provider not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /google/i })).toBeEnabled();
  });

  it("falls back to its own wording when the error carries no message", async () => {
    signIn.social.mock.mockImplementationOnce(async () => ({
      data: null,
      error: {},
    }));

    const user = userEvent.setup();
    renderWithProviders(<GoogleButton callbackURL="/play" />);

    await user.click(screen.getByRole("button", { name: /google/i }));

    expect(
      await screen.findByText(/could not continue with google/i),
    ).toBeInTheDocument();
  });
});
