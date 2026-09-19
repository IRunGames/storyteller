import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

const router = {
  push: mock.fn<(href: string) => void>(),
  refresh: mock.fn<() => void>(),
};

let pathname = "/home";

const signOut = mock.fn<() => Promise<{ data: object; error: null }>>(
  async () => ({ data: {}, error: null }),
);

const user = { name: "Paul Stafford", image: null };

// Static imports are hoisted, so the module under test can only be loaded
// after the mocks are registered — hence the dynamic import in `before`.
let AppHeader: typeof import("./app-header").AppHeader;

describe("AppHeader", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { useRouter: () => router, usePathname: () => pathname },
    });
    mock.module("@/lib/auth-client", { namedExports: { signOut } });

    ({ AppHeader } = await import("./app-header"));
  });

  beforeEach(() => {
    pathname = "/home";
    router.push.mock.resetCalls();
    router.refresh.mock.resetCalls();
    signOut.mock.resetCalls();
  });

  it("links to the four sections and marks the current one", () => {
    renderWithProviders(<AppHeader user={user} />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = Array.from(nav.querySelectorAll("a"));

    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Play", "/play"],
      ["Stories", "/home"],
      ["Characters", "/characters"],
      ["Library", "/library"],
    ]);
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(links[0]).not.toHaveAttribute("aria-current");
  });

  it("treats a nested path as part of its section", () => {
    pathname = "/characters/42";
    renderWithProviders(<AppHeader user={user} />);

    expect(screen.getByRole("link", { name: "Characters" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the notifications bell disabled", () => {
    renderWithProviders(<AppHeader user={user} />);

    expect(screen.getByRole("button", { name: "Notifications" })).toBeDisabled();
  });

  it("lets the user pick a theme", async () => {
    const u = userEvent.setup();
    renderWithProviders(<AppHeader user={user} />);

    await u.click(await screen.findByRole("button", { name: "Choose theme" }));

    const light = await screen.findByRole("menuitemradio", { name: "Light" });
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toBeInTheDocument();

    await u.click(light);

    await waitFor(() =>
      expect(document.documentElement).toHaveClass("light"),
    );
  });

  it("opens an account menu with Profile and Logout", async () => {
    const u = userEvent.setup();
    renderWithProviders(<AppHeader user={user} />);

    await u.click(screen.getByRole("button", { name: "Account menu" }));

    const profile = await screen.findByRole("menuitem", { name: "Profile" });
    expect(profile).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  it("logs out and returns to the landing page", async () => {
    const u = userEvent.setup();
    renderWithProviders(<AppHeader user={user} />);

    await u.click(screen.getByRole("button", { name: "Account menu" }));
    await u.click(await screen.findByRole("menuitem", { name: "Logout" }));

    await waitFor(() => expect(signOut.mock.callCount()).toBe(1));
    await waitFor(() => expect(router.push.mock.callCount()).toBe(1));
    expect(router.push.mock.calls[0].arguments[0]).toBe("/");
    expect(router.refresh.mock.callCount()).toBe(1);
  });
});
