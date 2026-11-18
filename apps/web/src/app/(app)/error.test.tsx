import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import { ERROR_BACKGROUNDS } from "@/lib/error-page";
import { currentUser, mockNavigation, mockRouter } from "@/test/mocks";

const router = mockRouter();
const signOut = mock.fn(async () => ({ data: {}, error: null }));

const signedIn = currentUser();

// Static imports hoist above mock.module, so the page is imported in `before`.
let AppError: typeof import("./error").default;

describe("AppError", () => {
  before(async () => {
    mockNavigation({ router });
    mock.module("@/lib/auth-client", { namedExports: { signOut } });
    ({ default: AppError } = await import("./error"));
  });

  beforeEach(() => {
    router.push.mock.resetCalls();
    router.refresh.mock.resetCalls();
    signOut.mock.resetCalls();
  });

  it("offers a signed-in user a way out: sign out, then back to the login page", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <UserProvider user={signedIn}>
        <AppError error={new Error("boom")} reset={() => {}} />
      </UserProvider>,
    );

    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.push.mock.callCount()).toBe(1));
    expect(signOut.mock.callCount()).toBe(1);
    expect(router.push.mock.calls[0].arguments).toEqual(["/login"]);
  });

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

  it("paints one of the error pictures behind the message", () => {
    const { container } = renderWithProviders(
      <AppError error={new Error("boom")} reset={() => {}} />,
    );

    const painted = [...container.querySelectorAll<HTMLElement>("[aria-hidden]")].find((el) =>
      el.style.backgroundImage.includes("_error.webp"),
    );
    // Whichever of the rotation was drawn; the list is the source, so a
    // picture added to it needs nothing here.
    expect(ERROR_BACKGROUNDS.map((path) => `url("${path}")`)).toContain(
      painted?.style.backgroundImage,
    );
  });
});
