import { EventEmitter } from "node:events";
import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { PlayScene } from "@/lib/play-scene";
import type { StoryEvent } from "@/lib/realtime/events";

// A storyteller (-2), so the diagnostics toggle is offered; the player test
// overrides the type.
const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -2,
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
};
const sa_getStoryChannel = mock.fn(async (_idStory: number) => channel as typeof channel | null);
const sa_getPlayScene = mock.fn(async (_idStory: number) => null as PlayScene | null);
const sa_setPlaySceneText = mock.fn(
  async (_story: number, _scene: number, values: { description: string; notes: string }) => ({
    ok: true as const,
    text: { description: values.description || null, notes: values.notes || null },
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
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

// The table reads the user and the preference map from the providers
// (app)/layout.tsx mounts, as the menu bar does.
// Both panels open, for the tests about what is in them.
const OPEN = { "play.showChat": true, "play.showCharacter": true };

function renderTable(
  preferences: Record<string, boolean> = {},
  session: string | null = "3. Kildealg",
  who: CurrentUser = user,
  initialScene: PlayScene = scene,
) {
  return renderWithProviders(
    <UserProvider user={who}>
      <UserPreferencesProvider preferences={preferences}>
        <PlayTable idStory={7} title="Psychoneira" session={session} initialScene={initialScene} />
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
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: { sa_getStoryChannel, sa_getPlayScene, sa_setPlaySceneText },
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

    // An element whose address is not a web address offers no link.
    expect(screen.queryByRole("link", { name: /^Link for Abbot/ })).not.toBeInTheDocument();
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
    expect(client.subscribe.mock.calls[0].arguments[0]).toBe("story/7/state");
    expect(sa_getPlayScene.mock.calls).toHaveLength(1);
    await screen.findByText("Abbot");
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
    expect(screen.getByText("Zed").closest("[data-scene-status]")).toHaveAttribute(
      "data-scene-status",
      "DISABLED",
    );

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
    expect(within(pill).getByRole("img", { name: "Tapped" })).toBeInTheDocument();
    // With its info on: the title under the name, and the description
    // behind the info button, in a popover.
    expect(within(pill).getByText("Harbourmaster")).toBeInTheDocument();
    const u = userEvent.setup();
    await u.click(within(pill).getByRole("button", { name: "About Zed" }));
    const popover = await screen.findByRole("dialog", { name: "Zed" });
    expect(within(popover).getByText("Harbourmaster")).toBeInTheDocument();
    expect(within(popover).getByText("Keeps the docks.")).toBeInTheDocument();
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
    expect(within(panel).getByText("story/7/state")).toBeInTheDocument();
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

  it("shows a sample conversation until the first message, then only real ones", async () => {
    const person = userEvent.setup();
    renderTable(OPEN);
    const chat = screen.getByRole("region", { name: "Table Chat" });
    expect(within(chat).getByText("Sample conversation")).toBeInTheDocument();
    expect(within(chat).getByText("4 online")).toBeInTheDocument();
    expect(
      within(chat).getByLabelText("Rolled 2d6 for Spot the box: 10, success"),
    ).toBeInTheDocument();

    await person.type(within(chat).getByRole("textbox", { name: "Message" }), "Hello{Enter}");

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
