import { EventEmitter } from "node:events";
import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PublicChat } from "@/lib/realtime/chat-events";
import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import { EMPTY_PLAY_SCENE, type PlayScene } from "@/lib/play-scene";
import type { StorySession } from "@/lib/stories";
import type { StoryEvent } from "@/lib/realtime/events";
import type { SetElementNotesResult, UntapSceneElementResult } from "@/app/(app)/play/[id]/actions";

// A storyteller (-2), so the diagnostics toggle is offered; the player test
// overrides the type.
const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -2,
  isAnonymous: false,
};

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

// A stand-in for mqtt.js's client: an emitter the tests push broker events
// through, with the two methods the hook calls.
class FakeClient extends EventEmitter {
  subscribe = mock.fn((_topic: string, _opts: unknown, cb?: (err: Error | null) => void) =>
    cb?.(null),
  );
  end = mock.fn();
}
let client: FakeClient;
const connect = mock.fn((_url: string, _options: unknown) => (client = new FakeClient()));

const channel = {
  url: "wss://broker.example.test:8084/mqtt",
  username: "player",
  password: "pw",
  topic: "story/7/state",
  chatTopic: "story/7/chat",
};
const sa_getStoryChannel = mock.fn(async (_idStory: number) => channel as typeof channel | null);
const sa_getPlayScene = mock.fn(async (_idStory: number) => null as PlayScene | null);
const sa_setPlaySceneText = mock.fn(
  async (_story: number, _scene: number, values: { description: string; notes: string }) => ({
    ok: true as const,
    text: { description: values.description || null, notes: values.notes || null },
  }),
);
const sa_untapPlaySceneElement = mock.fn(
  async (_story: number, _scene: number, _element: number): Promise<UntapSceneElementResult> => ({
    ok: true,
    status: "READY",
  }),
);
const sa_listChats = mock.fn(async (_idStory: number, _before?: number) => ({
  chats: [] as PublicChat[],
  hasPrevious: false,
  atTable: 3,
}));
const sa_setPlayElementNotes = mock.fn(
  async (_story: number, _element: number, notes: string): Promise<SetElementNotesResult> => ({
    ok: true,
    notes: notes.trim() || null,
  }),
);

const zed = {
  element: {
    idElement: 5,
    idStory: 7,
    kind: "PERSON",
    status: "READY",
    initialName: "A hooded figure",
    name: "Zed",
    title: "Harbourmaster",
    description: null,
    notes: null,
    imageUrl: null,
    url: null,
    urlText: null,
    tags: [],
    pendingAt: null,
    readyAt: null,
    inactiveAt: null,
    createdAt: "2026-10-13T10:00:00.000Z",
    updatedAt: "2026-10-13T10:00:00.000Z",
  },
  sceneElement: {
    idSceneElement: 11,
    idStoryScene: 3,
    idElement: 5,
    status: "READY",
    tags: ["scene"],
    elementShowing: "initial_name",
    showInfo: true,
    url: null,
    urlText: null,
    readyAt: null,
    invisibleAt: null,
    tappedAt: null,
    disabledAt: null,
    createdAt: "2026-10-13T10:00:00.000Z",
    updatedAt: "2026-10-13T10:00:00.000Z",
  },
};

const scene: PlayScene = {
  idStorySession: 2,
  scene: {
    idStoryScene: 3,
    title: "The docks",
    status: "ACTIVE",
    text: { description: "Fog on the water.", notes: null },
  },
  tags: ["scene", "elements"],
  coverUrl: null,
  items: [zed],
};

// Static imports are hoisted, so the module under test can only be loaded
// after the mocks are registered — hence the dynamic import in `before`.
let PlayTable: typeof import("./play-table").PlayTable;

// jsdom lays nothing out, so a line never overflows on its own: the widths
// are stubbed so that only a title longer than the pill is wider than its
// box. Restored after each use.
function withOverflowingTitle(run: () => Promise<void>) {
  const scroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollWidth")!;
  const client = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth")!;
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get: () => 100 });
  Object.defineProperty(Element.prototype, "scrollWidth", {
    configurable: true,
    get(this: Element) {
      return (this.textContent?.length ?? 0) > 30 ? 400 : 50;
    },
  });
  return run().finally(() => {
    Object.defineProperty(Element.prototype, "scrollWidth", scroll);
    Object.defineProperty(Element.prototype, "clientWidth", client);
  });
}

type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

// The table reads the user and the preference map from the providers
// (app)/layout.tsx mounts, as the menu bar does.
// The story's sessions, for the list in the box the play space shows on no
// scene.
const storySessions: StorySession[] = [
  {
    idStorySession: 2,
    number: 3,
    title: "Kildealg",
    status: "OPEN",
    startedAt: new Date("2026-10-20T19:00:00Z"),
    length: null,
    playerCount: 2,
  },
];

// Both panels open, for the tests about what is in them.
const OPEN = { "play.showChat": true, "play.showCharacter": true };

function renderTable(
  preferences: Record<string, boolean | string> = {},
  session: string | null = "3. Kildealg",
  who: CurrentUser = user,
  initialScene: PlayScene = scene,
  storyCoverUrl: string | null = null,
) {
  return renderWithProviders(
    <UserProvider user={who}>
      <UserPreferencesProvider preferences={preferences}>
        <PlayTable
          idStory={7}
          title="Psychoneira"
          session={session}
          initialScene={initialScene}
          storyCoverUrl={storyCoverUrl}
          sessions={storySessions}
        />
        <Toaster />
      </UserPreferencesProvider>
    </UserProvider>,
  );
}

/** Pushes a message through the fake client as the broker would. */
async function deliver(event: StoryEvent | Record<string, unknown>) {
  await act(async () => {
    client.emit("message", "story/7/state", new TextEncoder().encode(JSON.stringify(event)));
  });
}

async function connected() {
  await waitFor(() => expect(connect.mock.calls.length).toBeGreaterThan(0));
  await act(async () => {
    client.emit("connect");
  });
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
    mock.module("@/components/elements/actions", {
      namedExports: { sa_listElementHistory: mock.fn(async () => ({ rows: [], hasMore: false })) },
    });
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: {
        sa_getStoryChannel,
        sa_getPlayScene,
        sa_setPlaySceneText,
        sa_setPlayElementNotes,
        sa_untapPlaySceneElement,
        sa_listChats,
        // The line as the action saves it: the server names the sender.
        sa_postChat: mock.fn(async (_story: number, text: string) => ({
          ok: true,
          chat: {
            idChat: 1,
            idStoryScene: 3,
            idUser: user.id,
            from: "Paul Stafford",
            text,
            isSystem: false,
            isEdited: false,
            createdAt: new Date().toISOString(),
          },
        })),
        sa_editChat: mock.fn(),
        sa_deleteChat: mock.fn(),
      },
    });
    mock.module("mqtt", { defaultExport: { connect } });

    ({ PlayTable } = await import("./play-table"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    sa_setUserPreference.mock.resetCalls();
    sa_getStoryChannel.mock.resetCalls();
    sa_getStoryChannel.mock.mockImplementation(async () => channel);
    sa_getPlayScene.mock.resetCalls();
    sa_getPlayScene.mock.mockImplementation(async () => null);
    connect.mock.resetCalls();
    sa_untapPlaySceneElement.mock.resetCalls();
    sa_listChats.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  it("goes to the display table from the middle of the header", () => {
    renderTable();

    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "Display mode" })).toHaveAttribute(
      "href",
      "/table/7",
    );
  });

  it("shows the story's cover behind the play space while the scene has none of its own", () => {
    const { unmount } = renderTable({}, "3. Kildealg", user, scene, "https://x.test/story.png");
    expect(screen.getByTestId("play-space-cover")).toHaveStyle({
      backgroundImage: 'url("https://x.test/story.png")',
    });
    unmount();

    renderTable(
      {},
      "3. Kildealg",
      user,
      { ...scene, coverUrl: "https://x.test/docks.png" },
      "https://x.test/story.png",
    );
    expect(screen.getByTestId("play-space-cover")).toHaveStyle({
      backgroundImage: 'url("https://x.test/docks.png")',
    });
  });

  it("shows the story's cover when the session is on no scene", () => {
    renderTable({}, "3. Kildealg", user, EMPTY_PLAY_SCENE, "https://x.test/story.png");
    expect(screen.getByTestId("play-space-cover")).toHaveStyle({
      backgroundImage: 'url("https://x.test/story.png")',
    });
  });

  it("with no scene, shows the story's box with its sessions folded away and nothing to manage", async () => {
    const actor = userEvent.setup();
    // A session on no scene yet.
    renderTable({}, "3. Kildealg", user, { ...EMPTY_PLAY_SCENE, idStorySession: 2 });
    const space = screen.getByRole("region", { name: "Play space" });
    expect(within(space).queryByText(/has not chosen a scene/)).not.toBeInTheDocument();

    const box = screen.getByTestId("story-playing-box");
    expect(within(box).getByRole("heading", { name: "Playing Psychoneira" })).toBeInTheDocument();
    const sessions = within(box).getByRole("region", { name: "Sessions" });
    expect(within(sessions).getByText("3. Kildealg")).not.toBeVisible();
    await actor.click(within(sessions).getByRole("button", { name: "Show sessions" }));
    expect(within(sessions).getByText("3. Kildealg")).toBeVisible();
    // Only the story's owner manages its sessions, and the owner is at /run.
    expect(within(sessions).queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
    expect(within(sessions).queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
  });

  it("shows no story box while the table is on a scene", () => {
    renderTable();
    expect(screen.queryByTestId("story-playing-box")).not.toBeInTheDocument();
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

  it("shows the scene's elements in their stacks, as the page loaded them", () => {
    renderTable();
    const space = screen.getByRole("region", { name: "Play space" });

    expect(within(space).getByRole("heading", { name: "The docks" })).toBeInTheDocument();
    const stack = within(space).getByRole("region", { name: "scene" });
    expect(within(stack).getByText("A hooded figure")).toBeInTheDocument();
    expect(within(stack).getByText("Harbourmaster")).toBeInTheDocument();
    const elements = within(space).getByRole("region", { name: "elements" });
    expect(within(elements).getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("offers an element's link from its pill, the scene's own first, before the info button", async () => {
    const u = userEvent.setup();
    renderTable({}, "3. Kildealg", user, {
      ...scene,
      items: [
        {
          element: { ...zed.element, url: "https://example.com/zed", urlText: "Zed's ledger" },
          sceneElement: {
            ...zed.sceneElement,
            showInfo: true,
            url: "https://example.com/docks",
            urlText: null,
          },
        },
        {
          element: {
            ...zed.element,
            idElement: 6,
            name: "Abbot",
            initialName: null,
            url: "not a web address",
            urlText: "Nowhere",
          },
          sceneElement: { ...zed.sceneElement, idSceneElement: 12, idElement: 6, url: null },
        },
        {
          element: {
            ...zed.element,
            idElement: 7,
            name: "Nain",
            initialName: null,
            url: "https://example.com/nain",
            urlText: "Nain's book",
          },
          sceneElement: {
            ...zed.sceneElement,
            idSceneElement: 13,
            idElement: 7,
            showInfo: false,
            url: "https://example.com/nain-here",
          },
        },
      ],
    });

    // The scene's own address, with the address itself as the tooltip since
    // it has no words; before the info button.
    const link = screen.getByRole("link", {
      name: "Link for A hooded figure: https://example.com/docks",
    });
    expect(link).toHaveAttribute("href", "https://example.com/docks");
    expect(link).toHaveAttribute("target", "_blank");
    const info = screen.getByRole("button", { name: "About A hooded figure" });
    expect(link.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await u.hover(link);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("https://example.com/docks");

    // An element whose address is not a web address offers no link; nor
    // does one whose info the storyteller keeps back, whatever its address.
    expect(screen.queryByRole("link", { name: /^Link for Abbot/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nain")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Link for Nain/ })).not.toBeInTheDocument();
  });

  it("gives a title that overflows the pill a tooltip of the whole of it", async () => {
    const long = "Harbourmaster of the whole eastern shore and keeper of the lantern";
    await withOverflowingTitle(async () => {
      const u = userEvent.setup();
      renderTable({}, "3. Kildealg", user, {
        ...scene,
        items: [{ ...zed, element: { ...zed.element, title: long } }],
      });
      await u.hover(screen.getByText(long));
      expect(await screen.findByRole("tooltip")).toHaveTextContent(long);
    });
  });

  it("says when nothing is being played", () => {
    renderTable({}, null, user, {
      idStorySession: null,
      scene: null,
      tags: [],
      coverUrl: null,
      items: [],
    });
    expect(screen.getByText("No session is being played.")).toBeInTheDocument();
  });

  it("subscribes to the story's topic and reloads the scene on connecting", async () => {
    sa_getPlayScene.mock.mockImplementation(async () => ({
      ...scene,
      items: [
        zed,
        {
          element: { ...zed.element, idElement: 6, name: "Abbot", initialName: null, title: null },
          sceneElement: { ...zed.sceneElement, idSceneElement: 12, idElement: 6 },
        },
      ],
    }));
    renderTable();
    await connected();

    expect(connect.mock.calls[0].arguments[0]).toBe(channel.url);
    expect(client.subscribe.mock.calls[0].arguments[0]).toEqual(["story/7/state", "story/7/chat"]);
    expect(sa_getPlayScene.mock.calls).toHaveLength(1);
    await screen.findByText("Abbot");
  });

  it("counts chat lines that come in while the chat is closed, and opens on them", async () => {
    const u = userEvent.setup();
    renderTable();
    await connected();
    await waitFor(() => expect(sa_listChats.mock.callCount()).toBeGreaterThan(0));
    const said = (idChat: number, idUser: string) => ({
      v: 1,
      at: "2026-10-26T20:05:00.000Z",
      idStory: 7,
      type: "chat.posted",
      chat: {
        idChat,
        idStoryScene: 3,
        idUser,
        from: "Harry",
        text: `Line ${idChat}`,
        isSystem: false,
        isEdited: false,
        createdAt: "2026-10-26T20:05:00.000Z",
        color: null,
        picture: null,
        roll: null,
      },
    });

    await act(async () => {
      for (const event of [
        said(1, "someone-else"),
        said(2, "someone-else"),
        said(2, "someone-else"),
      ])
        client.emit("message", "story/7/chat", new TextEncoder().encode(JSON.stringify(event)));
      // The viewer's own line is not news to them.
      client.emit(
        "message",
        "story/7/chat",
        new TextEncoder().encode(JSON.stringify(said(3, user.id))),
      );
    });
    const banner = screen.getByRole("banner");
    await u.click(within(banner).getByRole("button", { name: "Chat, 2 new" }));

    const chat = await screen.findByRole("region", { name: "Table Chat" });
    expect(within(chat).getByText("Line 1")).toBeInTheDocument();
    expect(within(chat).getAllByText("Line 2")).toHaveLength(1);
    expect(within(banner).getByRole("button", { name: "Chat" })).toBeInTheDocument();
  });

  it("draws the chat as an overlay: a box in the corner, and each new line over the table", async () => {
    const u = userEvent.setup();
    renderTable({ "play.showChat": true });
    await connected();
    await waitFor(() => expect(sa_listChats.mock.callCount()).toBeGreaterThan(0));

    // The panel's picker moves the chat out of the panel and remembers it.
    const panel = screen.getByRole("region", { name: "Table Chat" });
    await u.click(within(panel).getByRole("button", { name: "Overlay chat" }));
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "chat.layout",
      value: "overlay",
    });
    expect(screen.queryByRole("heading", { name: "Table Chat" })).not.toBeInTheDocument();
    const box = screen.getByRole("region", { name: "Table Chat" });
    expect(within(box).getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Overlay chat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await act(async () => {
      client.emit(
        "message",
        "story/7/chat",
        new TextEncoder().encode(
          JSON.stringify({
            v: 1,
            at: "2026-10-26T20:05:00.000Z",
            idStory: 7,
            type: "chat.posted",
            chat: {
              idChat: 41,
              idStoryScene: 3,
              idUser: "someone-else",
              from: "Harry",
              text: "Over the table.",
              isSystem: false,
              isEdited: false,
              createdAt: "2026-10-26T20:05:00.000Z",
              color: null,
              picture: null,
              roll: null,
            },
          }),
        ),
      );
    });
    expect(await screen.findByText("Over the table.")).toBeInTheDocument();
    expect(within(box).queryByText("Over the table.")).not.toBeInTheDocument();
  });

  it("adds, changes and removes elements as messages arrive", async () => {
    renderTable();
    await connected();
    const base = { v: 1 as const, at: "2026-10-13T10:01:00.000Z", idStory: 7 };

    await deliver({
      ...base,
      type: "scene_element.upserted",
      element: {
        ...zed.element,
        idElement: 6,
        name: "Lantern",
        kind: "THING",
        initialName: null,
        title: null,
      },
      sceneElement: { ...zed.sceneElement, idSceneElement: 12, idElement: 6, tags: ["elements"] },
    });
    const elements = screen.getByRole("region", { name: "elements" });
    expect(within(elements).getByText("Lantern")).toBeInTheDocument();

    await deliver({
      ...base,
      type: "scene_element.upserted",
      element: { ...zed.element, updatedAt: "2026-10-13T10:02:00.000Z" },
      sceneElement: { ...zed.sceneElement, status: "DISABLED", elementShowing: "name" },
    });
    const disabled = screen.getByText("Zed").closest("[data-scene-status]") as HTMLElement;
    expect(disabled).toHaveAttribute("data-scene-status", "DISABLED");
    // Stepped back: see-through, with its text dimmed.
    expect(disabled).toHaveStyle({ opacity: "0.7" });
    // Switched off: a ban leads the pill, and says so on hover.
    const ban = within(disabled).getByRole("img", { name: "Currently disabled" });
    expect(disabled.firstElementChild).toContainElement(ban);
    const u = userEvent.setup();
    await u.hover(ban);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Currently disabled");
    await u.unhover(ban);

    await deliver({
      ...base,
      type: "scene_element.removed",
      idStoryScene: 3,
      idElement: 5,
      idSceneElement: 11,
    });
    expect(screen.queryByText("Zed")).not.toBeInTheDocument();
  });

  it("marks a tapped element, and shows its description only while the storyteller allows", async () => {
    renderTable();
    await connected();
    const base = { v: 1 as const, at: "2026-10-13T10:01:00.000Z", idStory: 7 };

    await deliver({
      ...base,
      type: "scene_element.upserted",
      element: {
        ...zed.element,
        description: "Keeps the docks.",
        updatedAt: "2026-10-13T10:02:00.000Z",
      },
      sceneElement: {
        ...zed.sceneElement,
        status: "TAPPED",
        elementShowing: "name",
        showInfo: true,
        updatedAt: "2026-10-13T10:02:00.000Z",
      },
    });
    const pill = screen.getByText("Zed").closest("[data-scene-status]") as HTMLElement;
    expect(pill).toHaveAttribute("data-scene-status", "TAPPED");
    expect(pill).toHaveStyle({ opacity: "0.7" });
    // With its info showing, the marker is the untap button, at the start.
    expect(within(pill).getByRole("button", { name: "Tapped: untap Zed" })).toBeInTheDocument();
    expect(within(pill).queryByRole("img", { name: "Currently disabled" })).toBeNull();
    // The whole pill says so on hover too.
    const hover = userEvent.setup();
    await hover.hover(pill);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Tapped");
    await hover.unhover(pill);
    // With its info on: the title under the name, and the description
    // behind the info button, in a popover.
    expect(within(pill).getByText("Harbourmaster")).toBeInTheDocument();
    const u = userEvent.setup();
    await u.click(within(pill).getByRole("button", { name: "About Zed" }));
    const popover = await screen.findByRole("dialog", { name: "Zed" });
    expect(within(popover).getByText("Harbourmaster")).toBeInTheDocument();
    expect(within(popover).getByText("Keeps the docks.")).toBeInTheDocument();
    // The element's history is the storyteller's and the preview's, not the table's.
    expect(within(popover).queryByRole("button", { name: "History" })).toBeNull();
    await u.keyboard("{Escape}");

    // Readied, with its info taken back: the marker, the title and the info
    // button go, and the pill is the name alone.
    await deliver({
      ...base,
      type: "scene_element.upserted",
      element: {
        ...zed.element,
        description: "Keeps the docks.",
        updatedAt: "2026-10-13T10:03:00.000Z",
      },
      sceneElement: {
        ...zed.sceneElement,
        status: "READY",
        elementShowing: "name",
        showInfo: false,
        updatedAt: "2026-10-13T10:03:00.000Z",
      },
    });
    expect(screen.queryByText("Keeps the docks.")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Tapped" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "About Zed" })).not.toBeInTheDocument();
    expect(within(pill).queryByText("Harbourmaster")).not.toBeInTheDocument();
  });

  // Zed with a picture, and the storyteller's pulses about it.
  const picturedZed = {
    ...zed,
    element: { ...zed.element, imageUrl: "https://x.test/zed.png" },
  };
  const pulse = (action: string, idElement = 5, idStoryScene = 3) => ({
    v: 1 as const,
    at: "2026-10-13T10:01:00.000Z",
    idStory: 7,
    type: "scene_element.custom" as const,
    idStoryScene,
    idElement,
    custom: { action },
  });

  it("opens an element's picture full size on the storyteller's pulse, and closes it on the next", async () => {
    renderTable({}, "3. Kildealg", user, { ...scene, items: [picturedZed] });
    await connected();
    expect(screen.queryByRole("dialog", { name: "A hooded figure" })).not.toBeInTheDocument();

    await deliver(pulse("preview.open"));
    // The same preview the thumbnail opens.
    const preview = await screen.findByRole("dialog", { name: "A hooded figure" });
    expect(within(preview).getByRole("img", { name: "A hooded figure" })).toHaveAttribute(
      "src",
      "https://x.test/zed.png",
    );

    await deliver(pulse("preview.close"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "A hooded figure" })).not.toBeInTheDocument(),
    );
  });

  it("lets a player close the picture for themselves until the storyteller puts it up again", async () => {
    const u = userEvent.setup();
    renderTable({}, "3. Kildealg", user, { ...scene, items: [picturedZed] });
    await connected();
    await deliver(pulse("preview.open"));
    const preview = await screen.findByRole("dialog", { name: "A hooded figure" });

    await u.click(within(preview).getByRole("button", { name: "Close preview" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "A hooded figure" })).not.toBeInTheDocument(),
    );
    // The element changing in some other way does not bring it back.
    await deliver({
      v: 1 as const,
      at: "2026-10-13T10:02:00.000Z",
      idStory: 7,
      type: "scene_element.upserted",
      element: { ...picturedZed.element, updatedAt: "2026-10-13T10:02:00.000Z" },
      sceneElement: { ...picturedZed.sceneElement, updatedAt: "2026-10-13T10:02:00.000Z" },
    });
    expect(screen.queryByRole("dialog", { name: "A hooded figure" })).not.toBeInTheDocument();

    await deliver(pulse("preview.open"));
    expect(await screen.findByRole("dialog", { name: "A hooded figure" })).toBeInTheDocument();
  });

  it("swaps the picture when another element's goes up, and ignores pulses it cannot answer", async () => {
    const abbot = {
      element: {
        ...zed.element,
        idElement: 6,
        name: "Abbot",
        initialName: null,
        imageUrl: "https://x.test/abbot.png",
      },
      sceneElement: { ...zed.sceneElement, idSceneElement: 12, idElement: 6 },
    };
    renderTable({}, "3. Kildealg", user, { ...scene, items: [picturedZed, abbot] });
    await connected();

    await deliver(pulse("preview.open"));
    await screen.findByRole("dialog", { name: "A hooded figure" });
    await deliver(pulse("preview.open", 6));
    const preview = await screen.findByRole("dialog", { name: "Abbot" });
    expect(within(preview).getByRole("img", { name: "Abbot" })).toHaveAttribute(
      "src",
      "https://x.test/abbot.png",
    );
    expect(screen.queryByRole("dialog", { name: "A hooded figure" })).not.toBeInTheDocument();

    // Another scene's pulse, an unknown action, and an element with no
    // picture change nothing.
    await deliver(pulse("preview.close", 6, 4));
    await deliver(pulse("dice.roll", 6));
    expect(screen.getByRole("dialog", { name: "Abbot" })).toBeInTheDocument();
    await deliver(pulse("preview.close", 6));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await deliver(pulse("preview.open", 99));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the scene's text from an info button beside its title, not a chevron", () => {
    renderTable();
    const button = screen.getByRole("button", { name: "Describe The docks" });
    expect(button.querySelector("svg.lucide-info")).not.toBeNull();
    expect(button.querySelector("svg.lucide-chevron-down")).toBeNull();
  });

  it("lets a player write up the scene from the chevron beside its title", async () => {
    const u = userEvent.setup();
    sa_setPlaySceneText.mock.resetCalls();
    renderTable();

    await u.click(screen.getByRole("button", { name: "Describe The docks" }));
    const panel = await screen.findByRole("dialog", { name: "The docks" });
    const description = within(panel).getByRole("textbox", { name: "Description" });
    expect(description).toHaveValue("Fog on the water.");
    await u.clear(description);
    await u.type(description, "Fog, and a drowned man on the ferry.");
    await u.type(within(panel).getByRole("textbox", { name: "Notes" }), "Ask about the mist.");
    await u.click(within(panel).getByRole("button", { name: "Save scene" }));

    await waitFor(() => expect(sa_setPlaySceneText.mock.callCount()).toBe(1));
    expect(sa_setPlaySceneText.mock.calls[0].arguments).toEqual([
      7,
      3,
      { description: "Fog, and a drowned man on the ferry.", notes: "Ask about the mist." },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "The docks" })).toBeNull());
    // The table keeps what was saved, without waiting on the topic.
    await u.click(screen.getByRole("button", { name: "Describe The docks" }));
    expect(
      within(await screen.findByRole("dialog", { name: "The docks" })).getByRole("textbox", {
        name: "Notes",
      }),
    ).toHaveValue("Ask about the mist.");
  });

  it("leads a tapped pill with its marker, which with the info showing asks and untaps the card", async () => {
    const u = userEvent.setup();
    const tapped = (showInfo: boolean): PlayScene => ({
      ...scene,
      items: [{ ...zed, sceneElement: { ...zed.sceneElement, status: "TAPPED", showInfo } }],
    });

    // Info off: the marker alone, at the start, and nothing to press.
    const quiet = renderTable({}, "3. Kildealg", user, tapped(false));
    let pill = screen.getByText("A hooded figure").closest("[data-scene-status]") as HTMLElement;
    const marker = within(pill).getByRole("img", { name: "Tapped" });
    expect(pill.firstElementChild).toContainElement(marker);
    expect(within(pill).queryByRole("button", { name: /untap/ })).toBeNull();
    quiet.unmount();

    renderTable({}, "3. Kildealg", user, tapped(true));
    pill = screen.getByText("A hooded figure").closest("[data-scene-status]") as HTMLElement;
    const untap = within(pill).getByRole("button", { name: "Tapped: untap A hooded figure" });
    expect(pill.firstElementChild).toContainElement(untap);
    await u.hover(untap);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Tapped: press to untap");
    await u.click(untap);
    const ask = await screen.findByRole("dialog", { name: "Untap A hooded figure?" });
    // Cancel leaves it tapped and says nothing.
    await u.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sa_untapPlaySceneElement.mock.callCount()).toBe(0);

    await u.click(untap);
    await u.click(
      within(await screen.findByRole("dialog", { name: "Untap A hooded figure?" })).getByRole(
        "button",
        { name: "Untap" },
      ),
    );
    await waitFor(() => expect(sa_untapPlaySceneElement.mock.callCount()).toBe(1));
    expect(sa_untapPlaySceneElement.mock.calls[0].arguments).toEqual([7, 3, 5]);
    // Ready again and the marker gone; the action itself tells the chat who
    // did it. The pill is drawn afresh without its tooltip, so it is found
    // again.
    const readied = () =>
      screen.getByText("A hooded figure").closest("[data-scene-status]") as HTMLElement;
    await waitFor(() => expect(readied()).toHaveAttribute("data-scene-status", "READY"));
    // In play again, it stands out as the others do.
    expect(readied()).not.toHaveStyle({ opacity: "0.7" });
    expect(within(readied()).queryByRole("button", { name: /untap/ })).toBeNull();
    expect(within(readied()).queryByRole("img", { name: "Tapped" })).toBeNull();
  });

  it("stays tapped and says why when the untap is refused", async () => {
    const u = userEvent.setup();
    sa_untapPlaySceneElement.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That element is not tapped.",
    }));
    renderTable({}, "3. Kildealg", user, {
      ...scene,
      items: [{ ...zed, sceneElement: { ...zed.sceneElement, status: "TAPPED", showInfo: true } }],
    });
    const pill = screen.getByText("A hooded figure").closest("[data-scene-status]") as HTMLElement;

    await u.click(within(pill).getByRole("button", { name: "Tapped: untap A hooded figure" }));
    await u.click(
      within(await screen.findByRole("dialog", { name: "Untap A hooded figure?" })).getByRole(
        "button",
        { name: "Untap" },
      ),
    );
    expect(await screen.findByText("That element is not tapped.")).toBeInTheDocument();
    expect(screen.getByText("A hooded figure").closest("[data-scene-status]")).toHaveAttribute(
      "data-scene-status",
      "TAPPED",
    );
  });

  it("lets a player keep notes on an element from its info popover", async () => {
    const u = userEvent.setup();
    sa_setPlayElementNotes.mock.resetCalls();
    renderTable();

    const pill = screen.getByText("A hooded figure").closest("[data-scene-status]") as HTMLElement;
    await u.click(within(pill).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("dialog", { name: "A hooded figure" });
    // The popover takes focus a moment after it opens; typing before then
    // loses what is typed to it.
    await waitFor(() => expect(popover).toHaveFocus());
    const notes = within(popover).getByRole("textbox", { name: "Notes" });
    expect(notes).toHaveValue("");
    // Nothing to save until the notes differ from what is held.
    const save = within(popover).getByRole("button", { name: "Save notes" });
    expect(save).toBeDisabled();
    await u.type(notes, "Owes the harbourmaster.");
    expect(save).toBeEnabled();
    await u.click(save);

    await waitFor(() => expect(sa_setPlayElementNotes.mock.callCount()).toBe(1));
    expect(sa_setPlayElementNotes.mock.calls[0].arguments).toEqual([
      7,
      5,
      "Owes the harbourmaster.",
    ]);
    await waitFor(() => expect(save).toBeDisabled());
    await u.keyboard("{Escape}");

    // The table keeps what was saved, without waiting on the topic.
    await u.click(within(pill).getByRole("button", { name: "About A hooded figure" }));
    expect(
      within(await screen.findByRole("dialog", { name: "A hooded figure" })).getByRole("textbox", {
        name: "Notes",
      }),
    ).toHaveValue("Owes the harbourmaster.");
  });

  it("keeps the notes and says why when saving them is refused", async () => {
    const u = userEvent.setup();
    sa_setPlayElementNotes.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "Keep the notes under 8000 characters.",
    }));
    renderTable();

    const pill = screen.getByText("A hooded figure").closest("[data-scene-status]") as HTMLElement;
    await u.click(within(pill).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("dialog", { name: "A hooded figure" });
    // The popover takes focus a moment after it opens; typing before then
    // loses what is typed to it.
    await waitFor(() => expect(popover).toHaveFocus());
    const notes = within(popover).getByRole("textbox", { name: "Notes" });
    await u.type(notes, "Too long, in principle.");
    await u.click(within(popover).getByRole("button", { name: "Save notes" }));

    expect(
      await within(popover).findByText("Keep the notes under 8000 characters."),
    ).toBeInTheDocument();
    expect(notes).toHaveValue("Too long, in principle.");
    expect(notes).toBeInvalid();
    expect(within(popover).getByRole("button", { name: "Save notes" })).toBeEnabled();
  });

  it("reloads the scene when the table moves to another", async () => {
    sa_getPlayScene.mock.mockImplementation(async () => ({
      ...scene,
      scene: {
        idStoryScene: 4,
        title: "The abbey",
        status: "ACTIVE",
        text: { description: null, notes: null },
      },
      items: [],
    }));
    renderTable();
    await connected();
    sa_getPlayScene.mock.resetCalls();

    await deliver({
      v: 1,
      at: "2026-10-13T10:01:00.000Z",
      idStory: 7,
      type: "scene.changed",
      idStoryScene: 4,
    });

    expect(sa_getPlayScene.mock.calls).toHaveLength(1);
    await screen.findByRole("heading", { name: "The abbey" });
  });

  it("puts the play space away behind its eye to show the cover, and brings it back", async () => {
    const u = userEvent.setup();
    renderTable(
      {},
      "3. Kildealg",
      user,
      { ...scene, scene: { ...scene.scene!, status: "PENDING" } },
      "https://x.test/story.png",
    );
    const space = screen.getByRole("region", { name: "Play space" });
    const eye = within(space).getByRole("button", { name: "Show background" });
    expect(eye).toHaveAttribute("aria-pressed", "false");

    await u.click(eye);
    expect(eye).toHaveAttribute("aria-pressed", "true");
    expect(within(space).queryByRole("heading", { name: "The docks" })).toBeNull();
    expect(within(space).queryByTestId("scene-pending-overlay")).toBeNull();
    expect(screen.getByTestId("play-space-cover")).toBeInTheDocument();

    await u.click(eye);
    expect(eye).toHaveAttribute("aria-pressed", "false");
    expect(within(space).getByRole("heading", { name: "The docks" })).toBeInTheDocument();
    expect(within(space).getByTestId("scene-pending-overlay")).toBeInTheDocument();
  });

  it("asks the players to stand by over a pending scene", () => {
    renderTable({}, "3. Kildealg", user, {
      ...scene,
      scene: { ...scene.scene!, status: "PENDING" },
    });
    const space = screen.getByRole("region", { name: "Play space" });

    const overlay = within(space).getByTestId("scene-pending-overlay");
    expect(overlay).toHaveTextContent("PENDING");
    expect(overlay).toHaveTextContent("Please Stand By");
    // The scene is still there under it, as the storyteller's table keeps it.
    expect(within(space).getByRole("heading", { name: "The docks" })).toBeInTheDocument();
  });

  it("puts the overlay up when the storyteller sets the scene pending, and takes it down when it is active again", async () => {
    renderTable();
    await connected();
    expect(screen.queryByTestId("scene-pending-overlay")).not.toBeInTheDocument();

    // The storyteller's status change comes over the topic as a change of
    // scene, so the table reads the scene afresh and finds it pending.
    sa_getPlayScene.mock.mockImplementation(async () => ({
      ...scene,
      scene: { ...scene.scene!, status: "PENDING" },
    }));
    await deliver({
      v: 1,
      at: "2026-10-13T10:01:00.000Z",
      idStory: 7,
      type: "scene.changed",
      idStoryScene: 3,
    });
    expect(await screen.findByTestId("scene-pending-overlay")).toHaveTextContent("Please Stand By");

    sa_getPlayScene.mock.mockImplementation(async () => scene);
    await deliver({
      v: 1,
      at: "2026-10-13T10:02:00.000Z",
      idStory: 7,
      type: "scene.changed",
      idStoryScene: 3,
    });
    await waitFor(() =>
      expect(screen.queryByTestId("scene-pending-overlay")).not.toBeInTheDocument(),
    );
  });

  for (const status of ["PENDING", "COMPLETE"]) {
    it(`lets a player read the pills and the scene's text in a ${status.toLowerCase()} scene, without writing`, async () => {
      const u = userEvent.setup();
      renderTable({}, "3. Kildealg", user, {
        ...scene,
        scene: { ...scene.scene!, status },
        items: [
          {
            element: { ...zed.element, description: "Keeps the docks.", notes: "Owes us." },
            sceneElement: { ...zed.sceneElement, status: "TAPPED" },
          },
        ],
      });
      const space = screen.getByRole("region", { name: "Play space" });
      const overlay = within(space).getByTestId(`scene-${status.toLowerCase()}-overlay`);
      // The overlay says so without taking the pointer from what is under it.
      expect(overlay).toHaveStyle({ pointerEvents: "none" });

      // The pill's info opens to read; the tapped marker is not a button here.
      const pill = within(space).getByText("A hooded figure").closest("[data-scene-status]")!;
      expect(within(pill as HTMLElement).getByRole("img", { name: "Tapped" })).toBeInTheDocument();
      expect(within(pill as HTMLElement).queryByRole("button", { name: /untap/ })).toBeNull();
      await u.click(
        within(pill as HTMLElement).getByRole("button", { name: "About A hooded figure" }),
      );
      const info = await screen.findByRole("dialog", { name: "A hooded figure" });
      expect(within(info).getByText("Keeps the docks.")).toBeInTheDocument();
      expect(within(info).getByText("Owes us.")).toBeInTheDocument();
      expect(within(info).queryByRole("textbox")).toBeNull();
      // Closed from its own button rather than Escape: under load the
      // popover's dismiss layer is not yet listening when Escape is pressed,
      // and the key is lost. Gone before the next press, so that press is
      // not taken as this popover's dismissal.
      await u.click(
        within(pill as HTMLElement).getByRole("button", { name: "About A hooded figure" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "A hooded figure" })).not.toBeInTheDocument(),
      );

      // The scene's text the same way.
      await u.click(within(space).getByRole("button", { name: "Describe The docks" }));
      const text = await screen.findByRole("dialog", { name: "The docks" });
      // Waited for: the panel's text lands a tick after the dialog shows.
      expect(await within(text).findByText("Fog on the water.")).toBeInTheDocument();
      expect(within(text).queryByRole("textbox")).toBeNull();
    });
  }

  it("marks a complete scene over the stacks, as the storyteller's table does", async () => {
    renderTable();
    await connected();
    expect(screen.queryByTestId("scene-complete-overlay")).not.toBeInTheDocument();

    // The storyteller moving to a finished scene comes as a change of scene.
    sa_getPlayScene.mock.mockImplementation(async () => ({
      ...scene,
      scene: { ...scene.scene!, idStoryScene: 4, title: "The abbey", status: "COMPLETE" },
    }));
    await deliver({
      v: 1,
      at: "2026-10-13T10:01:00.000Z",
      idStory: 7,
      type: "scene.changed",
      idStoryScene: 4,
    });
    const overlay = await screen.findByTestId("scene-complete-overlay");
    expect(overlay).toHaveTextContent("COMPLETE");
    expect(screen.queryByTestId("scene-pending-overlay")).not.toBeInTheDocument();
    // The scene is still there under it.
    expect(screen.getByRole("heading", { name: "The abbey" })).toBeInTheDocument();

    sa_getPlayScene.mock.mockImplementation(async () => scene);
    await deliver({
      v: 1,
      at: "2026-10-13T10:02:00.000Z",
      idStory: 7,
      type: "scene.changed",
      idStoryScene: 3,
    });
    await waitFor(() =>
      expect(screen.queryByTestId("scene-complete-overlay")).not.toBeInTheDocument(),
    );
  });

  it("says live updates are off when the broker is not configured", async () => {
    sa_getStoryChannel.mock.mockImplementation(async () => null);
    renderTable();
    await screen.findByText("Live updates are off; reload to see changes.");
    expect(connect.mock.calls).toHaveLength(0);
  });

  it("offers Diagnostics to a storyteller, which takes the chat's place", async () => {
    const person = userEvent.setup();
    renderTable(OPEN);
    await connected();
    const header = screen.getByRole("banner");
    const toggle = within(header).getByRole("button", { name: "Diagnostics" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("region", { name: "Table Chat" })).toBeInTheDocument();

    await person.click(toggle);

    expect(screen.queryByRole("region", { name: "Table Chat" })).not.toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Diagnostics" });
    expect(within(panel).getByText("connected")).toBeInTheDocument();
    expect(within(panel).getByText("story/7/state, story/7/chat")).toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "play.showDiagnostics",
      value: true,
    });
    // The chat's own preference is untouched, so it comes back when
    // diagnostics closes.
    await person.click(toggle);
    expect(screen.getByRole("region", { name: "Table Chat" })).toBeInTheDocument();
  });

  it("lists each message in diagnostics, and opens it to the payload", async () => {
    const person = userEvent.setup();
    renderTable({ "play.showDiagnostics": true });
    await connected();
    const panel = screen.getByRole("region", { name: "Diagnostics" });
    expect(within(panel).getByText("0 messages")).toBeInTheDocument();

    await deliver({
      v: 1,
      at: "2026-10-13T10:01:00.000Z",
      idStory: 7,
      type: "scene.changed",
      idStoryScene: 4,
    });
    await deliver({ hello: "world" });

    expect(within(panel).getByText("2 messages")).toBeInTheDocument();
    const lines = within(panel).getAllByRole("button", { name: /scene\.changed|unrecognised/ });
    // Newest first.
    expect(lines[0]).toHaveAccessibleName(/unrecognised message/);
    expect(lines[1]).toHaveAccessibleName(/scene\.changed · scene 4/);

    await person.click(lines[1]);
    await waitFor(() => expect(within(panel).getByText(/"idStoryScene": 4/)).toBeVisible());

    await person.click(within(panel).getByRole("button", { name: "Clear" }));
    expect(within(panel).getByText("0 messages")).toBeInTheDocument();
  });

  it("offers no Diagnostics to a player", () => {
    renderTable({ "play.showDiagnostics": true }, "3. Kildealg", { ...user, idUserType: -1 });
    const header = screen.getByRole("banner");
    expect(within(header).queryByRole("button", { name: "Diagnostics" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Diagnostics" })).not.toBeInTheDocument();
  });

  it("drops the connection when it unmounts", async () => {
    const { unmount } = renderTable();
    await connected();
    unmount();
    expect(client.end.mock.calls).toHaveLength(1);
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

  it("shows no lines until the first message, and counts who is at the table", async () => {
    const person = userEvent.setup();
    renderTable(OPEN);
    const chat = screen.getByRole("region", { name: "Table Chat" });
    expect(within(chat).queryByRole("article")).not.toBeInTheDocument();
    expect(await within(chat).findByText("3 at the table")).toBeInTheDocument();

    await person.type(within(chat).getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    expect(await within(chat).findByText("Hello")).toBeInTheDocument();
    expect(within(chat).getByText("Paul Stafford")).toBeInTheDocument();
    expect(within(chat).getAllByRole("article")).toHaveLength(1);
  });

  it("offers Send in place of Roll", () => {
    renderTable(OPEN);
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
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
    const person = userEvent.setup();
    renderTable(OPEN);
    const header = screen.getByRole("banner");
    const toggle = within(header).getByRole("button", { name: "Chat" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("aria-controls", "play-panel-chat");

    await person.click(toggle);

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
    const person = userEvent.setup();
    renderTable();
    const toggle = within(screen.getByRole("banner")).getByRole("button", { name: "Character" });
    expect(screen.queryByRole("region", { name: "Character" })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await person.click(toggle);

    expect(screen.getByRole("region", { name: "Character" })).toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "play.showCharacter",
      value: true,
    });
  });
});
