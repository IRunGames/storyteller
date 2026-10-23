import { EventEmitter } from "node:events";
import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { StoryElement } from "@/lib/elements";
import type { Attachment } from "@/lib/attachments";
import {
  EMPTY_PLAY_SPACE,
  type ElementDetail,
  type PlayItem,
  type RunPlaySpace,
  type RunSession,
} from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import type { StorySession } from "@/lib/stories";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -1,
};

const people: StoryElement[] = [
  { idElement: 5, status: "ACTIVE", name: "Dafydd", title: "Shell seller", description: null },
];

const scene = { idStoryScene: -15, title: "Strangers in the morning", status: "ACTIVE" };

// The reload button reads the space afresh; what it answers is set per test.
const sa_getRunPlaySpace = mock.fn(async (_idStory: number): Promise<RunPlaySpace> => ({
  ...EMPTY_PLAY_SPACE,
}));

const sa_linkSceneElement = mock.fn(
  async (
    _story: number,
    _scene: number,
    idElement: number,
    options?: { hidden?: boolean; tag?: string | null; showInfo?: boolean },
  ) => ({
    ok: true as const,
    item: {
      key: `PERSON:${idElement}`,
      kind: "PERSON" as const,
      label: "Dafydd",
      detail: "Shell seller",
      imageUrl: null,
      sceneTags: options?.tag ? [options.tag] : [],
    },
  }),
);
// Dafydd as the library's info popover reads him.
const dafyddDetail: ElementDetail = {
  idElement: 5,
  kind: "PERSON",
  name: "Dafydd",
  initialName: null,
  title: "Shell seller",
  description: null,
  notes: null,
  imageUrl: null,
  status: "READY",
  tags: [],
  url: null,
  urlText: null,
};

// The story's attachments, for the library and the pickers. Empty but for
// the test that picks a picture, which fills it and empties it again.
let storyAttachments: Attachment[] = [];
const sa_listStoryElements = mock.fn(
  async (_id: number, kind: string, _offset: number, _q?: string, _s?: string[], _sort?: string) =>
    kind === "PERSON" ? people : [],
);

// A stand-in for mqtt.js's client with the two methods the channel calls.
class FakeClient extends EventEmitter {
  subscribe = mock.fn((_topic: string, _opts: unknown, cb?: (err: Error | null) => void) =>
    cb?.(null),
  );
  end = mock.fn();
}
let client: FakeClient;
const connect = mock.fn((_url: string, _options: unknown) => (client = new FakeClient()));
const sa_getStoryChannel = mock.fn(async (_idStory: number) => ({
  url: "wss://broker.example.test:8084/mqtt",
  username: "player",
  password: "pw",
  topic: "story/-4/state",
}));

const sa_setRowStatus = mock.fn(async (_table: string, _id: number, status: string) => ({
  ok: true as const,
  status,
}));
const sa_setSceneStacks = mock.fn(
  async (_story: number, _scene: number, input: { tags: string[]; saveForStory: boolean }) => ({
    ok: true as const,
    tags: input.tags,
  }),
);
const sa_createSceneElement = mock.fn(
  async (_story: number, _scene: number, tag: string | null, input: unknown) => ({
    ok: true as const,
    item: {
      key: "PLACE:40",
      kind: "PLACE" as const,
      label: (input as { name: string }).name,
      detail: null,
      imageUrl: null,
      sceneTags: tag === null ? [] : [tag],
    },
  }),
);

// The two workflows the element form offers.
const statusOptions = (keys: string[]): StatusOption[] =>
  keys.map((key) => ({
    key,
    label: key.charAt(0) + key.slice(1).toLowerCase(),
    description: null,
    from: null,
  }));
const sa_listStatusOptions = mock.fn(async (table: string) =>
  table === "scene_elements"
    ? statusOptions(["READY", "INVISIBLE", "TAPPED", "DISABLED"])
    : statusOptions(["PENDING", "READY", "INACTIVE"]),
);

// For the element panel, from a pill or the library: Dafydd, in the scene
// whenever there is one. The panel's edit turns him from a person into a place.
const sa_getElementDetail = mock.fn(
  async (_story: number, idElement: number, idStoryScene: number | null) =>
    idElement === 5
      ? {
          element: dafyddDetail,
          link:
            idStoryScene === null
              ? null
              : {
                  idSceneElement: 9,
                  status: "READY",
                  tags: ["scene"],
                  showInfo: true,
                  createdAt: null,
                },
        }
      : null,
);
const sa_updateSceneElement = mock.fn(async () => ({
  ok: true as const,
  item: {
    key: "PLACE:5",
    kind: "PLACE" as const,
    label: "Dafydd's stall",
    detail: null,
    imageUrl: null,
    sceneTags: ["scene"],
    sceneStatus: "READY",
  },
}));

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

const sa_pulseSceneElement = mock.fn(
  async (_story: number, _scene: number, _element: number, _custom: { action: string }) => ({
    ok: true as const,
  }),
);

let RunTable: typeof import("./run-table").RunTable;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

// Zag only selects the highlighted item, and opens with its input modality
// "virtual", so a lone synthetic hover is ignored: the nudge loop
// status-pill.test.tsx uses, moving the pointer until the highlight shows.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

// The scene workflow's shape: each status may move to any other.
const sceneStatusOptions: StatusOption[] = ["PENDING", "ACTIVE", "COMPLETE"].map((key) => ({
  key,
  label: key.charAt(0) + key.slice(1).toLowerCase(),
  description: null,
  from: null,
}));

const sa_setSceneText = mock.fn(
  async (_story: number, _scene: number, values: { description: string; notes: string }) => ({
    ok: true as const,
    text: { description: values.description || null, notes: values.notes || null },
  }),
);

// Where the table sends the storyteller once the session is paused or ended.
const push = mock.fn((_href: string) => {});

// The story's sessions, for the list in the box the play space shows on no
// scene.
const storySessions: StorySession[] = [
  {
    idStorySession: -30,
    number: 3,
    title: "Kildealg",
    status: "OPEN",
    startedAt: new Date("2026-10-20T19:00:00Z"),
    length: null,
    playerCount: 2,
  },
  {
    idStorySession: -29,
    number: 2,
    title: "The Drowned Gate",
    status: "DONE",
    startedAt: new Date("2026-10-13T19:00:00Z"),
    length: 180,
    playerCount: 3,
  },
];

const kildealg: RunSession = { idStorySession: -30, number: 3, title: "Kildealg", status: "OPEN" };
// The session workflow, as the chip beside the title reads it.
// Read as transitions FROM each status, as the seed declares them: open
// pauses or ends; paused resumes or ends; resumed pauses or ends.
const SESSION_FROM: Record<string, string[]> = {
  OPEN: [],
  SUSPENDED: ["OPEN", "RESUMED"],
  RESUMED: ["SUSPENDED"],
  DONE: ["OPEN", "SUSPENDED", "RESUMED"],
};
const sessionStatusOptions: StatusOption[] = ["OPEN", "SUSPENDED", "RESUMED", "DONE"].map(
  (key) => ({
    key,
    label: key.charAt(0) + key.slice(1).toLowerCase(),
    description: null,
    from: SESSION_FROM[key],
  }),
);

function renderTable(
  preferences: Record<string, boolean> = {},
  session: RunSession | null = kildealg,
  initialSpace: RunPlaySpace = EMPTY_PLAY_SPACE,
  who: CurrentUser = user,
  storyCoverUrl: string | null = null,
  isOwner = true,
) {
  return renderWithProviders(
    <UserProvider user={who}>
      <UserPreferencesProvider preferences={preferences}>
        <RunTable
          idStory={-4}
          title="Psychoneira"
          storyCoverUrl={storyCoverUrl}
          isOwner={isOwner}
          sessions={storySessions}
          session={session}
          initialSpace={initialSpace}
          sceneStatusOptions={sceneStatusOptions}
          sessionStatusOptions={sessionStatusOptions}
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
        useRouter: () => ({ push, refresh: mock.fn() }),
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
      namedExports: {
        sa_listAttachments: async (kind: string) => (kind === "STORY" ? storyAttachments : []),
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
        sa_listRunScenes: async () => [],
        sa_loadRunScene: mock.fn(),
        sa_createRunScene: mock.fn(),
        sa_linkSceneElement,
        sa_createSceneElement,
        sa_setSceneElementShown: mock.fn(),
        sa_setSceneElementShowing: mock.fn(),
        sa_pulseSceneElement,
        sa_setSceneText,
        sa_getRunPlaySpace,

        sa_getElementDetail,
        sa_updateStoryElement: mock.fn(
          async (_story: number, _element: number, values: Record<string, string>) => ({
            ok: true as const,
            element: {
              ...dafyddDetail,
              name: values.name,
              initialName: values.initialName || null,
            },
          }),
        ),
        sa_unlinkSceneElement: mock.fn(async () => ({ ok: true as const })),
        sa_listSceneLibraryElements: mock.fn(async () => []),
        sa_setSceneStacks,
        sa_updateSceneElement,
        sa_moveSceneElement: mock.fn(),
        sa_setElementTags: mock.fn(),
      },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions, sa_setRowStatus },
    });
    // The diagnostics panel's channel: the broker is never reached from here.
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: { sa_getStoryChannel, sa_getPlayScene: mock.fn() },
    });
    mock.module("mqtt", { defaultExport: { connect } });
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_listStoryElements },
    });

    ({ RunTable } = await import("./run-table"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    sa_setUserPreference.mock.resetCalls();
    sa_linkSceneElement.mock.resetCalls();
    sa_setSceneStacks.mock.resetCalls();
    sa_setRowStatus.mock.resetCalls();
    sa_createSceneElement.mock.resetCalls();
    sa_getStoryChannel.mock.resetCalls();
    connect.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  it("names the story and the session in the header, with the session's status beside it", () => {
    renderTable();
    const header = screen.getByRole("banner");

    expect(within(header).getByText("Psychoneira")).toBeInTheDocument();
    expect(within(header).getByText("3. Kildealg")).toBeInTheDocument();
    // The session's status, as a menu for pausing or ending it.
    const chip = within(header).getByRole("button", { name: "Open" });
    expect(chip).toHaveAttribute("data-status", "OPEN");
    // The scene selector follows, saying only Scene; no scene is loaded yet.
    const selector = within(header).getByRole("button", { name: "Scene: None" });
    expect(selector).toHaveTextContent(/^Scene$/);
    expect(selector).toBeEnabled();
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

  it("sorts the library from the menu beside its heading, one sort for attachments and one for elements", async () => {
    const u = userEvent.setup();
    renderTable();
    const library = screen.getByRole("region", { name: "Library" });
    const sort = within(library).getByRole("button", { name: "Sort the library" });

    // The Attachments tab is in view, so the menu offers its three, Updated in force.
    await u.click(sort);
    let items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual(["File name", "Updated", "Created"]);
    expect(screen.getByRole("menuitemradio", { name: "Updated" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await choose(u, screen.getByRole("menuitemradio", { name: "File name" }));
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.libraryAttachmentSort",
      value: "file_name",
    });

    // An element tab gets the elements' five, Name in force, and the tab
    // asks the database for its list in the sort chosen.
    await u.click(screen.getByRole("tab", { name: "People" }));
    await screen.findByRole("tabpanel", { name: "People" });
    await u.click(sort);
    items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Name",
      "Initial name",
      "Title",
      "Created",
      "Updated",
    ]);
    expect(screen.getByRole("menuitemradio", { name: "Name" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await choose(u, screen.getByRole("menuitemradio", { name: "Title" }));
    expect(sa_setUserPreference.mock.calls[1].arguments[0]).toEqual({
      key: "run.libraryElementSort",
      value: "title",
    });
    await waitFor(() =>
      expect(sa_listStoryElements.mock.calls.at(-1)?.arguments).toEqual([
        -4,
        "PERSON",
        0,
        "",
        undefined,
        "title",
      ]),
    );
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

  it("offers Diagnostics to a storyteller in the chat's place, listening to the story's topic", async () => {
    const u = userEvent.setup();
    renderTable({ "run.showChat": true }, kildealg, EMPTY_PLAY_SPACE, { ...user, idUserType: -2 });
    await waitFor(() => expect(connect.mock.calls).toHaveLength(1));
    await act(async () => {
      client.emit("connect");
    });
    expect(client.subscribe.mock.calls[0].arguments[0]).toBe("story/-4/state");
    const header = screen.getByRole("banner");
    expect(screen.getByRole("region", { name: "Table Chat" })).toBeInTheDocument();

    await u.click(within(header).getByRole("button", { name: "Diagnostics" }));

    expect(screen.queryByRole("region", { name: "Table Chat" })).not.toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Diagnostics" });
    expect(within(panel).getByText("connected")).toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.showDiagnostics",
      value: true,
    });

    await act(async () => {
      client.emit(
        "message",
        "story/-4/state",
        new TextEncoder().encode(
          JSON.stringify({ v: 1, at: "", idStory: -4, type: "scene.changed", idStoryScene: 9 }),
        ),
      );
    });
    expect(
      within(panel).getByRole("button", { name: /scene\.changed · scene 9/ }),
    ).toBeInTheDocument();
  });

  it("neither offers Diagnostics to a player's account nor listens for one", () => {
    renderTable({ "run.showDiagnostics": true });
    expect(
      within(screen.getByRole("banner")).queryByRole("button", { name: "Diagnostics" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Diagnostics" })).not.toBeInTheDocument();
    expect(sa_getStoryChannel.mock.calls).toHaveLength(0);
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

  it("with no scene, keeps a library item in a Default stack, once, and takes it out again", async () => {
    const u = userEvent.setup();
    renderTable();
    const space = screen.getByRole("region", { name: "Play space" });
    // Nothing brought in yet: no empty Default stack, and the heading is for
    // a screen reader only.
    expect(within(space).queryByRole("region", { name: "Default" })).not.toBeInTheDocument();
    expect(within(space).queryByText("Nothing here yet.")).not.toBeInTheDocument();
    expect(within(space).getByRole("heading", { name: "Play space" })).toHaveStyle({
      position: "absolute",
    });

    await u.click(screen.getByRole("tab", { name: "People" }));
    const add = await screen.findByRole("button", { name: "Add Dafydd to the play space" });
    await u.click(add);
    await u.click(add);

    const stack = within(space).getByRole("region", { name: "Default" });
    // No scene to make an element in.
    expect(within(stack).queryByRole("button", { name: /^New element/ })).not.toBeInTheDocument();
    const items = within(stack).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Dafydd");
    expect(items[0]).toHaveTextContent("Shell seller");
    // Only the page holds it, with no scene to link it to.
    expect(sa_linkSceneElement.mock.callCount()).toBe(0);

    // Pills have no ✕; taking an element out is the info popover's −,
    // which needs a scene.
    expect(within(space).queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });

  it("with no scene, says what is playing in a box with the sessions folded away", async () => {
    const u = userEvent.setup();
    renderTable();
    const box = screen.getByTestId("story-playing-box");
    expect(within(box).getByRole("heading", { name: "Playing Psychoneira" })).toBeInTheDocument();

    const sessions = within(box).getByRole("region", { name: "Sessions" });
    const toggle = within(sessions).getByRole("button", { name: "Show sessions" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(sessions).getByText("3. Kildealg")).not.toBeVisible();

    await u.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(sessions).getByText("3. Kildealg")).toBeVisible();
    expect(within(sessions).getByText("2. The Drowned Gate")).toBeVisible();
    // The owner's pencil and bin, as on the library's Timeline.
    expect(
      within(sessions).getByRole("button", { name: "Delete 2. The Drowned Gate" }),
    ).toBeInTheDocument();
    expect(within(sessions).getAllByRole("button", { name: /^Edit / }).length).toBeGreaterThan(0);
  });

  it("leaves the pencils and bins off the sessions list for anyone but the owner", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, EMPTY_PLAY_SPACE, user, null, false);
    const sessions = within(screen.getByTestId("story-playing-box")).getByRole("region", {
      name: "Sessions",
    });
    await u.click(within(sessions).getByRole("button", { name: "Show sessions" }));
    expect(within(sessions).getByText("3. Kildealg")).toBeVisible();
    expect(within(sessions).queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
    expect(within(sessions).queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
  });

  it("shows no story box once the table is on a scene", () => {
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay: [] });
    expect(screen.queryByTestId("story-playing-box")).not.toBeInTheDocument();
  });

  it("keeps one picture up at a time: the tack on a second pill takes the first down", async () => {
    const u = userEvent.setup();
    const pictured = (idElement: number, label: string): PlayItem => ({
      key: `PERSON:${idElement}`,
      kind: "PERSON",
      label,
      detail: null,
      imageUrl: `https://x.test/${idElement}.png`,
      sceneTags: ["scene"],
      sceneStatus: "READY",
      showInfo: true,
    });
    renderTable({}, kildealg, {
      scene,
      tags: ["scene"],
      coverUrl: null,
      inPlay: [pictured(5, "Dafydd"), pictured(6, "Abbot")],
    });
    const space = screen.getByRole("region", { name: "Play space" });

    await u.click(
      within(space).getByRole("button", { name: "Show Dafydd's picture to the players" }),
    );
    await within(space).findByRole("button", { name: "Hide Dafydd's picture from the players" });
    expect(sa_pulseSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      { action: "preview.open" },
    ]);

    // Abbot's goes up, and Dafydd's comes down with it, as the action took it.
    await u.click(
      within(space).getByRole("button", { name: "Show Abbot's picture to the players" }),
    );
    await within(space).findByRole("button", { name: "Hide Abbot's picture from the players" });
    expect(
      within(space).getByRole("button", { name: "Show Dafydd's picture to the players" }),
    ).toBeInTheDocument();
    expect(sa_pulseSceneElement.mock.calls[1].arguments).toEqual([
      -4,
      -15,
      6,
      { action: "preview.open" },
    ]);
  });

  it("reloads the scene from the button at the left of its title", async () => {
    const u = userEvent.setup();
    sa_getRunPlaySpace.mock.resetCalls();
    sa_getRunPlaySpace.mock.mockImplementationOnce(async () => ({
      scene: { ...scene, title: "Strangers at noon" },
      tags: ["scene"],
      coverUrl: null,
      inPlay: [
        {
          key: "PERSON:5",
          kind: "PERSON",
          label: "Dafydd",
          detail: null,
          imageUrl: null,
          sceneTags: ["scene"],
        },
      ],
    }));
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay: [] });
    const space = screen.getByRole("region", { name: "Play space" });
    expect(within(space).queryByText("Dafydd")).not.toBeInTheDocument();

    // Before the title, in its pill, not in the header.
    const reload = within(space).getByRole("button", { name: "Reload the scene" });
    const title = within(space).getByRole("heading", { name: "Strangers in the morning" });
    expect(reload.parentElement).toBe(title.parentElement);
    expect(reload.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(screen.getByRole("banner")).queryByRole("button", { name: "Reload the scene" }),
    ).not.toBeInTheDocument();
    await u.hover(reload);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Reload the scene");
    await u.click(reload);

    await waitFor(() => expect(sa_getRunPlaySpace.mock.callCount()).toBe(1));
    expect(sa_getRunPlaySpace.mock.calls[0].arguments).toEqual([-4]);
    // The space is what the database holds now: the scene's title and its
    // elements as read.
    expect(await within(space).findByText("Dafydd")).toBeInTheDocument();
    expect(within(space).getByRole("heading", { name: "Strangers at noon" })).toBeInTheDocument();
  });

  it("says so and keeps the space when the scene cannot be reloaded", async () => {
    const u = userEvent.setup();
    sa_getRunPlaySpace.mock.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay: [] });

    await u.click(screen.getByRole("button", { name: "Reload the scene" }));
    expect(
      await screen.findByText("The scene could not be reloaded. Try again."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Play space" })).getByRole("heading", {
        name: "Strangers in the morning",
      }),
    ).toBeInTheDocument();
  });

  it("offers no reload with no scene at the table, since there is none to reload", () => {
    renderTable();
    expect(screen.queryByRole("button", { name: "Reload the scene" })).not.toBeInTheDocument();
  });

  it("stacks the scene's elements by its tags, the untagged in the first", () => {
    const inPlay: PlayItem[] = [
      {
        key: "PERSON:5",
        kind: "PERSON",
        label: "Dafydd",
        detail: "Shell seller",
        imageUrl: null,
        sceneTags: ["scene"],
      },
      {
        key: "PLACE:6",
        kind: "PLACE",
        label: "Abbey",
        detail: null,
        imageUrl: null,
        sceneTags: [],
      },
    ];
    renderTable({}, kildealg, { scene, tags: ["elements", "scene"], coverUrl: null, inPlay });
    const space = screen.getByRole("region", { name: "Play space" });
    // The scene selector and its status sit in the header, after the session.
    const header = screen.getByRole("banner");
    const selector = within(header).getByRole("button", {
      name: "Scene: Strangers in the morning",
    });
    const chip = within(header).getByRole("button", { name: "Active" });
    expect(selector.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The scene's title stands in the play space, before its stacks; the
    // region's own heading stands aside for the eye and stays for a screen
    // reader.
    const title = within(space).getByRole("heading", { name: "Strangers in the morning" });
    expect(
      title.compareDocumentPosition(within(space).getByRole("region", { name: "elements" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(space).getByRole("heading", { name: "Play space" })).toHaveStyle({
      position: "absolute",
    });

    const elements = within(space).getByRole("region", { name: "elements" });
    const sceneStack = within(space).getByRole("region", { name: "scene" });
    expect(
      within(elements)
        .getAllByRole("listitem")
        .map((i) => i.textContent),
    ).toEqual(["Abbey"]);
    expect(
      within(sceneStack)
        .getAllByRole("listitem")
        .map((i) => i.textContent),
    ).toEqual(["DafyddShell seller"]);
    expect(screen.queryByTestId("play-space-cover")).not.toBeInTheDocument();
  });

  it("shows one Default stack for a scene with no tags", () => {
    renderTable({}, kildealg, { scene, tags: [], coverUrl: null, inPlay: [] });
    const space = screen.getByRole("region", { name: "Play space" });

    const stack = within(space).getByRole("region", { name: "Default" });
    expect(
      within(stack).getByRole("button", { name: "New element in Default" }),
    ).toBeInTheDocument();
  });

  it("links a library element to the scene, into the first stack", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, {
      scene,
      tags: ["elements", "scene"],
      coverUrl: null,
      inPlay: [],
    });

    await u.click(screen.getByRole("tab", { name: "People" }));
    await u.click(await screen.findByRole("button", { name: "Add Dafydd to the play space" }));

    const elements = screen.getByRole("region", { name: "elements" });
    expect(await within(elements).findByText("Dafydd")).toBeInTheDocument();
    expect(sa_linkSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      { hidden: false, tag: "elements", showInfo: false },
    ]);
  });

  it("adds from the library into the stack the In select names, the first by default", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, { scene, tags: ["elements", "scene"], coverUrl: null, inPlay: [] });
    const library = screen.getByRole("region", { name: "Library" });

    const select = within(library).getByRole("button", { name: "Add to the elements stack" });
    expect(select).toHaveTextContent("In:elements");
    await u.click(select);
    await choose(u, await screen.findByRole("menuitemradio", { name: "scene" }));
    expect(
      within(library).getByRole("button", { name: "Add to the scene stack" }),
    ).toBeInTheDocument();

    await u.click(screen.getByRole("tab", { name: "People" }));
    await u.click(await screen.findByRole("button", { name: "Add Dafydd to the play space" }));
    expect(sa_linkSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      { hidden: false, tag: "scene", showInfo: false },
    ]);
    const sceneStack = screen.getByRole("region", { name: "scene" });
    expect(await within(sceneStack).findByText("Dafydd")).toBeInTheDocument();
  });

  it("makes a new stack from the In select and chooses it", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, { scene, tags: ["elements", "scene"], coverUrl: null, inPlay: [] });
    const library = screen.getByRole("region", { name: "Library" });

    await u.click(within(library).getByRole("button", { name: "Add to the elements stack" }));
    await choose(u, await screen.findByRole("menuitem", { name: "Create new stack" }));
    const dialog = await screen.findByRole("dialog", { name: "New stack" });
    await u.type(within(dialog).getByRole("textbox", { name: "Name" }), "Docks");
    await u.click(within(dialog).getByRole("button", { name: "Add stack" }));

    expect(sa_setSceneStacks.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      { tags: ["elements", "scene", "Docks"], saveForStory: false },
    ]);
    // The play space has the new stack, and the select has chosen it.
    expect(await screen.findByRole("region", { name: "Docks" })).toBeInTheDocument();
    expect(
      within(library).getByRole("button", { name: "Add to the Docks stack" }),
    ).toBeInTheDocument();
  });

  it("renames a stack in Manage stacks, taking its pills and the In select with it", async () => {
    const u = userEvent.setup();
    const inPlay: PlayItem[] = [
      {
        key: "PERSON:5",
        kind: "PERSON",
        label: "Dafydd",
        detail: null,
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "READY",
      },
    ];
    renderTable({}, kildealg, { scene, tags: ["elements", "scene"], coverUrl: null, inPlay });
    const library = screen.getByRole("region", { name: "Library" });
    await u.click(within(library).getByRole("button", { name: "Add to the elements stack" }));
    await choose(u, await screen.findByRole("menuitemradio", { name: "scene" }));

    await u.click(screen.getByRole("button", { name: "Manage stacks" }));
    const dialog = await screen.findByRole("dialog", { name: "Manage stacks" });
    const field = within(dialog).getByRole("textbox", { name: "Name of scene" });
    await u.clear(field);
    await u.type(field, "Docks");
    // The row's buttons keep the name it opened with while it is typed.
    expect(within(dialog).getByRole("button", { name: "Remove scene" })).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(sa_setSceneStacks.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      {
        tags: ["elements", "Docks"],
        renames: [{ from: "scene", to: "Docks" }],
        saveForStory: false,
      },
    ]);
    const docks = await screen.findByRole("region", { name: "Docks" });
    expect(within(docks).getByText("Dafydd")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "scene" })).not.toBeInTheDocument();
    expect(
      within(library).getByRole("button", { name: "Add to the Docks stack" }),
    ).toBeInTheDocument();
  });

  it("says a renamed stack that clashes, before anything is saved", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, { scene, tags: ["elements", "scene"], coverUrl: null, inPlay: [] });

    await u.click(screen.getByRole("button", { name: "Manage stacks" }));
    const dialog = await screen.findByRole("dialog", { name: "Manage stacks" });
    const field = within(dialog).getByRole("textbox", { name: "Name of scene" });
    await u.clear(field);
    await u.type(field, "Elements");
    await u.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Each stack needs its own name.")).toBeInTheDocument();
    expect(sa_setSceneStacks.mock.callCount()).toBe(0);
  });

  it("adds, removes and reorders stacks from Manage stacks, for the story too", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, { scene, tags: ["elements", "scene"], coverUrl: null, inPlay: [] });

    await u.click(screen.getByRole("button", { name: "Manage stacks" }));
    const dialog = await screen.findByRole("dialog", { name: "Manage stacks" });
    await u.click(within(dialog).getByRole("button", { name: "Move scene up" }));
    await u.click(within(dialog).getByRole("button", { name: "Remove elements" }));
    await u.type(within(dialog).getByRole("textbox", { name: "New stack" }), "Docks{Enter}");
    // A name already in the list is said beside the field.
    await u.type(within(dialog).getByRole("textbox", { name: "New stack" }), "docks{Enter}");
    expect(within(dialog).getByText("Each stack needs its own name.")).toBeInTheDocument();
    await u.clear(within(dialog).getByRole("textbox", { name: "New stack" }));
    await u.click(
      within(dialog).getByRole("checkbox", { name: "Also save as the story's default stacks" }),
    );
    await u.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(sa_setSceneStacks.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      { tags: ["scene", "Docks"], renames: [], saveForStory: true },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "elements" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("region", { name: "Docks" })).toBeInTheDocument();
    // The In select falls back to the first stack, its own having gone.
    expect(screen.getByRole("button", { name: "Add to the scene stack" })).toBeInTheDocument();
  });

  it("completes the scene from its status chip once asked, then locks the play space", async () => {
    const u = userEvent.setup();
    const inPlay: PlayItem[] = [
      {
        key: "PERSON:5",
        kind: "PERSON",
        label: "Dafydd",
        detail: null,
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "READY",
      },
    ];
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay });
    const header = screen.getByRole("banner");
    expect(screen.queryByTestId("scene-complete-overlay")).not.toBeInTheDocument();

    const chip = within(header).getByRole("button", { name: "Active" });
    await u.hover(chip);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Set scene status");
    await u.click(chip);
    await choose(u, await screen.findByRole("menuitem", { name: "Complete" }));

    const ask = await screen.findByRole("dialog", { name: "Complete this scene?" });
    expect(ask).toHaveTextContent("nothing can be added to it or taken out of it");
    expect(ask).toHaveTextContent("start a new scene");
    expect(sa_setRowStatus.mock.callCount()).toBe(0);
    await u.click(within(ask).getByRole("button", { name: "Complete scene" }));

    expect(await screen.findByTestId("scene-complete-overlay")).toHaveTextContent("COMPLETE");
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["story_scenes", -15, "COMPLETE"]);
    // The stack controls and the library's arrows are gone.
    expect(screen.queryByRole("button", { name: "Manage stacks" })).not.toBeInTheDocument();
    await u.click(screen.getByRole("tab", { name: "People" }));
    const people = await screen.findByRole("tabpanel", { name: "People" });
    await within(people).findByRole("button", { name: "About Dafydd" });
    expect(
      within(people).queryByRole("button", { name: "Add Dafydd to the play space" }),
    ).not.toBeInTheDocument();
  });

  it("resumes a complete scene from its status chip once asked, lifting the overlay and locks", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, {
      scene: { ...scene, status: "COMPLETE" },
      tags: ["scene"],
      coverUrl: null,
      inPlay: [],
    });
    expect(screen.getByTestId("scene-complete-overlay")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage stacks" })).not.toBeInTheDocument();

    // Still a menu on a complete scene, but leaving complete asks first.
    const chip = within(screen.getByRole("banner")).getByRole("button", { name: "Complete" });
    await u.click(chip);
    await choose(u, await screen.findByRole("menuitem", { name: "Active" }));
    let ask = await screen.findByRole("dialog", { name: "Resume this scene?" });
    expect(ask).toHaveTextContent("makes it active again");
    await u.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Resume this scene?" })).not.toBeInTheDocument(),
    );
    expect(sa_setRowStatus.mock.callCount()).toBe(0);
    expect(screen.getByTestId("scene-complete-overlay")).toBeInTheDocument();

    await u.click(chip);
    await choose(u, await screen.findByRole("menuitem", { name: "Active" }));
    ask = await screen.findByRole("dialog", { name: "Resume this scene?" });
    await u.click(within(ask).getByRole("button", { name: "Resume scene" }));

    await waitFor(() =>
      expect(screen.queryByTestId("scene-complete-overlay")).not.toBeInTheDocument(),
    );
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["story_scenes", -15, "ACTIVE"]);
    expect(screen.getByRole("button", { name: "Manage stacks" })).toBeInTheDocument();
  });

  it("opens a complete scene under its overlay, its pills and text still there to read", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, {
      scene: {
        ...scene,
        status: "COMPLETE",
        text: { description: "Fog on the water.", notes: null },
      },
      tags: ["scene"],
      coverUrl: null,
      inPlay: [
        {
          key: "PERSON:5",
          kind: "PERSON",
          label: "Dafydd",
          detail: "Shell seller",
          imageUrl: null,
          sceneTags: ["scene"],
          sceneStatus: "READY",
        },
      ],
    });

    const overlay = screen.getByTestId("scene-complete-overlay");
    expect(overlay).toHaveTextContent("COMPLETE");
    expect(overlay).toHaveStyle({ pointerEvents: "none" });

    // The chevron opens the panel, read only.
    const space = screen.getByRole("region", { name: "Play space" });
    await u.click(within(space).getByRole("button", { name: "About Dafydd" }));
    const panel = await screen.findByRole("region", { name: "About Dafydd" });
    expect(await within(panel).findByTestId("element-panel-where")).toHaveTextContent("SCENE");
    expect(within(panel).queryByRole("button", { name: "Remove from scene" })).toBeNull();

    // The scene's text opens to read, with no form.
    await u.click(within(space).getByRole("button", { name: /^Describe / }));
    const text = await screen.findByRole("dialog", { name: scene.title });
    expect(await within(text).findByText("Fog on the water.")).toBeInTheDocument();
    expect(within(text).queryByRole("textbox")).toBeNull();
  });

  it("opens the same panel from the library, with the scene's part for an element in it", async () => {
    const u = userEvent.setup();
    const inPlay: PlayItem[] = [
      {
        key: "PERSON:5",
        kind: "PERSON",
        label: "Dafydd",
        detail: "Shell seller",
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "READY",
      },
    ];
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay });

    await u.click(screen.getByRole("tab", { name: "People" }));
    const people = await screen.findByRole("tabpanel", { name: "People" });
    await u.click(await within(people).findByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });
    // In the scene at the table: SCENE, its status and its In this scene rows.
    expect(await within(dialog).findByTestId("element-panel-where")).toHaveTextContent("SCENE");
    expect(within(dialog).getByRole("heading", { name: "In this scene" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remove from scene" })).toBeInTheDocument();
    // Move to is a pill's, which knows its stack; the library has none.
    expect(within(dialog).queryByText("Move to")).toBeNull();

    // Edited in the scene, as from the pill: the pill in play takes the change.
    await u.click(within(dialog).getByRole("button", { name: "Edit Dafydd" }));
    await within(dialog).findByRole("button", { name: "In this scene: Ready" });
    await u.click(within(dialog).getByRole("button", { name: "Save element" }));
    const sceneStack = screen.getByRole("region", { name: "scene" });
    expect(await within(sceneStack).findByText("Dafydd's stall")).toBeInTheDocument();
  });

  it("takes a pill out of the play space when its panel's − removes it from the scene", async () => {
    const u = userEvent.setup();
    const inPlay: PlayItem[] = [
      {
        key: "PERSON:5",
        kind: "PERSON",
        label: "Dafydd",
        detail: null,
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "READY",
      },
    ];
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay });
    const sceneStack = screen.getByRole("region", { name: "scene" });

    await u.click(within(sceneStack).getByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("region", { name: "About Dafydd" });
    await u.click(await within(dialog).findByRole("button", { name: "Remove from scene" }));

    await waitFor(() => expect(within(sceneStack).queryByText("Dafydd")).not.toBeInTheDocument());
  });

  it("takes the pill out when the library's panel removes it, even under another kind", async () => {
    const u = userEvent.setup();
    // In play as a place, though the library lists Dafydd among People: his
    // kind changed after his pill went in.
    const inPlay: PlayItem[] = [
      {
        key: "PLACE:5",
        kind: "PLACE",
        label: "Dafydd",
        detail: null,
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "READY",
      },
    ];
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay });
    const sceneStack = screen.getByRole("region", { name: "scene" });
    expect(within(sceneStack).getByText("Dafydd")).toBeInTheDocument();

    await u.click(screen.getByRole("tab", { name: "People" }));
    const people = await screen.findByRole("tabpanel", { name: "People" });
    await u.click(await within(people).findByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });
    await u.click(await within(dialog).findByRole("button", { name: "Remove from scene" }));

    await waitFor(() => expect(within(sceneStack).queryByText("Dafydd")).not.toBeInTheDocument());
  });

  it("offers no stack controls with no scene at the table", () => {
    renderTable();

    expect(screen.queryByRole("button", { name: "Manage stacks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add to the / })).not.toBeInTheDocument();
  });

  it("gives a new element a picture of its own and one for this scene, chosen in its form", async () => {
    storyAttachments = [
      {
        idAttachment: 30,
        idStory: -4,
        kind: "STORY",
        idExternal: -4,
        idAttachmentUse: null,
        status: "READY",
        url: "https://x.test/30.png",
        isUploaded: true,
        fileName: "Tide pool.png",
        isCover: false,
        tags: [],
        createdAt: null,
        updatedAt: null,
      },
    ];
    try {
      const u = userEvent.setup();
      renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay: [] });

      const sceneStack = screen.getByRole("region", { name: "scene" });
      await u.click(within(sceneStack).getByRole("button", { name: "New element in scene" }));
      const popover = await screen.findByRole("dialog", { name: "New element in scene" });
      await within(popover).findByRole("button", { name: "In this scene: Ready" });
      // The scene's box at the top holds the link's own picture for this
      // scene; the element's own comes first among its fields below.
      const sceneBox = within(popover).getByTestId("scene-element-fields");
      expect(within(sceneBox).getByText("Picture in this scene (optional)")).toBeInTheDocument();
      await u.click(within(sceneBox).getByRole("button", { name: "Add picture" }));
      // Choosing only fills the form; nothing is saved until Add element.
      await u.click(await within(sceneBox).findByRole("button", { name: "Add Tide pool.png" }));
      expect(within(sceneBox).getByText("Tide pool.png")).toBeInTheDocument();
      expect(within(sceneBox).getByRole("button", { name: "Remove picture" })).toBeInTheDocument();

      await u.click(within(popover).getByRole("button", { name: "Add picture" }));
      await u.click(await within(popover).findByRole("button", { name: "Add Tide pool.png" }));
      expect(within(popover).getAllByRole("button", { name: "Remove picture" })).toHaveLength(2);
      expect(sa_createSceneElement.mock.callCount()).toBe(0);

      await u.type(within(popover).getByRole("textbox", { name: /^Name/ }), "The tide pool");
      await u.click(within(popover).getByRole("button", { name: "Status: Pending" }));
      await choose(u, await screen.findByRole("menuitem", { name: "Ready" }));
      await u.click(within(popover).getByRole("button", { name: "Add element" }));

      await waitFor(() => expect(sa_createSceneElement.mock.callCount()).toBe(1));
      expect(sa_createSceneElement.mock.calls[0].arguments[3]).toMatchObject({
        name: "The tide pool",
        idAttachment: 30,
        idSceneAttachment: 30,
      });
    } finally {
      storyAttachments = [];
    }
  });

  it("makes a new element from a stack's +, filed under its tag", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, {
      scene,
      tags: ["elements", "scene"],
      coverUrl: null,
      inPlay: [],
    });
    const sceneStack = screen.getByRole("region", { name: "scene" });

    await u.click(within(sceneStack).getByRole("button", { name: "New element in scene" }));
    const popover = await screen.findByRole("dialog", { name: "New element in scene" });
    await u.selectOptions(within(popover).getByRole("combobox", { name: "Kind" }), "PLACE");
    // The scene element's status leads the form, at the workflow's first.
    expect(
      await within(popover).findByRole("button", { name: "In this scene: Ready" }),
    ).toBeInTheDocument();
    await u.type(within(popover).getByRole("textbox", { name: /^Name/ }), "The tide pool");
    await u.type(within(popover).getByRole("textbox", { name: /^Notes/ }), "Cold.");
    await u.click(within(popover).getByRole("button", { name: "Status: Pending" }));
    await choose(u, await screen.findByRole("menuitem", { name: "Ready" }));
    await u.click(within(popover).getByRole("button", { name: "Add element" }));

    expect(await within(sceneStack).findByText("The tide pool")).toBeInTheDocument();
    expect(sa_createSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      "scene",
      {
        kind: "PLACE",
        name: "The tide pool",
        initialName: "",
        title: "",
        description: "",
        notes: "Cold.",
        url: "",
        urlText: "",
        status: "READY",
        sceneStatus: "READY",
        sceneUrl: "",
        sceneUrlText: "",
        // No picture chosen, and the Add showing info switch off.
        idAttachment: null,
        idSceneAttachment: null,
        showInfo: false,
      },
    ]);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New element in scene" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("makes an element of a library tab's kind, linked to the scene and put in play", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay: [] });

    await u.click(screen.getByRole("tab", { name: "Places" }));
    await u.click(await screen.findByRole("button", { name: "New element in the scene" }));
    const popover = await screen.findByRole("dialog", { name: "New element in the scene" });
    // The form starts on the tab's kind.
    expect(within(popover).getByRole("combobox", { name: "Kind" })).toHaveValue("PLACE");
    await within(popover).findByRole("button", { name: "In this scene: Ready" });
    await u.type(within(popover).getByRole("textbox", { name: /^Name/ }), "The tide pool");
    await u.click(within(popover).getByRole("button", { name: "Status: Pending" }));
    await choose(u, await screen.findByRole("menuitem", { name: "Ready" }));
    await u.click(within(popover).getByRole("button", { name: "Add element" }));

    // Filed under the In select's stack, the first by default.
    expect(sa_createSceneElement.mock.calls[0].arguments.slice(0, 3)).toEqual([-4, -15, "scene"]);
    const sceneStack = screen.getByRole("region", { name: "scene" });
    expect(await within(sceneStack).findByText("The tide pool")).toBeInTheDocument();
  });

  it("adds as invisible with the library's switch, from the arrow and the +", async () => {
    const u = userEvent.setup();
    renderTable({ "run.addInvisible": true }, kildealg, {
      scene,
      tags: ["scene"],
      coverUrl: null,
      inPlay: [],
    });
    const library = screen.getByRole("region", { name: "Library" });
    expect(within(library).getByRole("switch", { name: "Add as invisible" })).toBeChecked();

    await u.click(screen.getByRole("tab", { name: "People" }));
    await u.click(await screen.findByRole("button", { name: "Add Dafydd to the play space" }));
    expect(sa_linkSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      { hidden: true, tag: "scene", showInfo: false },
    ]);

    const sceneStack = screen.getByRole("region", { name: "scene" });
    await u.click(within(sceneStack).getByRole("button", { name: "New element in scene" }));
    const popover = await screen.findByRole("dialog", { name: "New element in scene" });
    expect(
      await within(popover).findByRole("button", { name: "In this scene: Invisible" }),
    ).toBeInTheDocument();
  });

  it("adds showing info with the library's other switch, from the arrow and the +", async () => {
    const u = userEvent.setup();
    renderTable({ "run.addShowInfo": true }, kildealg, {
      scene,
      tags: ["scene"],
      coverUrl: null,
      inPlay: [],
    });
    const library = screen.getByRole("region", { name: "Library" });
    expect(within(library).getByRole("switch", { name: "Add showing info" })).toBeChecked();

    await u.click(screen.getByRole("tab", { name: "People" }));
    await u.click(await screen.findByRole("button", { name: "Add Dafydd to the play space" }));
    expect(sa_linkSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      { hidden: false, tag: "scene", showInfo: true },
    ]);

    const sceneStack = screen.getByRole("region", { name: "scene" });
    await u.click(within(sceneStack).getByRole("button", { name: "New element in scene" }));
    const popover = await screen.findByRole("dialog", { name: "New element in scene" });
    await u.type(await within(popover).findByRole("textbox", { name: /^Name/ }), "The tide pool");
    await u.click(within(popover).getByRole("button", { name: "Add element" }));
    await waitFor(() => expect(sa_createSceneElement.mock.callCount()).toBe(1));
    expect(sa_createSceneElement.mock.calls[0].arguments[3]).toMatchObject({ showInfo: true });

    // Ephemera start with their info hidden whatever the switch says: a
    // handout is for the storyteller to give out, not for the players to
    // read the moment it appears.
    await u.click(within(sceneStack).getByRole("button", { name: "New element in scene" }));
    const again = await screen.findByRole("dialog", { name: "New element in scene" });
    await u.selectOptions(
      await within(again).findByRole("combobox", { name: /^Kind/ }),
      "EPHEMERA",
    );
    await u.type(within(again).getByRole("textbox", { name: /^Name/ }), "A torn letter");
    await u.click(within(again).getByRole("button", { name: "Add element" }));
    await waitFor(() => expect(sa_createSceneElement.mock.callCount()).toBe(2));
    expect(sa_createSceneElement.mock.calls[1].arguments[3]).toMatchObject({
      kind: "EPHEMERA",
      showInfo: false,
    });
  });

  it("remembers the Add showing info switch", async () => {
    const u = userEvent.setup();
    renderTable();

    await u.click(screen.getByRole("switch", { name: "Add showing info" }));

    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.addShowInfo",
      value: true,
    });
  });

  it("remembers the Add as invisible switch", async () => {
    const u = userEvent.setup();
    renderTable();

    await u.click(screen.getByRole("switch", { name: "Add as invisible" }));

    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.addInvisible",
      value: true,
    });
  });

  it("keeps the Add as invisible switch below the library, and remembers Scene only", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, { scene, tags: ["scene"], coverUrl: null, inPlay: [] });
    const library = screen.getByRole("region", { name: "Library" });

    // The switch comes after the list, outside the part that scrolls.
    const tabs = within(library).getByRole("tablist");
    const toggle = within(library).getByRole("switch", { name: "Add as invisible" });
    expect(tabs.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await u.click(within(library).getByRole("radio", { name: "Scene only" }));
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.librarySceneOnly",
      value: true,
    });
  });

  it("offers only All with no scene at the table", () => {
    renderTable();
    const library = screen.getByRole("region", { name: "Library" });

    expect(within(library).getByRole("radio", { name: "All" })).toBeChecked();
    expect(within(library).getByRole("radio", { name: "Scene only" })).toBeDisabled();
  });

  it("keeps one pill for an element whose kind is changed from its popover", async () => {
    const u = userEvent.setup();
    renderTable({}, kildealg, {
      scene,
      tags: ["scene"],
      coverUrl: null,
      inPlay: [
        {
          key: "PERSON:5",
          kind: "PERSON",
          label: "Dafydd",
          detail: "Shell seller",
          imageUrl: null,
          sceneTags: ["scene"],
          sceneStatus: "READY",
        },
      ],
    });
    const sceneStack = screen.getByRole("region", { name: "scene" });

    await u.click(within(sceneStack).getByRole("button", { name: "About Dafydd" }));
    const popover = await screen.findByRole("region", { name: "About Dafydd" });
    await u.click(await within(popover).findByRole("button", { name: "Edit Dafydd" }));
    await u.selectOptions(await within(popover).findByRole("combobox", { name: "Kind" }), "PLACE");
    await u.click(within(popover).getByRole("button", { name: "Save element" }));

    expect(await within(sceneStack).findByText("Dafydd's stall")).toBeInTheDocument();
    expect(within(sceneStack).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows the scene's cover behind the play space", () => {
    renderTable({}, kildealg, {
      scene,
      tags: ["scene"],
      coverUrl: "https://x.test/docks.png",
      inPlay: [],
    });

    expect(screen.getByTestId("play-space-cover")).toHaveStyle({
      backgroundImage: 'url("https://x.test/docks.png")',
    });
  });

  it("shows the story's cover behind the play space when there is no scene", () => {
    renderTable({}, kildealg, EMPTY_PLAY_SPACE, user, "https://x.test/story.png");

    expect(screen.getByTestId("play-space-cover")).toHaveStyle({
      backgroundImage: 'url("https://x.test/story.png")',
    });
  });

  it("shows the story's cover for a scene without one, and the scene's own over it", () => {
    const { unmount } = renderTable(
      {},
      kildealg,
      { scene, tags: ["scene"], coverUrl: null, inPlay: [] },
      user,
      "https://x.test/story.png",
    );
    expect(screen.getByTestId("play-space-cover")).toHaveStyle({
      backgroundImage: 'url("https://x.test/story.png")',
    });
    unmount();

    renderTable(
      {},
      kildealg,
      { scene, tags: ["scene"], coverUrl: "https://x.test/docks.png", inPlay: [] },
      user,
      "https://x.test/story.png",
    );
    expect(screen.getByTestId("play-space-cover")).toHaveStyle({
      backgroundImage: 'url("https://x.test/docks.png")',
    });
  });

  it("opens the scene's description and notes from the chevron beside its title, and saves them", async () => {
    const u = userEvent.setup();
    sa_setSceneText.mock.resetCalls();
    renderTable({}, kildealg, {
      scene: { ...scene, text: { description: "Fog on the water.", notes: null } },
      tags: ["scene"],
      coverUrl: null,
      inPlay: [],
    });
    const space = screen.getByRole("region", { name: "Play space" });

    const chevron = within(space).getByRole("button", {
      name: "Describe Strangers in the morning",
    });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    await u.click(chevron);
    const panel = await screen.findByRole("dialog", { name: "Strangers in the morning" });
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    // The description takes focus as the panel opens.
    const description = within(panel).getByRole("textbox", { name: "Description" });
    await waitFor(() => expect(description).toHaveFocus());
    expect(description).toHaveValue("Fog on the water.");
    const notes = within(panel).getByRole("textbox", { name: "Notes" });
    expect(notes).toHaveValue("");
    await u.type(notes, "The ferryman was already dead.");
    await u.click(within(panel).getByRole("button", { name: "Save scene" }));

    await waitFor(() => expect(sa_setSceneText.mock.callCount()).toBe(1));
    expect(sa_setSceneText.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      { description: "Fog on the water.", notes: "The ferryman was already dead." },
    ]);
    expect(await screen.findByText("Scene saved")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Strangers in the morning" })).toBeNull(),
    );
    // Opened again, the panel starts from what was saved.
    await u.click(chevron);
    expect(
      within(await screen.findByRole("dialog", { name: "Strangers in the morning" })).getByRole(
        "textbox",
        { name: "Notes" },
      ),
    ).toHaveValue("The ferryman was already dead.");
  });

  it("pauses the session from its chip once asked and stays at the table, and ends it to the story's page", async () => {
    const u = userEvent.setup();
    push.mock.resetCalls();
    sa_setRowStatus.mock.resetCalls();
    renderTable();
    const header = screen.getByRole("banner");

    const chip = within(header).getByRole("button", { name: "Open" });
    await u.hover(chip);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Set session status");
    await u.click(chip);
    // Open leads to Suspended or Done, as the workflow has it.
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Suspended", "Done"]);
    await choose(u, items[0]);

    const ask = await screen.findByRole("dialog", { name: "Suspend this session?" });
    expect(ask).toHaveTextContent("The table stays open");
    expect(sa_setRowStatus.mock.callCount()).toBe(0);
    await u.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Suspend this session?" }),
      ).not.toBeInTheDocument(),
    );
    expect(sa_setRowStatus.mock.callCount()).toBe(0);

    // Paused, the table stays where it is, and the chip offers the resume.
    await u.click(chip);
    await choose(u, await screen.findByRole("menuitem", { name: "Suspended" }));
    const pause = await screen.findByRole("dialog", { name: "Suspend this session?" });
    await u.click(within(pause).getByRole("button", { name: "Suspend session" }));
    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(1));
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["story_sessions", -30, "SUSPENDED"]);
    const paused = await within(header).findByRole("button", { name: "Suspended" });
    expect(screen.getByTestId("session-suspended-overlay")).toHaveTextContent("SUSPENDED");
    expect(push.mock.callCount()).toBe(0);
    expect(screen.getByRole("region", { name: "Play space" })).toBeInTheDocument();
    await u.click(paused);
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "Resumed",
      "Done",
    ]);
    await choose(u, await screen.findByRole("menuitem", { name: "Resumed" }));
    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(2));
    expect(push.mock.callCount()).toBe(0);
    const resumed = await within(header).findByRole("button", { name: "Resumed" });
    // Resuming lifts the overlay.
    expect(screen.queryByTestId("session-suspended-overlay")).not.toBeInTheDocument();

    await u.click(resumed);
    await choose(u, await screen.findByRole("menuitem", { name: "Done" }));
    const end = await screen.findByRole("dialog", { name: "End this session?" });
    await u.click(within(end).getByRole("button", { name: "End session" }));
    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(3));
    expect(sa_setRowStatus.mock.calls[2].arguments).toEqual(["story_sessions", -30, "DONE"]);
    await waitFor(() => expect(push.mock.calls[0]?.arguments).toEqual(["/stories/-4"]));
  });

  it("opens on a paused session with its chip to resume from, and says it is paused", async () => {
    renderTable({}, { ...kildealg, status: "SUSPENDED" });

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: "Suspended" })).toBeInTheDocument();
    expect(await screen.findByText("This session is suspended.")).toBeInTheDocument();
    expect(screen.getByTestId("session-suspended-overlay")).toHaveTextContent("SUSPENDED");
    expect(screen.queryByText("There is no active session.")).not.toBeInTheDocument();
  });

  it("tells the storyteller when no session is being played", async () => {
    renderTable({}, null);

    const header = screen.getByRole("banner");
    expect(within(header).getByTitle("No active session")).toHaveTextContent("None");
    expect(within(header).queryByText("Open")).not.toBeInTheDocument();
    // The selector still opens, for Create new scene; its own test covers
    // that the listed scenes cannot be chosen with no session.
    expect(within(header).getByRole("button", { name: "Scene: None" })).toBeEnabled();
    expect(await screen.findByText("There is no active session.")).toBeInTheDocument();
  });
});
