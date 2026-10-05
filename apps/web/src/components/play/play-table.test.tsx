import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
};

// Static imports are hoisted, so the module under test can only be loaded
// after the mocks are registered — hence the dynamic import in `before`.
let PlayTable: typeof import("./play-table").PlayTable;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

// The table reads the user and the preference map from the providers
// (app)/layout.tsx mounts, as the menu bar does.
function renderTable() {
  return renderWithProviders(
    <UserProvider user={user}>
      <UserPreferencesProvider preferences={{}}>
        <PlayTable />
      </UserPreferencesProvider>
    </UserProvider>,
  );
}

describe("PlayTable", () => {
  before(async () => {
    // The chat scrolls its newest message into view on mount, and the test
    // DOM has no layout to scroll.
    Element.prototype.scrollIntoView = () => {};
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push: mock.fn(), refresh: mock.fn() }),
        usePathname: () => "/play/7",
      },
    });
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    mock.module("@/components/feedback/actions", {
      namedExports: { sa_submitFeedback: mock.fn() },
    });
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference: mock.fn() },
    });

    ({ PlayTable } = await import("./play-table"));
    ({ UserPreferencesProvider } = await import(
      "@/components/preferences/user-preferences-provider"
    ));
  });

  it("links the Storyteller name in its header to the home page", () => {
    renderTable();

    expect(screen.getByRole("link", { name: "Storyteller" })).toHaveAttribute("href", "/home");
  });

  it("carries the menu bar's right-hand menu rather than its own", () => {
    renderTable();

    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });
});
