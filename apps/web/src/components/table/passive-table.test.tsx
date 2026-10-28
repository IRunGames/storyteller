import { EventEmitter } from "node:events";
import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PublicChat } from "@/lib/realtime/chat-events";
import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { PlayScene } from "@/lib/play-scene";

const member: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Harry",
  email: "harry@example.test",
  image: null,
  nickName: null,
  idUserType: -1,
  isAnonymous: false,
};
const guest: CurrentUser = {
  ...member,
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce28400",
  name: "Sleepy Otter",
  email: "temp@anonymous.placeholder.invalid",
  isAnonymous: true,
};

// A stand-in for mqtt.js's client, as in play-table.test.tsx.
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
const sa_listChats = mock.fn(async (_idStory: number, _before?: number) => ({
  chats: [] as PublicChat[],
  hasPrevious: false,
  atTable: 3,
}));

function link(idElement: number, name: string, imageUrl: string | null, title: string | null) {
  return {
    element: {
      idElement,
      idStory: 7,
      kind: "PERSON",
      status: "READY",
      initialName: null,
      name,
      title,
      description: `${name}'s description.`,
      notes: null,
      imageUrl,
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
      idSceneElement: idElement + 10,
      idStoryScene: 3,
      idElement,
      status: "READY",
      tags: ["scene"],
      elementShowing: "name",
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
}

const scene: PlayScene = {
  idStorySession: 2,
  scene: {
    idStoryScene: 3,
    title: "The docks",
    status: "ACTIVE",
    text: { description: "Fog on the water.", notes: null },
  },
  tags: ["scene"],
  coverUrl: null,
  items: [
    link(5, "Zed", "https://example.test/zed.webp", "Harbourmaster"),
    link(6, "Abbot", null, null),
  ],
};

const sa_setPlayElementNotes = mock.fn(
  async (_idStory: number, _idElement: number, input: unknown) => ({
    ok: true as const,
    notes: input as string,
  }),
);

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

let PassiveTable: typeof import("./passive-table").PassiveTable;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

function renderTable(
  who: CurrentUser = member,
  isOwner = false,
  preferences: Record<string, boolean> = {},
) {
  return renderWithProviders(
    <UserProvider user={who}>
      <UserPreferencesProvider preferences={preferences}>
        <PassiveTable
          idStory={7}
          title="Psychoneira"
          session="3. Kildealg"
          initialScene={scene}
          storyCoverUrl={null}
          isOwner={isOwner}
        />
      </UserPreferencesProvider>
    </UserProvider>,
  );
}

describe("PassiveTable", () => {
  before(async () => {
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference },
    });
    mock.module("@/components/elements/actions", {
      namedExports: { sa_listElementHistory: mock.fn(async () => ({ rows: [], hasMore: false })) },
    });
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: {
        sa_setPlayElementNotes,
        sa_untapPlaySceneElement: mock.fn(),
        sa_getStoryChannel: mock.fn(async () => channel),
        sa_getPlayScene: mock.fn(async () => null),
        sa_listChats,
        sa_postChat: mock.fn(),
        sa_editChat: mock.fn(),
        sa_deleteChat: mock.fn(),
      },
    });
    mock.module("mqtt", { defaultExport: { connect } });

    ({ PassiveTable } = await import("./passive-table"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    connect.mock.resetCalls();
    sa_listChats.mock.resetCalls();
  });

  it("shows the scene's title, then the story and session, over the table", () => {
    renderTable();

    expect(screen.getByRole("heading", { level: 1, name: "The docks" })).toBeInTheDocument();
    expect(screen.getByText("Psychoneira — 3. Kildealg")).toBeInTheDocument();
    expect(screen.getByText("Storyteller")).toBeInTheDocument();
  });

  it("shows a guest the elements large, with a picture icon in place of a picture, and nothing to press", () => {
    renderTable(guest);

    const stack = screen.getByRole("region", { name: "scene" });
    expect(within(stack).getByText("Zed")).toBeInTheDocument();
    expect(within(stack).getByText("Harbourmaster")).toBeInTheDocument();
    expect(within(stack).getAllByRole("img", { name: "Has a picture" })).toHaveLength(1);
    expect(stack.querySelector("img")).toBeNull();
    expect(within(stack).queryAllByRole("button")).toEqual([]);
    expect(within(stack).queryAllByRole("link")).toEqual([]);
  });

  it("tells a guest that someone logged in can view the picture", async () => {
    const u = userEvent.setup();
    renderTable(guest);

    await u.hover(screen.getByRole("img", { name: "Has a picture" }));

    expect(
      await screen.findByText("Logged-in users can view images themselves"),
    ).toBeInTheDocument();
  });

  it("lets someone with an account open an element's picture from its icon", async () => {
    const u = userEvent.setup();
    renderTable(member);

    const stack = screen.getByRole("region", { name: "scene" });
    // Only the element with a picture has the picture button.
    expect(within(stack).getAllByRole("button", { name: /^Show the picture/ })).toHaveLength(1);
    await u.click(within(stack).getByRole("button", { name: "Show the picture of Zed" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector('img[src="https://example.test/zed.webp"]')).not.toBeNull();
  });

  it("lets someone with an account open an element's info and save notes on it", async () => {
    const u = userEvent.setup();
    renderTable(member);

    const stack = screen.getByRole("region", { name: "scene" });
    expect(within(stack).getAllByRole("button", { name: /^About / })).toHaveLength(2);
    await u.click(within(stack).getByRole("button", { name: "About Zed" }));

    const dialog = await screen.findByRole("dialog", { name: "Zed" });
    expect(within(dialog).getByText("Zed's description.")).toBeInTheDocument();
    await u.type(within(dialog).getByRole("textbox"), "Owes us a boat.");
    await u.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(sa_setPlayElementNotes.mock.callCount()).toBe(1));
    expect(sa_setPlayElementNotes.mock.calls[0].arguments).toEqual([7, 5, "Owes us a boat."]);
  });

  it("gives no info button for an element whose info the storyteller keeps back", () => {
    renderWithProviders(
      <UserProvider user={member}>
        <UserPreferencesProvider preferences={{}}>
          <PassiveTable
            idStory={7}
            title="Psychoneira"
            session="3. Kildealg"
            initialScene={{
              ...scene,
              items: scene.items.map((item) => ({
                ...item,
                sceneElement: { ...item.sceneElement, showInfo: false },
              })),
            }}
            storyCoverUrl={null}
            isOwner={false}
          />
        </UserPreferencesProvider>
      </UserProvider>,
    );

    const stack = screen.getByRole("region", { name: "scene" });
    expect(within(stack).queryAllByRole("button", { name: /^About / })).toEqual([]);
  });

  it("lets someone with an account put everything away behind the eye, and bring it back", async () => {
    const u = userEvent.setup();
    renderTable(member);
    const eye = screen.getByRole("button", { name: "Show background" });
    expect(eye).toHaveAttribute("aria-pressed", "false");

    await u.click(eye);
    expect(eye).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("region", { name: "scene" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Table Chat" })).toBeNull();

    await u.click(eye);
    expect(screen.getByRole("heading", { level: 1, name: "The docks" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "scene" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Table Chat" })).toBeInTheDocument();
  });

  it("gives a guest no eye", () => {
    renderTable(guest);
    expect(screen.queryByRole("button", { name: "Show background" })).toBeNull();
  });

  it("takes a player back to the players' table", () => {
    renderTable(member);

    expect(screen.getByRole("link", { name: "Back to the play table" })).toHaveAttribute(
      "href",
      "/play/7",
    );
  });

  it("takes the storyteller back to their own table", () => {
    renderTable(member, true);

    expect(screen.getByRole("link", { name: "Back to the run table" })).toHaveAttribute(
      "href",
      "/run/7",
    );
  });

  it("offers a guest an account, coming back here after", () => {
    renderTable(guest);

    expect(screen.getByRole("link", { name: "Log in / Sign up" })).toHaveAttribute(
      "href",
      "/signup?redirectTo=%2Ftable%2F7",
    );
  });

  it("gives someone with an account the overlay chat's box, with no layout to pick", async () => {
    renderTable(member);

    const chat = screen.getByRole("region", { name: "Table Chat" });
    expect(within(chat).getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Chat layout" })).toBeNull();
    await waitFor(() => expect(sa_listChats.mock.callCount()).toBeGreaterThan(0));
  });

  it("lets someone with an account hide the chat box, and keeps the choice", async () => {
    const u = userEvent.setup();
    renderTable(member);

    const toggle = screen.getByRole("button", { name: "Chat box" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await u.click(toggle);

    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(sa_setUserPreference.mock.calls.at(-1)?.arguments).toEqual([
      { key: "table.showChatBox", value: false },
    ]);

    await u.click(toggle);
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
  });

  it("starts with the chat box hidden when that was the choice", () => {
    renderTable(member, false, { "table.showChatBox": false });

    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.getByRole("button", { name: "Chat box" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("lets a guest read the table's lines but not write one", async () => {
    renderTable(guest);
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Chat box" })).toBeNull();

    // Once the chat's first page is in, a new line floats up over the table.
    await waitFor(() => expect(sa_listChats.mock.callCount()).toBeGreaterThan(0));
    await waitFor(() => expect(connect.mock.callCount()).toBeGreaterThan(0));
    const said = {
      v: 1,
      at: "2026-10-26T20:05:00.000Z",
      idStory: 7,
      type: "chat.posted",
      chat: {
        idChat: 41,
        idStoryScene: 3,
        idUser: member.id,
        from: "Harry",
        text: "The box is ticking.",
        isSystem: false,
        isEdited: false,
        createdAt: "2026-10-26T20:05:00.000Z",
        color: null,
        picture: null,
        roll: null,
      },
    };
    await act(async () => {
      client.emit("message", "story/7/chat", new TextEncoder().encode(JSON.stringify(said)));
    });
    expect(await screen.findByText("The box is ticking.")).toBeInTheDocument();
  });
});
