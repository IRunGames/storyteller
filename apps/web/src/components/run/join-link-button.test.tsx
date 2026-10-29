import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

const sa_getJoinLink = mock.fn(async (_idStory: number) => ({
  code: "AbCdEfGhIjKl",
  joined: 2,
  cap: 3,
}));

const sa_getJoinCount = mock.fn(async (_idStory: number) => ({ joined: 0, cap: 3 }));

type Player = {
  idUser: string;
  name: string;
  isGuest: boolean;
  status: "PRESENT" | "AWAY" | "WAITING" | "LEFT" | null;
};
const ACCOUNT_ID = "01a0b60c-0000-7000-8000-000000000001";
const GUEST_ID = "01a0b60c-0000-7000-8000-000000000002";
let players: Player[] = [];
const sa_listLinkPlayers = mock.fn(async (_idStory: number) => players);
const sa_removeLinkPlayer = mock.fn(async (_idStory: number, idUser: string) => {
  players = players.filter((player) => player.idUser !== idUser);
  return { ok: true as const };
});

let JoinLinkButton: typeof import("./join-link-button").JoinLinkButton;

describe("JoinLinkButton", () => {
  before(async () => {
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: { sa_getJoinLink, sa_getJoinCount, sa_listLinkPlayers, sa_removeLinkPlayer },
    });
    ({ JoinLinkButton } = await import("./join-link-button"));
  });

  beforeEach(() => {
    sa_getJoinLink.mock.resetCalls();
    sa_getJoinCount.mock.resetCalls();
    sa_getJoinCount.mock.mockImplementation(async () => ({ joined: 0, cap: 3 }));
    sa_listLinkPlayers.mock.resetCalls();
    sa_removeLinkPlayer.mock.resetCalls();
    players = [
      { idUser: ACCOUNT_ID, name: "Harry", isGuest: false, status: "PRESENT" },
      { idUser: GUEST_ID, name: "Sleepy Otter", isGuest: true, status: "AWAY" },
    ];
  });

  it("fetches the link as it opens, ready to copy, with how many have joined by it", async () => {
    const u = userEvent.setup();
    renderWithProviders(<JoinLinkButton idStory={7} />);
    expect(sa_getJoinLink.mock.callCount()).toBe(0);

    await u.click(screen.getByRole("button", { name: "Join link" }));

    const field = await screen.findByRole("textbox", { name: "Join link" });
    expect(field).toHaveValue(`${window.location.origin}/join/AbCdEfGhIjKl`);
    expect(screen.getByText(/2 of 3 have joined this way/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy the link" })).toBeInTheDocument();
    expect(sa_getJoinLink.mock.calls[0].arguments).toEqual([7]);
  });

  it("says so when the link cannot be had", async () => {
    sa_getJoinLink.mock.mockImplementationOnce(async () => null as never);
    const u = userEvent.setup();
    renderWithProviders(<JoinLinkButton idStory={7} />);

    await u.click(screen.getByRole("button", { name: "Join link" }));

    expect(await screen.findByText("The link could not be made. Try again.")).toBeInTheDocument();
  });

  it("shows no chip until someone has joined by the link", async () => {
    renderWithProviders(<JoinLinkButton idStory={7} />);

    await waitFor(() => expect(sa_getJoinCount.mock.callCount()).toBe(1));
    expect(screen.getByRole("button", { name: "Join link" })).toBeInTheDocument();
    expect(screen.queryByText("0/3")).toBeNull();
  });

  it("shows how many joined of how many on a chip, and counts again as the table changes", async () => {
    sa_getJoinCount.mock.mockImplementation(async () => ({ joined: 2, cap: 3 }));
    const { rerender } = renderWithProviders(<JoinLinkButton idStory={7} atTable={1} />);

    expect(await screen.findByText("2/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join link, 2 of 3 joined" })).toBeInTheDocument();

    sa_getJoinCount.mock.mockImplementation(async () => ({ joined: 3, cap: 3 }));
    rerender(<JoinLinkButton idStory={7} atTable={2} />);
    expect(await screen.findByText("3/3")).toBeInTheDocument();
  });

  it("loads who joined only when asked, with where each is", async () => {
    const u = userEvent.setup();
    renderWithProviders(<JoinLinkButton idStory={7} />);
    await u.click(screen.getByRole("button", { name: "Join link" }));
    await screen.findByRole("textbox", { name: "Join link" });
    expect(sa_listLinkPlayers.mock.callCount()).toBe(0);

    await u.click(screen.getByRole("button", { name: "Show who joined" }));

    const list = await screen.findByRole("list", { name: "Joined by the link" });
    const [harry, otter] = within(list).getAllByRole("listitem");
    expect(harry).toHaveTextContent("Harry");
    expect(harry).toHaveTextContent("At the table");
    expect(otter).toHaveTextContent("Sleepy Otter");
    expect(otter).toHaveTextContent("Guest");
    expect(otter).toHaveTextContent("Away");
  });

  it("removes someone once the storyteller says so, and counts again", async () => {
    const u = userEvent.setup();
    renderWithProviders(<JoinLinkButton idStory={7} />);
    await u.click(screen.getByRole("button", { name: "Join link" }));
    await u.click(await screen.findByRole("button", { name: "Show who joined" }));

    await u.click(await screen.findByRole("button", { name: "Remove Sleepy Otter" }));
    expect(screen.getByText("Remove Sleepy Otter? A guest is deleted.")).toBeInTheDocument();
    expect(sa_removeLinkPlayer.mock.callCount()).toBe(0);
    const counted = sa_getJoinCount.mock.callCount();
    await u.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByText("Sleepy Otter")).toBeNull());
    expect(sa_removeLinkPlayer.mock.calls[0].arguments).toEqual([7, GUEST_ID]);
    expect(sa_getJoinCount.mock.callCount()).toBe(counted + 1);
  });

  it("keeps someone when the storyteller thinks better of it", async () => {
    const u = userEvent.setup();
    renderWithProviders(<JoinLinkButton idStory={7} />);
    await u.click(screen.getByRole("button", { name: "Join link" }));
    await u.click(await screen.findByRole("button", { name: "Show who joined" }));

    await u.click(await screen.findByRole("button", { name: "Remove Harry" }));
    await u.click(screen.getByRole("button", { name: "Keep" }));

    expect(screen.getByRole("button", { name: "Remove Harry" })).toBeInTheDocument();
    expect(sa_removeLinkPlayer.mock.callCount()).toBe(0);
  });
});
