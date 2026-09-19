import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

type Details = { name: string; email: string; password: string };

type SignUpResult =
  | { data: Record<string, unknown>; error: null }
  | { data: null; error: { message?: string } };

const router = {
  push: mock.fn<(href: string) => void>(),
  refresh: mock.fn<() => void>(),
};

const signUp = {
  email: mock.fn<(details: Details) => Promise<SignUpResult>>(async () => ({
    data: {},
    error: null,
  })),
};

const signIn = {
  social: mock.fn<() => Promise<SignUpResult>>(async () => ({
    data: {},
    error: null,
  })),
};

let SignupForm: typeof import("./signup-form").SignupForm;

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { name, email, password }: Partial<Details>,
) {
  if (name) await user.type(screen.getByLabelText(/name/i), name);
  if (email) await user.type(screen.getByLabelText(/email/i), email);
  if (password) await user.type(screen.getByLabelText(/password/i), password);
}

describe("SignupForm", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { useRouter: () => router },
    });
    mock.module("@/lib/auth-client", { namedExports: { signUp, signIn } });

    ({ SignupForm } = await import("./signup-form"));
  });

  beforeEach(() => {
    router.push.mock.resetCalls();
    router.refresh.mock.resetCalls();
    signUp.email.mock.resetCalls();
  });

  it("sends the typed details to better-auth", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, {
      name: "Gandalf",
      email: "gandalf@irun.games",
      password: "speak-friend",
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(signUp.email.mock.callCount()).toBe(1));
    expect(signUp.email.mock.calls[0].arguments[0]).toEqual({
      name: "Gandalf",
      email: "gandalf@irun.games",
      password: "speak-friend",
    });
    await waitFor(() => expect(router.push.mock.callCount()).toBe(1));
    expect(router.push.mock.calls[0].arguments[0]).toBe("/home");
  });

  it("refuses a blank name without calling better-auth", async () => {
    // The form is noValidate, and better-auth accepts name: "" (z.string()
    // with no minimum), so nothing else stops "" reaching users.name.
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, { email: "gandalf@irun.games", password: "speak-friend" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/enter your name/i)).toBeInTheDocument();
    expect(signUp.email.mock.callCount()).toBe(0);
  });

  it("treats a whitespace-only name as blank", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, {
      name: "   ",
      email: "gandalf@irun.games",
      password: "speak-friend",
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/enter your name/i)).toBeInTheDocument();
    expect(signUp.email.mock.callCount()).toBe(0);
  });

  it("trims surrounding whitespace off the name it submits", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, {
      name: "  Gandalf  ",
      email: "gandalf@irun.games",
      password: "speak-friend",
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(signUp.email.mock.callCount()).toBe(1));
    expect(signUp.email.mock.calls[0].arguments[0].name).toBe("Gandalf");
  });

  it("marks the offending field invalid rather than only reporting at the top", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, { email: "gandalf@irun.games", password: "speak-friend" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByText(/enter your name/i);
    expect(screen.getByLabelText(/name/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/password/i)).not.toHaveAttribute("aria-invalid", "true");
  });

  it("reports every failing field at once", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/enter your name/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByText(/password must be at least 8/i)).toBeInTheDocument();
    expect(signUp.email.mock.callCount()).toBe(0);
  });

  it("clears a field's error once the user fixes it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, { email: "gandalf@irun.games", password: "speak-friend" });
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText(/enter your name/i);

    await user.type(screen.getByLabelText(/name/i), "Gandalf");

    await waitFor(() =>
      expect(screen.queryByText(/enter your name/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/name/i)).not.toHaveAttribute("aria-invalid", "true");
  });

  it("refuses a blank email without calling better-auth", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, { name: "Gandalf", password: "speak-friend" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/enter your email/i)).toBeInTheDocument();
    expect(signUp.email.mock.callCount()).toBe(0);
  });

  it("refuses an email that is not an address without calling better-auth", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, { name: "Gandalf", email: "gandalf", password: "speak-friend" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true");
    expect(signUp.email.mock.callCount()).toBe(0);
  });

  it("trims surrounding whitespace off the email it submits", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, {
      name: "Gandalf",
      email: "  gandalf@irun.games  ",
      password: "speak-friend",
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(signUp.email.mock.callCount()).toBe(1));
    expect(signUp.email.mock.calls[0].arguments[0].email).toBe(
      "gandalf@irun.games",
    );
  });

  it("refuses a short password without calling better-auth", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, {
      name: "Gandalf",
      email: "gandalf@irun.games",
      password: "short",
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText(/password must be at least 8/i),
    ).toBeInTheDocument();
    expect(signUp.email.mock.callCount()).toBe(0);
  });

  it("shows the message better-auth returned when signup is refused", async () => {
    signUp.email.mock.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "User already exists" },
    }));

    const user = userEvent.setup();
    renderWithProviders(<SignupForm redirectTo="/home" />);

    await fill(user, {
      name: "Gandalf",
      email: "gandalf@irun.games",
      password: "speak-friend",
    });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("User already exists")).toBeInTheDocument();
    expect(router.push.mock.callCount()).toBe(0);
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeEnabled();
  });
});
