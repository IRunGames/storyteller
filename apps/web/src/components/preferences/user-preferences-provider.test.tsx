import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { UserPreferenceMap } from "@/lib/user-preference-schemas";

// The provider imports its server action itself, so the whole actions module
// is mocked rather than handed in as a prop.
type SetResult = import("./actions").SetUserPreferenceResult;
const sa_setUserPreference = mock.fn<(input: unknown) => Promise<SetResult>>(async () => ({
  ok: true,
}));

// Static imports are hoisted, so the module under test can only be loaded
// after the mock is registered — hence the dynamic import in `before`.
let UserPreferencesProvider: typeof import("./user-preferences-provider").UserPreferencesProvider;
let useUserPreferences: typeof import("./user-preferences-provider").useUserPreferences;

// A consumer that reads one flag with a fallback and flips it on click, the
// way a real component would.
function SidebarToggle() {
  const preferences = useUserPreferences();
  const open = preferences.get<boolean>("sidebar.open", false);
  return (
    <button type="button" onClick={() => void preferences.set("sidebar.open", !open)}>
      {open ? "Sidebar open" : "Sidebar closed"}
    </button>
  );
}

function renderToggle(preferences: UserPreferenceMap) {
  return renderWithProviders(
    <UserPreferencesProvider preferences={preferences}>
      <SidebarToggle />
    </UserPreferencesProvider>,
  );
}

describe("UserPreferencesProvider", () => {
  before(async () => {
    mock.module("./actions", { namedExports: { sa_setUserPreference } });
    ({ UserPreferencesProvider, useUserPreferences } = await import("./user-preferences-provider"));
  });

  beforeEach(() => {
    sa_setUserPreference.mock.resetCalls();
    sa_setUserPreference.mock.mockImplementation(async () => ({ ok: true }));
  });

  it("hands a loaded value to any client component below it", () => {
    renderToggle({ "sidebar.open": true });

    expect(screen.getByRole("button", { name: "Sidebar open" })).toBeInTheDocument();
  });

  it("falls back when the key was never set", () => {
    renderToggle({});

    expect(screen.getByRole("button", { name: "Sidebar closed" })).toBeInTheDocument();
  });

  it("shows a new value at once and sends the pair to the action", async () => {
    // Hold the action open so the assertion below is made before it answers.
    let answer!: (result: SetResult) => void;
    sa_setUserPreference.mock.mockImplementation(
      () => new Promise<SetResult>((resolve) => (answer = resolve)),
    );
    renderToggle({});

    await userEvent.click(screen.getByRole("button", { name: "Sidebar closed" }));

    expect(screen.getByRole("button", { name: "Sidebar open" })).toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls).toHaveLength(1);
    expect(sa_setUserPreference.mock.calls[0].arguments).toEqual([
      { key: "sidebar.open", value: true },
    ]);

    answer({ ok: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sidebar open" })).toBeInTheDocument(),
    );
  });

  it("puts the old value back when the action refuses the change", async () => {
    sa_setUserPreference.mock.mockImplementation(async () => ({
      ok: false,
      errors: { key: "A preference needs a key." },
    }));
    renderToggle({ "sidebar.open": false });

    await userEvent.click(screen.getByRole("button", { name: "Sidebar closed" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sidebar closed" })).toBeInTheDocument(),
    );
  });

  it("puts the old value back when the action throws", async () => {
    sa_setUserPreference.mock.mockImplementation(async () => {
      throw new Error("offline");
    });
    renderToggle({ "sidebar.open": true });

    await userEvent.click(screen.getByRole("button", { name: "Sidebar open" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sidebar open" })).toBeInTheDocument(),
    );
  });

  it("restores the stored theme when it loads", async () => {
    renderToggle({ theme: "halloween" });

    await waitFor(() => expect(document.documentElement).toHaveClass("halloween"));
  });

  it("follows the stored theme, so a refused save reverts the theme too", async () => {
    renderToggle({ theme: "halloween" });
    await waitFor(() => expect(document.documentElement).toHaveClass("halloween"));

    // Sets the key directly, the way the theme menu does, rather than through
    // the sidebar toggle above.
    function ThemeSetter() {
      const preferences = useUserPreferences();
      return (
        <button type="button" onClick={() => void preferences.set("theme", "blackberry")}>
          Blackberry
        </button>
      );
    }
    sa_setUserPreference.mock.mockImplementation(async () => ({
      ok: false,
      errors: { root: "The preference could not be saved." },
    }));
    cleanup();
    renderWithProviders(
      <UserPreferencesProvider preferences={{ theme: "halloween" }}>
        <ThemeSetter />
      </UserPreferencesProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Blackberry" }));

    // The optimistic write applies the theme; the refusal takes it back.
    await waitFor(() => expect(document.documentElement).toHaveClass("halloween"));
    expect(document.documentElement).not.toHaveClass("blackberry");
  });

  it("leaves the theme alone when the stored value is not a theme it knows", async () => {
    // Put a known theme in force first so there is something to keep.
    renderToggle({ theme: "dark" });
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    cleanup();

    renderToggle({ theme: "neon" });

    // next-themes applies a change in an effect, so give it a moment before
    // asserting that nothing moved.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).not.toHaveClass("neon");
  });

  it("refuses to be read outside a logged-in page", () => {
    // React logs the thrown error as well as rethrowing it; silence the log
    // for this one render so the test output stays clean.
    const consoleError = console.error;
    console.error = () => {};
    try {
      expect(() => renderWithProviders(<SidebarToggle />)).toThrow(
        "useUserPreferences() can only be called inside a logged-in page",
      );
    } finally {
      console.error = consoleError;
    }
  });
});
