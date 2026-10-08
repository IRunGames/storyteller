import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

// Static imports are hoisted, so the module under test can only be loaded
// after the mocks are registered — hence the dynamic import in `before`.
let PlayTable: typeof import("./play-table").PlayTable;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

// The table reads the user and the preference map from the providers
// (app)/layout.tsx mounts, as the menu bar does.
// Both panels open, for the tests about what is in them.
const OPEN = { "play.showChat": true, "play.showCharacter": true };

function renderTable(
  preferences: Record<string, boolean> = {},
  session: string | null = "3. Kildealg",
) {
  return renderWithProviders(
    <UserProvider user={user}>
      <UserPreferencesProvider preferences={preferences}>
        <PlayTable title="Psychoneira" session={session} />
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
      namedExports: { sa_setUserPreference },
    });

    ({ PlayTable } = await import("./play-table"));
    ({ UserPreferencesProvider } = await import(
      "@/components/preferences/user-preferences-provider"
    ));
  });

  beforeEach(() => {
    sa_setUserPreference.mock.resetCalls();
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

  it("lays out the play space, the character space and the chat, with no bar across the bottom", () => {
    renderTable(OPEN);

    expect(screen.getByRole("region", { name: "Play space" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Character" })).toBeInTheDocument();
    const chat = screen.getByRole("region", { name: "Table Chat" });
    // The message input belongs to the chat now, not to the page.
    expect(within(chat).getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Message" })).toHaveLength(1);
  });

  it("shows a labelled sample character beside the background and notes placeholders", () => {
    renderTable(OPEN);
    const character = screen.getByRole("region", { name: "Character" });

    const sample = within(character).getByRole("article", { name: "Sample character" });
    expect(within(sample).getByText("David Williams")).toBeInTheDocument();
    expect(within(sample).getByText("Curios Shop Owner")).toBeInTheDocument();
    for (const ability of ["Shopkeeper", "Seer +", "DJ"]) {
      expect(within(sample).getByRole("button", { name: ability })).toBeInTheDocument();
    }
    expect(
      within(character).getByRole("heading", { name: "Character background" }),
    ).toBeInTheDocument();
    expect(
      within(character).getByRole("heading", { name: "Scene / session notes" }),
    ).toBeInTheDocument();
  });

  it("shows a sample conversation until the first message, then only real ones", async () => {
    const user = userEvent.setup();
    renderTable(OPEN);
    const chat = screen.getByRole("region", { name: "Table Chat" });
    expect(within(chat).getByText("Sample conversation")).toBeInTheDocument();
    expect(within(chat).getByText("4 online")).toBeInTheDocument();
    expect(
      within(chat).getByLabelText("Rolled 2d6 for Spot the box: 10, success"),
    ).toBeInTheDocument();

    await user.type(within(chat).getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    expect(within(chat).queryByText("Sample conversation")).not.toBeInTheDocument();
    expect(within(chat).getByText("Hello")).toBeInTheDocument();
    expect(within(chat).getByText("Paul Stafford")).toBeInTheDocument();
    expect(within(chat).getAllByRole("article")).toHaveLength(1);
  });

  it("offers Roll as coming soon", () => {
    renderTable(OPEN);
    expect(screen.getByRole("button", { name: "Roll" })).toBeDisabled();
  });

  it("names the story in the header, after the app's name", () => {
    renderTable();
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Psychoneira")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Storyteller" })).toBeInTheDocument();
  });

  it("names the session being played after the title", () => {
    renderTable();
    const header = screen.getByRole("banner");
    expect(within(header).getByText("3. Kildealg")).toBeInTheDocument();
    expect(within(header).queryByText("None")).not.toBeInTheDocument();
  });

  it("says None when no session is being played", () => {
    renderTable({}, null);
    const header = screen.getByRole("banner");

    expect(within(header).getByText("None")).toHaveAttribute("title", "No active session");
  });

  it("starts with both panels closed, leaving the play space", () => {
    renderTable();
    const header = screen.getByRole("banner");

    expect(screen.getByRole("region", { name: "Play space" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Table Chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Character" })).not.toBeInTheDocument();
    for (const name of ["Chat", "Character"]) {
      expect(within(header).getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("opens and closes the chat from the header, and remembers it", async () => {
    const user = userEvent.setup();
    renderTable(OPEN);
    const header = screen.getByRole("banner");
    const toggle = within(header).getByRole("button", { name: "Chat" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("aria-controls", "play-panel-chat");

    await user.click(toggle);

    expect(screen.queryByRole("region", { name: "Table Chat" })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "play.showChat",
      value: false,
    });
    // The play space stays whatever is closed.
    expect(screen.getByRole("region", { name: "Play space" })).toBeInTheDocument();
  });

  it("opens and closes the character space from the header", async () => {
    const user = userEvent.setup();
    renderTable();
    const toggle = within(screen.getByRole("banner")).getByRole("button", { name: "Character" });
    expect(screen.queryByRole("region", { name: "Character" })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(screen.getByRole("region", { name: "Character" })).toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "play.showCharacter",
      value: true,
    });
  });
});
