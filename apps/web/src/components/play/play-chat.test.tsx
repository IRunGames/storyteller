import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import { toChatEntry, type ChatEntry } from "@/lib/chat";
import type { PublicChat } from "@/lib/realtime/chat-events";
import type { ChatResult } from "@/app/(app)/play/[id]/actions";
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

let PlayChat: typeof import("./play-chat").PlayChat;

// The chat as a table would hand it over, with its two calls the panel
// makes kept as mocks the tests read.
function chatOf(entries: ChatEntry[], overrides: Partial<StoryChat> = {}) {
  const merge = mock.fn((_chat: PublicChat) => {});
  const loadPrevious = mock.fn(async () => {});
  const chat: StoryChat = {
    entries,
    hasPrevious: false,
    loadingPrevious: false,
    loadPrevious,
    receive: mock.fn(),
    refresh: mock.fn(async () => {}),
    merge,
    unread: 0,
    ...overrides,
  };
  return Object.assign(chat, { merge, loadPrevious });
}

describe("PlayChat", () => {
  before(async () => {
    Element.prototype.scrollIntoView = () => {};
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: { sa_postChat, sa_editChat, sa_listChats: mock.fn() },
    });
    ({ PlayChat } = await import("./play-chat"));
  });

  beforeEach(() => {
    sa_postChat.mock.resetCalls();
    sa_editChat.mock.resetCalls();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const render = (chat: StoryChat) =>
    renderWithProviders(
      <UserProvider user={user}>
        <PlayChat id="chat" idStory={7} chat={chat} />
      </UserProvider>,
    );

  it("shows the sample until there is a line", () => {
    render(chatOf([]));
    expect(screen.getByText("Sample conversation")).toBeInTheDocument();
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
    expect(within(chat).queryByText("Sample conversation")).not.toBeInTheDocument();
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
