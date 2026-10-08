import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { StoryElement } from "@/lib/elements";
import type { PlayItem, RunPlaySpace } from "@/lib/run";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
};

const people: StoryElement[] = [
  { idElement: 5, status: "ACTIVE", name: "Dafydd", title: "Shell seller", description: null },
];

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

let RunTable: typeof import("./run-table").RunTable;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

function renderTable(
  preferences: Record<string, boolean> = {},
  session: string | null = "3. Kildealg",
  initialSpace: RunPlaySpace = { scene: null, inPlay: [] },
) {
  return renderWithProviders(
    <UserProvider user={user}>
      <UserPreferencesProvider preferences={preferences}>
        <RunTable
          idStory={-4}
          title="Psychoneira"
          session={session}
          initialSpace={initialSpace}
          sceneStatusOptions={[]}
        />
        <Toaster />
      </UserPreferencesProvider>
    </UserProvider>,
  );
}

describe("RunTable", () => {
  before(async () => {
    Element.prototype.scrollIntoView = () => {};
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push: mock.fn(), refresh: mock.fn() }),
        usePathname: () => "/run/-4",
      },
    });
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    mock.module("@/components/feedback/actions", {
      namedExports: { sa_submitFeedback: mock.fn() },
    });
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference },
    });
    mock.module("@/components/uploads/actions", {
      namedExports: { sa_listAttachments: async () => [], sa_searchAttachments: async () => [] },
    });
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: {
        sa_listRunScenes: async () => [],
        sa_loadRunScene: mock.fn(),
        sa_createRunScene: mock.fn(),
      },
    });
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: {
        sa_listStoryElements: async (_id: number, kind: string) =>
          kind === "PERSON" ? people : [],
      },
    });

    ({ RunTable } = await import("./run-table"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    sa_setUserPreference.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  it("names the story and the session in the header", () => {
    renderTable();
    const header = screen.getByRole("banner");

    expect(within(header).getByText("Psychoneira")).toBeInTheDocument();
    expect(within(header).getByText("3. Kildealg")).toBeInTheDocument();
  });

  it("opens with the library beside the play space, and the chat and character closed", () => {
    renderTable();

    expect(screen.getByRole("region", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Play space" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Table Chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Character" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("button", { name: "Library" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("closes the library from the header, and remembers it", async () => {
    const u = userEvent.setup();
    renderTable();

    await u.click(within(screen.getByRole("banner")).getByRole("button", { name: "Library" }));

    expect(screen.queryByRole("region", { name: "Library" })).not.toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.showLibrary",
      value: false,
    });
  });

  it("keeps its panels apart from a player's table", async () => {
    const u = userEvent.setup();
    renderTable();

    await u.click(within(screen.getByRole("banner")).getByRole("button", { name: "Chat" }));

    expect(screen.getByRole("region", { name: "Table Chat" })).toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.showChat",
      value: true,
    });
  });

  it("puts a library item in the play space with its arrow, once, and takes it out again", async () => {
    const u = userEvent.setup();
    renderTable();
    const space = screen.getByRole("region", { name: "Play space" });
    expect(within(space).getByText("Nothing in play yet.")).toBeInTheDocument();
    expect(within(space).getByRole("heading", { name: "Play space" })).not.toHaveStyle({
      position: "absolute",
    });

    await u.click(screen.getByRole("tab", { name: "People" }));
    const add = await screen.findByRole("button", { name: "Add Dafydd to the play space" });
    await u.click(add);
    await u.click(add);

    const items = within(space).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Dafydd");
    expect(items[0]).toHaveTextContent("Shell seller");

    await u.click(within(space).getByRole("button", { name: "Remove Dafydd from the play space" }));
    expect(within(space).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("opens on the current scene's elements, which the library cannot add twice", async () => {
    const u = userEvent.setup();
    const inPlay: PlayItem[] = [
      { key: "PERSON:5", kind: "PERSON", label: "Dafydd", detail: "Shell seller", imageUrl: null },
    ];
    renderTable({}, "3. Kildealg", {
      scene: { idStoryScene: -15, title: "Strangers in the morning", status: "ACTIVE" },
      inPlay,
    });
    expect(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Scene: Strangers in the morning",
      }),
    ).toBeInTheDocument();
    // The scene is what the space is about, so its heading stands aside for
    // the eye and stays for a screen reader.
    expect(
      within(screen.getByRole("region", { name: "Play space" })).getByRole("heading", {
        name: "Play space",
      }),
    ).toHaveStyle({ position: "absolute" });
    const space = screen.getByRole("region", { name: "Play space" });

    const items = within(space).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["DafyddShell seller"]);

    await u.click(screen.getByRole("tab", { name: "People" }));
    await u.click(await screen.findByRole("button", { name: "Add Dafydd to the play space" }));
    expect(within(space).getAllByRole("listitem")).toHaveLength(1);
  });

  it("tells the storyteller when no session is being played", async () => {
    renderTable({}, null);

    const header = screen.getByRole("banner");
    expect(within(header).getByTitle("No active session")).toHaveTextContent("None");
    // With no session there is no table to put a scene on.
    expect(within(header).getByRole("button", { name: "Scene: None" })).toBeDisabled();
    expect(await screen.findByText("There is no active session.")).toBeInTheDocument();
  });
});
