import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, waitFor } from "@testing-library/react";
import { useEffect } from "react";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { ChatEvent, PublicChat } from "@/lib/realtime/chat-events";
import type { ChatLoad } from "@/app/(app)/play/[id]/actions";
import type { StoryChat } from "./use-story-chat";

const user: CurrentUser = {
  id: "me",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -2,
  isAnonymous: false,
};

const line = (idChat: number, overrides: Partial<PublicChat> = {}): PublicChat => ({
  idChat,
  idStoryScene: 3,
  idUser: "someone-else",
  from: "Harry",
  text: `Line ${idChat}`,
  isSystem: false,
  isEdited: false,
  createdAt: new Date(Date.UTC(2026, 9, 26, 20, idChat)).toISOString(),
  color: null,
  picture: null,
  roll: null,
  ...overrides,
});
const event = (type: "chat.posted" | "chat.edited", chat: PublicChat): ChatEvent => ({
  v: 1,
  at: chat.createdAt,
  idStory: 7,
  type,
  chat,
});

const sa_listChats = mock.fn(async (_idStory: number, _before?: number): Promise<ChatLoad> => ({
  chats: [line(5), line(6)],
  hasPrevious: true,
  atTable: 3,
}));

let useStoryChat: typeof import("./use-story-chat").useStoryChat;

// What the hook last answered, read by the tests.
let current: StoryChat;
function Harness({ isOpen }: { isOpen: boolean }) {
  const chat = useStoryChat(7, isOpen);
  useEffect(() => {
    current = chat;
  });
  return null;
}

const render = (isOpen: boolean) => {
  const view = renderWithProviders(
    <UserProvider user={user}>
      <Harness isOpen={isOpen} />
    </UserProvider>,
  );
  return {
    reopen: (open: boolean) =>
      view.rerender(
        <UserProvider user={user}>
          <Harness isOpen={open} />
        </UserProvider>,
      ),
  };
};

const ids = () => current.entries.map((entry) => entry.idChat);

describe("useStoryChat", () => {
  before(async () => {
    mock.module("@/app/(app)/play/[id]/actions", { namedExports: { sa_listChats } });
    ({ useStoryChat } = await import("./use-story-chat"));
  });

  beforeEach(() => {
    sa_listChats.mock.resetCalls();
  });

  it("opens on the latest page and says whether there are older lines", async () => {
    render(true);
    await waitFor(() => expect(ids()).toEqual([5, 6]));
    expect(sa_listChats.mock.calls[0].arguments).toEqual([7]);
    expect(current.hasPrevious).toBe(true);
  });

  it("holds a line once however often it comes, and lets an edit replace it", async () => {
    render(true);
    await waitFor(() => expect(ids()).toEqual([5, 6]));

    await act(async () => {
      current.receive(event("chat.posted", line(7)));
      current.receive(event("chat.posted", line(7)));
      current.merge(line(7));
      current.receive(event("chat.edited", line(6, { text: "Fixed", isEdited: true })));
    });
    expect(ids()).toEqual([5, 6, 7]);
    expect(current.entries[1]).toMatchObject({ text: "Fixed", isEdited: true });

    // A reload merges rather than replaces, so nothing held is lost.
    await act(async () => {
      await current.refresh();
    });
    expect(ids()).toEqual([5, 6, 7]);
  });

  it("counts new lines from others while closed, and forgets them on opening", async () => {
    const { reopen } = render(false);
    await waitFor(() => expect(ids()).toEqual([5, 6]));

    await act(async () => {
      current.receive(event("chat.posted", line(7)));
      current.receive(event("chat.posted", line(7)));
      current.receive(event("chat.posted", line(8, { idUser: "me" })));
      current.receive(event("chat.edited", line(5, { isEdited: true })));
    });
    expect(current.unread).toBe(1);

    reopen(true);
    await waitFor(() => expect(current.unread).toBe(0));
    await act(async () => {
      current.receive(event("chat.posted", line(9)));
    });
    expect(current.unread).toBe(0);
  });

  it("loads the page before the oldest line held", async () => {
    render(true);
    await waitFor(() => expect(ids()).toEqual([5, 6]));
    sa_listChats.mock.mockImplementationOnce(async () => ({
      chats: [line(3), line(4)],
      hasPrevious: false,
      atTable: 3,
    }));

    await act(async () => {
      await current.loadPrevious();
    });
    expect(sa_listChats.mock.calls.at(-1)?.arguments).toEqual([7, 5]);
    expect(ids()).toEqual([3, 4, 5, 6]);
    expect(current.hasPrevious).toBe(false);
  });

  it("drops a line taken back, and does not take it back in from a later copy", async () => {
    render(true);
    await waitFor(() => expect(ids()).toEqual([5, 6]));

    await act(async () => {
      current.receive({ v: 1, at: "", idStory: 7, type: "chat.deleted", idChat: 6 });
    });
    expect(ids()).toEqual([5]);

    await act(async () => {
      current.remove(5);
      current.receive(event("chat.posted", line(6)));
      await current.refresh();
    });
    expect(ids()).toEqual([]);
  });

  it("holds how many are at the table, from each load and as it changes", async () => {
    const { reopen } = render(false);
    await waitFor(() => expect(current.atTable).toBe(3));

    await act(async () => {
      current.receive({ v: 1, at: "", idStory: 7, type: "table.count", atTable: 4 });
      current.receive({ v: 1, at: "", idStory: 8, type: "table.count", atTable: 9 });
    });
    expect(current.atTable).toBe(4);
    // A head count is not a line, so nothing is unread.
    expect(current.unread).toBe(0);

    sa_listChats.mock.mockImplementationOnce(async () => ({
      chats: [],
      hasPrevious: false,
      atTable: 2,
    }));
    await act(async () => {
      await current.refresh();
    });
    expect(current.atTable).toBe(2);
    reopen(true);
  });
});
