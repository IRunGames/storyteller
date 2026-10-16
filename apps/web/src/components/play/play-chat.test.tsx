import { afterEach, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, screen, within } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import { chatLog } from "@/lib/chat-log";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -2,
};

let PlayChat: typeof import("./play-chat").PlayChat;

describe("PlayChat", () => {
  before(async () => {
    Element.prototype.scrollIntoView = () => {};
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    ({ PlayChat } = await import("./play-chat"));
  });

  afterEach(() => chatLog.clear());

  const render = () =>
    renderWithProviders(
      <UserProvider user={user}>
        <PlayChat id="chat" />
      </UserProvider>,
    );

  it("shows the lines the table posts, in place of the sample, whenever they come", async () => {
    chatLog.post({ from: "Storyteller", text: "untapped A hooded figure" });
    render();
    const chat = screen.getByRole("region", { name: "Table Chat" });
    // Posted before the chat opened, so it is there on opening.
    expect(within(chat).getByText("untapped A hooded figure")).toBeInTheDocument();
    expect(within(chat).queryByText("Sample conversation")).not.toBeInTheDocument();

    await act(async () => {
      chatLog.post({ from: "Storyteller", text: "untapped Zed" });
    });
    expect(within(chat).getByText("untapped Zed")).toBeInTheDocument();
    expect(within(chat).getAllByText("Storyteller")).toHaveLength(2);
  });
});
