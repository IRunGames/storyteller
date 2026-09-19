import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

type Credentials = { email: string; password: string };

type SignInResult =
  | { data: Record<string, unknown>; error: null }
  | { data: null; error: { message?: string } };

const router = {
  push: mock.fn<(href: string) => void>(),
  refresh: mock.fn<() => void>(),
};

const signIn = {
  email: mock.fn<(credentials: Credentials) => Promise<SignInResult>>(
    async () => ({ data: {}, error: null }),
  ),
  social: mock.fn<() => Promise<SignInResult>>(async () => ({
    data: {},
    error: null,
  })),
};

// Static imports are hoisted, so the module under test can only be loaded
// after the mocks are registered — hence the dynamic import in `before`.
let LoginForm: typeof import("./login-form").LoginForm;

describe("LoginForm", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { useRouter: () => router },
    });
    mock.module("@/lib/auth-client", { namedExports: { signIn } });

    ({ LoginForm } = await import("./login-form"));
  });

  beforeEach(() => {
    router.push.mock.resetCalls();
    router.refresh.mock.resetCalls();
    signIn.email.mock.resetCalls();
  });

  it("asks for an email and a password", () => {
    renderWithProviders(<LoginForm redirectTo="/home" />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("sends the typed credentials to better-auth", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm redirectTo="/home" />);

    await user.type(screen.getByLabelText(/email/i), "gandalf@irun.games");
    await user.type(screen.getByLabelText(/password/i), "speak-friend");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(signIn.email.mock.callCount()).toBe(1));
    expect(signIn.email.mock.calls[0].arguments[0]).toEqual({
      email: "gandalf@irun.games",
      password: "speak-friend",
    });
  });

  it("refuses a blank email without calling better-auth", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm redirectTo="/home" />);

    await user.type(screen.getByLabelText(/password/i), "speak-friend");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true");
    expect(signIn.email.mock.callCount()).toBe(0);
  });

  it("refuses a blank password without calling better-auth", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm redirectTo="/home" />);

    await user.type(screen.getByLabelText(/email/i), "gandalf@irun.games");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/enter your password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("aria-invalid", "true");
    expect(signIn.email.mock.callCount()).toBe(0);
  });

  it("clears a field's error once the user fills it in", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm redirectTo="/home" />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText(/enter your email/i);

    await user.type(screen.getByLabelText(/email/i), "gandalf@irun.games");

    await waitFor(() =>
      expect(screen.queryByText(/enter your email/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute("aria-invalid", "true");
  });

  it("shows the message better-auth returned when sign-in is refused", async () => {
    signIn.email.mock.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "Invalid email or password" },
    }));

    const user = userEvent.setup();
    renderWithProviders(<LoginForm redirectTo="/home" />);

    await user.type(screen.getByLabelText(/email/i), "gandalf@irun.games");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(router.push.mock.callCount()).toBe(0);
  });

  it("lets the user try again after a refused attempt", async () => {
    signIn.email.mock.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "Invalid email or password" },
    }));

    const user = userEvent.setup();
    renderWithProviders(<LoginForm redirectTo="/home" />);

    await user.type(screen.getByLabelText(/email/i), "gandalf@irun.games");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByText("Invalid email or password");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  it("falls back to its own wording when the error carries no message", async () => {
    signIn.email.mock.mockImplementationOnce(async () => ({
      data: null,
      error: {},
    }));

    const user = userEvent.setup();
    renderWithProviders(<LoginForm redirectTo="/home" />);

    await user.type(screen.getByLabelText(/email/i), "gandalf@irun.games");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(/could not sign you in/i),
    ).toBeInTheDocument();
  });

  it("sends the user to the redirect target once signed in", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm redirectTo="/play" />);

    await user.type(screen.getByLabelText(/email/i), "gandalf@irun.games");
    await user.type(screen.getByLabelText(/password/i), "speak-friend");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(router.push.mock.callCount()).toBe(1));
    expect(router.push.mock.calls[0].arguments[0]).toBe("/play");
    // Layouts cached the signed-out session, so a refresh has to follow.
    expect(router.refresh.mock.callCount()).toBe(1);
  });
});
