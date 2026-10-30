import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { PlayItem, RunScene } from "@/lib/run";
import type { StatusOption } from "@/lib/status";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -10,
  isAnonymous: false,
};

const scene: RunScene = {
  idStoryScene: -15,
  title: "Strangers in the morning",
  status: "ACTIVE",
  text: { description: "Fog on the water.", notes: null },
};

const dafydd: PlayItem = {
  key: "PERSON:5",
  kind: "PERSON",
  label: "Dafydd",
  detail: "Shell seller",
  imageUrl: "https://x.test/dafydd.png",
  sceneTags: ["scene"],
  sceneStatus: "READY",
};

const sessions = [
  { idStorySession: -31, label: "Session 1" },
  { idStorySession: -30, label: "3. Kildealg" },
];

// The scene workflow's shape: each status may move to any other.
const sceneStatusOptions: StatusOption[] = ["PENDING", "ACTIVE", "COMPLETE"].map((key) => ({
  key,
  label: key.charAt(0) + key.slice(1).toLowerCase(),
  description: null,
  from: null,
}));

type SessionResult = { ok: true; idStorySession: number | null } | { ok: false; error: string };
const sa_setLiveSceneSession = mock.fn(
  async (
    _story: number,
    _scene: number,
    idStorySession: number | null,
  ): Promise<SessionResult> => ({
    ok: true,
    idStorySession,
  }),
);
const sa_setLiveSceneText = mock.fn(
  async (
    _story: number,
    _scene: number,
    values: { title?: string; description: string; notes: string },
  ) => ({
    ok: true as const,
    text: { description: values.description || null, notes: values.notes || null },
    title: values.title,
  }),
);
// The header's selector: its search, and what its + writes; the selector's
// own test file covers both.
const sa_searchLiveScenes = mock.fn(
  async (
    _idStory: number,
    _search: { query: string; statuses: string[]; sessions: number[] },
  ) => [],
);
const sa_createLiveScene = mock.fn(async (_idStory: number, values: { title: string }) => ({
  ok: true as const,
  space: {
    scene: { idStoryScene: -17, title: values.title, status: "PENDING" },
    tags: [],
    coverUrl: null,
    inPlay: [],
  },
}));
const push = mock.fn((_href: string) => {});

const sa_setRowStatus = mock.fn(async (_table: string, _id: number, status: string) => ({
  ok: true as const,
  status,
}));

let LiveTable: typeof import("./live-table").LiveTable;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

function renderTable(start: RunScene = scene, idStorySession: number | null = -30) {
  return renderWithProviders(
    <UserProvider user={user}>
      <UserPreferencesProvider preferences={{}}>
        <LiveTable
          idStory={-4}
          title="Psychoneira"
          scene={start}
          initialTags={["scene"]}
          initialCoverUrl={null}
          initialInPlay={[dafydd]}
          sessions={sessions}
          idStorySession={idStorySession}
          sceneStatusOptions={sceneStatusOptions}
        />
        <Toaster />
      </UserPreferencesProvider>
    </UserProvider>,
  );
}

describe("LiveTable", () => {
  before(async () => {
    Element.prototype.scrollIntoView = () => {};
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push, refresh: mock.fn() }),
        usePathname: () => "/scenes/-15/live",
      },
    });
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    mock.module("@/components/feedback/actions", {
      namedExports: { sa_submitFeedback: mock.fn() },
    });
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference: mock.fn(async () => ({ ok: true as const })) },
    });
    mock.module("@/components/uploads/actions", {
      namedExports: {
        sa_listAttachments: async () => [],
        sa_searchAttachments: async () => [],
        sa_moveStoryAttachmentToSceneCover: mock.fn(),
        sa_moveStoryAttachmentsToScene: mock.fn(),
        sa_moveSceneAttachmentsToStory: mock.fn(),
      },
    });
    mock.module("@/components/elements/actions", {
      namedExports: { sa_listElementHistory: mock.fn(async () => ({ rows: [], hasMore: false })) },
    });
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: {
        sa_linkSceneElement: mock.fn(),
        sa_createRunScene: mock.fn(),
        sa_createLiveScene,
        sa_createSceneElement: mock.fn(),
        sa_setSceneElementShowing: mock.fn(),
        sa_setSceneElementStatus: mock.fn(),
        sa_setSceneElementShowInfo: mock.fn(),
        sa_pulseSceneElement: mock.fn(),
        sa_getElementDetail: mock.fn(async () => null),
        sa_updateStoryElement: mock.fn(),
        sa_unlinkSceneElement: mock.fn(),
        sa_listSceneLibraryElements: mock.fn(async () => []),
        sa_setSceneStacks: mock.fn(),
        sa_updateSceneElement: mock.fn(),
        sa_moveSceneElement: mock.fn(),
        sa_setElementTags: mock.fn(),
      },
    });
    mock.module("@/app/(app)/scenes/[id]/live/actions", {
      namedExports: { sa_setLiveSceneSession, sa_setLiveSceneText, sa_searchLiveScenes },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions: mock.fn(async () => []), sa_setRowStatus },
    });
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_listStoryElements: mock.fn(async () => []) },
    });

    ({ LiveTable } = await import("./live-table"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    sa_setLiveSceneSession.mock.resetCalls();
    sa_setLiveSceneText.mock.resetCalls();
    sa_setRowStatus.mock.resetCalls();
    sa_createLiveScene.mock.resetCalls();
    push.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  it("has the library and the scene's stacks, but none of the table's panels, toggles, scene select or reload", () => {
    renderTable();

    expect(screen.getByRole("region", { name: "Library" })).toBeInTheDocument();
    const space = screen.getByRole("region", { name: "Play space" });
    expect(within(space).getByRole("region", { name: "scene" })).toHaveTextContent("Dafydd");

    // The run page's panel toggles, its reload and its scene select.
    for (const name of ["Library", "Character", "Chat", "Diagnostics", "Reload the scene"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("region", { name: "Chat" })).toBeNull();
    // The pill's picture opens to look at, with no tack to put it up for the players.
    expect(within(space).getByRole("button", { name: "Preview Dafydd" })).toBeInTheDocument();
    expect(within(space).queryByRole("button", { name: /picture to the players/ })).toBeNull();
  });

  it("puts the scene's status chip beside its title in the play space", () => {
    renderTable();

    const space = screen.getByRole("region", { name: "Play space" });
    const title = within(space).getByRole("heading", { name: scene.title });
    const chip = within(space).getByRole("button", { name: "Active" });
    expect(chip).toHaveAttribute("aria-haspopup", "menu");
    // On the title's own line, after it.
    expect(title.parentElement).toContainElement(chip);
    expect(title.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The header's "Active" is a filter pill of the scene selector, a toggle;
    // the scene's chip, a menu, is not up there any more.
    const headerChips = within(screen.getByRole("banner"))
      .queryAllByRole("button", { name: "Active" })
      .filter((button) => button.getAttribute("aria-haspopup") === "menu");
    expect(headerChips).toHaveLength(0);
  });

  it("sets the sitting the scene was played in from the header's session select, none included", async () => {
    const u = userEvent.setup();
    renderTable();

    const select = within(screen.getByRole("banner")).getByRole("combobox", { name: "Session" });
    expect(select).toHaveValue("-30");

    await u.selectOptions(select, "Session 1");
    await waitFor(() => expect(sa_setLiveSceneSession.mock.callCount()).toBe(1));
    expect(sa_setLiveSceneSession.mock.calls[0].arguments).toEqual([-4, -15, -31]);

    await u.selectOptions(select, "Not played yet");
    await waitFor(() => expect(sa_setLiveSceneSession.mock.callCount()).toBe(2));
    expect(sa_setLiveSceneSession.mock.calls[1].arguments).toEqual([-4, -15, null]);
    expect(select).toHaveValue("");
  });

  it("does not offer Not played yet for a complete scene", () => {
    renderTable({ ...scene, status: "COMPLETE" });

    const select = within(screen.getByRole("banner")).getByRole("combobox", { name: "Session" });
    expect(within(select).getByRole("option", { name: "Not played yet" })).toBeDisabled();
  });

  it("puts the session back and says why when the select is refused", async () => {
    const u = userEvent.setup();
    sa_setLiveSceneSession.mock.mockImplementationOnce(async () => ({
      ok: false as const,
      error: "That session is not part of this story.",
    }));
    renderTable();

    const select = within(screen.getByRole("banner")).getByRole("combobox", { name: "Session" });
    await u.selectOptions(select, "Session 1");
    expect(await screen.findByText("That session is not part of this story.")).toBeInTheDocument();
    expect(select).toHaveValue("-30");
  });

  it("renames the scene from the panel behind its title, which says the players write the notes too", async () => {
    const u = userEvent.setup();
    renderTable();

    const space = screen.getByRole("region", { name: "Play space" });
    await u.click(within(space).getByRole("button", { name: `Describe ${scene.title}` }));
    const panel = await screen.findByRole("dialog", { name: scene.title });
    expect(within(panel).getByText("The players can edit this box too.")).toBeInTheDocument();

    const title = within(panel).getByRole("textbox", { name: /Title/ });
    expect(title).toHaveValue(scene.title);
    await u.clear(title);
    await u.type(title, "Strangers at noon");
    await u.click(within(panel).getByRole("button", { name: "Save scene" }));

    await waitFor(() => expect(sa_setLiveSceneText.mock.callCount()).toBe(1));
    expect(sa_setLiveSceneText.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      { title: "Strangers at noon", description: "Fog on the water.", notes: "" },
    ]);
    expect(
      await within(space).findByRole("heading", { name: "Strangers at noon" }),
    ).toBeInTheDocument();
  });

  it("has its own scene selector in the header's middle: pills, a Sessions filter, a search box and a +", async () => {
    renderTable();

    const header = screen.getByRole("banner");
    expect(
      within(header).getByRole("group", { name: "Filter Scenes by status" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: "Sessions: 0 selected" }),
    ).toBeInTheDocument();
    expect(within(header).getByRole("combobox", { name: "Scene" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "New scene" })).toBeInTheDocument();
    // The run page's selector is not here.
    expect(within(header).queryByRole("button", { name: /^Scene: / })).toBeNull();
    // It searches for the scenes in no session to start with.
    await waitFor(() => expect(sa_searchLiveScenes.mock.callCount()).toBeGreaterThan(0));
    expect(sa_searchLiveScenes.mock.calls.at(-1)?.arguments[1]).toMatchObject({ sessions: [] });
  });
});
