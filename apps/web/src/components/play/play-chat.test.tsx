import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import { toChatEntry, type ChatEntry } from "@/lib/chat";
import type { PublicChat } from "@/lib/realtime/chat-events";
import type { ChatResult, DeleteChatResult } from "@/app/(app)/play/[id]/actions";
import type { StoryChat } from "./use-story-chat";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -2,
};

const now = new Date();
const line = (overrides: Partial<PublicChat>): PublicChat => ({
  idChat: 1,
  idStoryScene: 3,
  idUser: "someone-else",
  from: "Harry",
  text: "It's ticking.",
  isSystem: false,
  isEdited: false,
  createdAt: now.toISOString(),
  color: null,
  picture: null,
  roll: null,
  ...overrides,
});

const sa_postChat = mock.fn(async (_story: number, text: unknown): Promise<ChatResult> => ({
  ok: true,
  chat: line({ idChat: 9, idUser: user.id, from: "Storyteller", text: String(text) }),
}));
const sa_editChat = mock.fn(
  async (_story: number, idChat: number, text: unknown): Promise<ChatResult> => ({
    ok: true,
    chat: line({ idChat, idUser: user.id, text: String(text), isEdited: true }),
  }),
);

const sa_deleteChat = mock.fn(
  async (_story: number, idChat: number): Promise<DeleteChatResult> => ({ ok: true, idChat }),
);

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

let PlayChat: typeof import("./play-chat").PlayChat;
let PlayChatOverlay: typeof import("./play-chat-overlay").PlayChatOverlay;
let UserPreferencesProvider: typeof import("@/components/preferences/user-preferences-provider").UserPreferencesProvider;

// The chat as a table would hand it over, with its two calls the panel
// makes kept as mocks the tests read.
function chatOf(entries: ChatEntry[], overrides: Partial<StoryChat> = {}) {
  const merge = mock.fn((_chat: PublicChat) => {});
  const remove = mock.fn((_idChat: number) => {});
  const loadPrevious = mock.fn(async () => {});
  const chat: StoryChat = {
    entries,
    hasPrevious: false,
    loadingPrevious: false,
    loadPrevious,
    receive: mock.fn(),
    refresh: mock.fn(async () => {}),
    merge,
    remove,
    unread: 0,
    atTable: 0,
    loaded: true,
    ...overrides,
  };
  return Object.assign(chat, { merge, remove, loadPrevious });
}

describe("PlayChat", () => {
  before(async () => {
    Element.prototype.scrollIntoView = () => {};
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: { sa_postChat, sa_editChat, sa_deleteChat, sa_listChats: mock.fn() },
    });
    mock.module("@/components/preferences/actions", { namedExports: { sa_setUserPreference } });
    ({ PlayChat } = await import("./play-chat"));
    ({ PlayChatOverlay } = await import("./play-chat-overlay"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    sa_postChat.mock.resetCalls();
    sa_editChat.mock.resetCalls();
    sa_deleteChat.mock.resetCalls();
    sa_setUserPreference.mock.resetCalls();
  });

  // Unmounted before the body is cleared: a line of the viewer's own keeps
  // its delete popover portalled into the body even while closed (it is not
  // lazyMount, so the dialog stays named by its title), and React cannot
  // unmount a portal whose node has already gone.
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  const render = (chat: StoryChat, preferences: Record<string, string> = {}) =>
    renderWithProviders(
      <UserProvider user={user}>
        <UserPreferencesProvider preferences={preferences}>
          <PlayChat id="chat" idStory={7} chat={chat} />
        </UserPreferencesProvider>
      </UserProvider>,
    );

  it("offers three layouts between its title and the head count, standard to begin with", async () => {
    const u = userEvent.setup();
    render(chatOf([], { atTable: 2 }));
    const picker = screen.getByRole("group", { name: "Chat layout" });
    const buttons = within(picker).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Standard chat",
      "Compact chat",
      "Overlay chat",
    ]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    // Title, picker, count, in that order across the header.
    const title = screen.getByRole("heading", { name: "Table Chat" });
    const count = screen.getByText("2 at the table");
    expect(title.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picker.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await u.click(within(picker).getByRole("button", { name: "Compact chat" }));
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "chat.layout",
      value: "compact",
    });
    expect(within(picker).getByRole("button", { name: "Compact chat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("leaves the picture out of the compact layout, keeping the name and the line", () => {
    const entries = [toChatEntry(line({ from: "Harry Potter" }))];
    const { unmount } = render(chatOf(entries));
    expect(screen.getByText("HP")).toBeInTheDocument();
    unmount();

    render(chatOf(entries), { "chat.layout": "compact" });
    expect(screen.queryByText("HP")).not.toBeInTheDocument();
    expect(screen.getByText("Harry Potter")).toBeInTheDocument();
    expect(screen.getByText("It's ticking.")).toBeInTheDocument();
  });

  describe("overlay", () => {
    const renderOverlay = (chat: StoryChat) =>
      renderWithProviders(
        <UserProvider user={user}>
          <UserPreferencesProvider preferences={{ "chat.layout": "overlay" }}>
            <PlayChatOverlay id="chat" idStory={7} chat={chat} />
          </UserPreferencesProvider>
        </UserProvider>,
      );

    it("is a box to type in, with the layout picker beside it", () => {
      renderOverlay(chatOf([]));
      const box = screen.getByRole("region", { name: "Table Chat" });
      expect(within(box).getByRole("textbox", { name: "Message" })).toBeInTheDocument();
      expect(within(box).getByRole("button", { name: "Send" })).toBeInTheDocument();
      expect(within(box).getByRole("button", { name: "Overlay chat" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("shows each new line over the table, not what was already held, and lets them pile up", async () => {
      const first = toChatEntry(line({ idChat: 1, text: "Said before." }));
      const { rerender } = renderOverlay(chatOf([first]));
      const again = (entries: ChatEntry[]) =>
        rerender(
          <UserProvider user={user}>
            <UserPreferencesProvider preferences={{ "chat.layout": "overlay" }}>
              <PlayChatOverlay id="chat" idStory={7} chat={chatOf(entries)} />
            </UserPreferencesProvider>
          </UserProvider>,
        );

      again([first, toChatEntry(line({ idChat: 2, text: "Just now." }))]);
      again([
        first,
        toChatEntry(line({ idChat: 2, text: "Just now." })),
        toChatEntry(line({ idChat: 3, text: "And again." })),
      ]);

      expect(await screen.findByText("Just now.")).toBeInTheDocument();
      expect(await screen.findByText("And again.")).toBeInTheDocument();
      expect(screen.queryByText("Said before.")).not.toBeInTheDocument();
    });

    it("shows the viewer's own line, as sent, in the series with everyone else's", async () => {
      const u = userEvent.setup();
      // The table's chat as useStoryChat would hold it: what is merged is held.
      let entries: ChatEntry[] = [toChatEntry(line({ idChat: 1, text: "Said before." }))];
      let rerender: (ui: React.ReactElement) => void = () => {};
      const ui = () => (
        <UserProvider user={user}>
          <UserPreferencesProvider preferences={{ "chat.layout": "overlay" }}>
            <PlayChatOverlay
              id="chat"
              idStory={7}
              chat={Object.assign(chatOf(entries), {
                merge: (chat: PublicChat) => {
                  entries = [...entries, toChatEntry(chat)];
                  rerender(ui());
                },
              })}
            />
          </UserPreferencesProvider>
        </UserProvider>
      );
      ({ rerender } = renderWithProviders(ui()));

      await u.type(screen.getByRole("textbox", { name: "Message" }), "On my way.{Enter}");

      expect(await screen.findByText("On my way.")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    });

    it("waits for the chat's first page, so what it brings is not shown", async () => {
      const { rerender } = renderOverlay(chatOf([], { loaded: false }));
      rerender(
        <UserProvider user={user}>
          <UserPreferencesProvider preferences={{ "chat.layout": "overlay" }}>
            <PlayChatOverlay
              id="chat"
              idStory={7}
              chat={chatOf([toChatEntry(line({ idChat: 5, text: "From the load." }))])}
            />
          </UserPreferencesProvider>
        </UserProvider>,
      );
      // Given a moment in which a toast would have appeared.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByText("From the load.")).not.toBeInTheDocument();
    });
  });

  it("shows nothing at all until there is a line", () => {
    render(chatOf([]));
    const chat = screen.getByRole("region", { name: "Table Chat" });
    expect(within(chat).queryByRole("article")).not.toBeInTheDocument();
    expect(within(chat).queryByText(/sample/i)).not.toBeInTheDocument();
  });

  it("counts who is at the table, and nothing while no one is", () => {
    const { unmount } = render(chatOf([], { atTable: 3 }));
    expect(screen.getByText("3 at the table")).toBeInTheDocument();
    unmount();

    render(chatOf([]));
    expect(screen.queryByText(/at the table/)).not.toBeInTheDocument();
  });

  it("draws a roll: its total and what it was for, each die, and the roll written out", () => {
    render(
      chatOf([
        toChatEntry(
          line({
            text: "6 for initiative",
            roll: {
              notation: "4d4kh2+2",
              label: "for initiative",
              total: 6,
              dice: [
                { value: 3, dropped: false },
                { value: 1, dropped: false },
                { value: 1, dropped: true },
                { value: 1, dropped: true },
              ],
              detail: "4d4kh2+2: [3, 1, 1d, 1d]+2 = 6",
            },
          }),
        ),
      ]),
    );
    const roll = screen.getByRole("group", { name: "Rolled 4d4kh2+2 for initiative: 6" });
    expect(within(roll).getByText("6 for initiative")).toBeInTheDocument();
    expect(
      within(roll)
        .getAllByTestId("die")
        .map((die) => die.textContent),
    ).toEqual(["3", "1", "1", "1"]);
    expect(within(roll).getAllByTestId("die")[2]).toHaveAttribute("data-dropped");
    expect(within(roll).getByText("4d4kh2+2: [3, 1, 1d, 1d]+2 = 6")).toBeInTheDocument();
    // A roll is what was rolled, so it has no pencil even for its sender.
    expect(screen.queryByRole("button", { name: "Edit message" })).not.toBeInTheDocument();
  });

  it("sends with the Send button too, and has no Roll button", async () => {
    const u = userEvent.setup();
    render(chatOf([]));

    expect(screen.queryByRole("button", { name: /roll/i })).not.toBeInTheDocument();
    await u.type(screen.getByRole("textbox", { name: "Message" }), "/roll 2d4+2 for initiative");
    await u.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sa_postChat.mock.callCount()).toBe(1));
    expect(sa_postChat.mock.calls[0].arguments).toEqual([7, "/roll 2d4+2 for initiative"]);
  });

  it("brings back the last message sent with the up arrow, as it was typed", async () => {
    const u = userEvent.setup();
    render(chatOf([]));
    const input = screen.getByRole("textbox", { name: "Message" });

    // Nothing sent yet, and no line of the viewer's: nothing to bring back.
    await u.type(input, "{ArrowUp}");
    expect(input).toHaveValue("");

    await u.type(input, "/roll 2d4+2 for initiative{Enter}");
    await waitFor(() => expect(input).toHaveValue(""));
    await u.type(input, "{ArrowUp}");
    expect(input).toHaveValue("/roll 2d4+2 for initiative");

    // A draft is not thrown away for it.
    await u.clear(input);
    await u.type(input, "Half a thought{ArrowUp}");
    expect(input).toHaveValue("Half a thought");
  });

  it("brings back the viewer's last line in the chat when nothing was sent here yet", async () => {
    const u = userEvent.setup();
    render(
      chatOf([
        toChatEntry(line({ idChat: 1, idUser: user.id, text: "Mine, earlier" })),
        toChatEntry(line({ idChat: 2, idUser: user.id, text: "Mine, latest" })),
        toChatEntry(line({ idChat: 3, text: "Theirs" })),
      ]),
    );
    const input = screen.getByRole("textbox", { name: "Message" });

    await u.type(input, "{ArrowUp}");
    expect(input).toHaveValue("Mine, latest");
  });

  it("refuses a command there is not without sending it", async () => {
    const u = userEvent.setup();
    render(chatOf([]));

    await u.type(screen.getByRole("textbox", { name: "Message" }), "/shout hi{Enter}");

    expect(await screen.findByText(/There is no \/shout/)).toBeInTheDocument();
    expect(sa_postChat.mock.callCount()).toBe(0);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("/shout hi");
  });

  it("draws people's lines, the scene divider and the table's own lines", () => {
    render(
      chatOf([
        toChatEntry(
          line({ idChat: 1, isSystem: true, idUser: user.id, text: "Entering The Docks" }),
        ),
        toChatEntry(line({ idChat: 2 })),
        toChatEntry(line({ idChat: 3, isSystem: true, text: "Harry untapped Zed" })),
      ]),
    );
    const chat = screen.getByRole("region", { name: "Table Chat" });
    expect(within(chat).getByRole("article", { name: "Entering The Docks" })).toBeInTheDocument();
    expect(within(chat).getByText("It's ticking.")).toBeInTheDocument();
    expect(within(chat).getByText("Harry untapped Zed")).toBeInTheDocument();
  });

  it("says how long ago a line from another day was said", () => {
    const threeDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 12);
    render(chatOf([toChatEntry(line({ createdAt: threeDaysAgo.toISOString() }))]));
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
  });

  it("shows the sender's profile picture where they have one", () => {
    const { container } = render(
      chatOf([
        toChatEntry(line({ color: "#46A758", picture: "https://example.test/harry.png" })),
        toChatEntry(line({ idChat: 2, from: "Tom", text: "Wait." })),
      ]),
    );
    const pictures = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(pictures).toEqual(["https://example.test/harry.png"]);
    // Tom has none, so his avatar keeps his initials.
    expect(screen.getByText("TO")).toBeInTheDocument();
  });

  it("sends a line, keeps what the action saved and clears the input", async () => {
    const u = userEvent.setup();
    const chat = chatOf([]);
    render(chat);

    await u.type(screen.getByRole("textbox", { name: "Message" }), "  Open the box. {Enter}");

    await waitFor(() => expect(sa_postChat.mock.callCount()).toBe(1));
    expect(sa_postChat.mock.calls[0].arguments).toEqual([7, "Open the box."]);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue(""));
    expect(chat.merge.mock.calls[0].arguments[0]).toMatchObject({
      idChat: 9,
      text: "Open the box.",
    });
  });

  it("keeps the text and says why when a line is refused", async () => {
    const u = userEvent.setup();
    sa_postChat.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "The story is not being played, so there is no table to talk at.",
    }));
    render(chatOf([]));

    await u.type(screen.getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    expect(await screen.findByText(/no table to talk at/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Hello");
  });

  it("offers Previous… only while there are older lines", async () => {
    const u = userEvent.setup();
    const { unmount } = render(chatOf([toChatEntry(line({}))]));
    expect(screen.queryByRole("button", { name: "Previous…" })).not.toBeInTheDocument();
    unmount();

    const chat = chatOf([toChatEntry(line({}))], { hasPrevious: true });
    render(chat);
    await u.click(screen.getByRole("button", { name: "Previous…" }));
    expect(chat.loadPrevious.mock.callCount()).toBe(1);
  });

  it("puts a pencil on the viewer's own lines only, and says which were edited", () => {
    render(
      chatOf([
        toChatEntry(line({ idChat: 1, text: "Theirs", isEdited: true })),
        toChatEntry(line({ idChat: 2, idUser: user.id, text: "Mine" })),
        toChatEntry(line({ idChat: 3, idUser: user.id, isSystem: true, text: "Entering X" })),
      ]),
    );
    expect(screen.getAllByRole("button", { name: "Edit message" })).toHaveLength(1);
    const theirs = screen.getByText("Theirs").closest("article") as HTMLElement;
    expect(within(theirs).getByText("edited")).toBeInTheDocument();
    const mine = screen.getByText("Mine").closest("article") as HTMLElement;
    expect(within(mine).queryByText("edited")).not.toBeInTheDocument();
    expect(within(mine).getByRole("button", { name: "Edit message" })).toBeInTheDocument();
  });

  it("puts a bin beside the pencil on the viewer's own said lines only", () => {
    render(
      chatOf([
        toChatEntry(line({ idChat: 1, text: "Theirs" })),
        toChatEntry(line({ idChat: 2, idUser: user.id, text: "Mine" })),
      ]),
    );
    const mine = screen.getByText("Mine").closest("article") as HTMLElement;
    expect(screen.getAllByRole("button", { name: "Delete message" })).toHaveLength(1);
    expect(within(mine).getByRole("button", { name: "Delete message" })).toBeInTheDocument();
  });

  it("asks before taking a line back: Cancel keeps it, Delete takes it back", async () => {
    const u = userEvent.setup();
    const chat = chatOf([toChatEntry(line({ idChat: 2, idUser: user.id, text: "Mine" }))]);
    render(chat);

    await u.click(screen.getByRole("button", { name: "Delete message" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this message?" });
    await u.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Delete this message?" })).toBeNull(),
    );
    expect(sa_deleteChat.mock.callCount()).toBe(0);

    await u.click(screen.getByRole("button", { name: "Delete message" }));
    await u.click(
      within(await screen.findByRole("dialog", { name: "Delete this message?" })).getByRole(
        "button",
        { name: "Delete" },
      ),
    );
    await waitFor(() => expect(chat.remove.mock.calls[0]?.arguments).toEqual([2]));
    expect(sa_deleteChat.mock.calls[0].arguments).toEqual([7, 2]);
  });

  it("keeps the popover open with the reason when a delete is refused", async () => {
    const u = userEvent.setup();
    sa_deleteChat.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That is not a line of yours.",
    }));
    const chat = chatOf([toChatEntry(line({ idChat: 2, idUser: user.id, text: "Mine" }))]);
    render(chat);

    await u.click(screen.getByRole("button", { name: "Delete message" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this message?" });
    await u.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "That is not a line of yours.",
    );
    expect(chat.remove.mock.callCount()).toBe(0);
  });

  it("edits a line in place: Esc puts it back, Enter saves it", async () => {
    const u = userEvent.setup();
    const chat = chatOf([toChatEntry(line({ idChat: 2, idUser: user.id, text: "Mine" }))]);
    render(chat);

    await u.click(screen.getByRole("button", { name: "Edit message" }));
    let field = screen.getByRole("textbox", { name: "Edit message" });
    expect(field).toHaveValue("Mine");
    await u.clear(field);
    await u.type(field, "Changed{Escape}");
    expect(screen.queryByRole("textbox", { name: "Edit message" })).not.toBeInTheDocument();
    expect(screen.getByText("Mine")).toBeInTheDocument();
    expect(sa_editChat.mock.callCount()).toBe(0);

    // Unchanged, Enter just closes.
    await u.click(screen.getByRole("button", { name: "Edit message" }));
    await u.type(screen.getByRole("textbox", { name: "Edit message" }), "{Enter}");
    expect(screen.queryByRole("textbox", { name: "Edit message" })).not.toBeInTheDocument();
    expect(sa_editChat.mock.callCount()).toBe(0);

    await u.click(screen.getByRole("button", { name: "Edit message" }));
    field = screen.getByRole("textbox", { name: "Edit message" });
    await u.clear(field);
    await u.type(field, "Changed{Enter}");
    await waitFor(() => expect(sa_editChat.mock.callCount()).toBe(1));
    expect(sa_editChat.mock.calls[0].arguments).toEqual([7, 2, "Changed"]);
    await waitFor(() =>
      expect(chat.merge.mock.calls[0].arguments[0]).toMatchObject({
        text: "Changed",
        isEdited: true,
      }),
    );
  });

  it("keeps the field open with the reason when an edit is refused", async () => {
    const u = userEvent.setup();
    sa_editChat.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That is not a line of yours.",
    }));
    render(chatOf([toChatEntry(line({ idChat: 2, idUser: user.id, text: "Mine" }))]));

    await u.click(screen.getByRole("button", { name: "Edit message" }));
    await u.type(screen.getByRole("textbox", { name: "Edit message" }), "!{Enter}");

    expect(await screen.findByText("That is not a line of yours.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Edit message" })).toHaveValue("Mine!");
  });
});
