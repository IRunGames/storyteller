import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ReactElement } from "react";
import { renderWithProviders as renderBare } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";

// The list marks the viewer's own seat, so it reads the signed-in user.
// Someone who is not in it unless a case seats them.
const viewer: CurrentUser = {
  id: "u-viewer",
  name: "Viewer",
  email: "viewer@example.test",
  image: null,
  nickName: null,
  idUserType: -10,
  isAnonymous: false,
};
const renderWithProviders = (ui: ReactElement, who: CurrentUser = viewer) =>
  renderBare(<UserProvider user={who}>{ui}</UserProvider>);
import type { PlayerMatch, StoryPlayer } from "@/lib/stories";

const players: StoryPlayer[] = [
  { idUser: "u1", name: "PaulKhash", image: null },
  { idUser: "u2", name: "Pol", image: "https://rpg.irun.games/images/pol.png" },
];

const luna: PlayerMatch = {
  idUser: "u-luna",
  name: "Luna",
  email: "luna.lovegood@example.com",
  image: null,
};

const sa_searchPlayers = mock.fn<(idStory: number, query: string) => Promise<PlayerMatch[]>>(
  async () => [luna],
);
const sa_addStoryPlayers = mock.fn<(idStory: number, ids: string[]) => Promise<StoryPlayer[]>>(
  async () => [{ idUser: luna.idUser, name: luna.name, image: null }],
);

const sa_removeStoryPlayer = mock.fn<(idStory: number, idUser: string) => Promise<{ ok: boolean }>>(
  async () => ({ ok: true }),
);

const sa_leaveStory = mock.fn<(idStory: number) => Promise<{ ok: boolean }>>(async () => ({
  ok: true,
}));
const sa_joinStory = mock.fn<(idStory: number) => Promise<{ ok: true; player: StoryPlayer }>>(
  async () => ({ ok: true, player: { idUser: "u-viewer", name: "Viewer", image: null } }),
);
const router = { refresh: mock.fn<() => void>() };

let StoryPlayers: typeof import("./story-players").StoryPlayers;

describe("StoryPlayers", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: {
        sa_searchPlayers,
        sa_addStoryPlayers,
        sa_inviteToStory: async () => ({ ok: false, errors: {} }),
        sa_listStoryInvitations: async () => [],
        sa_revokeStoryInvitation: async () => ({ ok: true }),
        sa_removeStoryPlayer,
        sa_leaveStory,
        sa_joinStory,
      },
    });
    // The leave button refreshes the page once the seat is given up.
    mock.module("next/navigation", { namedExports: { useRouter: () => router } });
    ({ StoryPlayers } = await import("./story-players"));
  });

  beforeEach(() => {
    sa_searchPlayers.mock.resetCalls();
    sa_addStoryPlayers.mock.resetCalls();
    sa_removeStoryPlayer.mock.resetCalls();
    sa_leaveStory.mock.resetCalls();
  });

  it("carries the section heading under the id it is given", () => {
    renderWithProviders(
      <StoryPlayers idStory={7} headingId="players" initial={[]} isOwner={false} />,
    );

    expect(screen.getByRole("heading", { name: "Players" })).toHaveAttribute("id", "players");
  });

  it("lists the players by name, with an avatar each", () => {
    renderWithProviders(
      <StoryPlayers idStory={7} headingId="players" initial={players} isOwner={false} />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("PaulKhash")).toBeInTheDocument();
    expect(within(items[1]).getByText("Pol")).toBeInTheDocument();
    // Chakra keeps the image hidden until it has loaded, which jsdom never
    // does; a hidden image has no accessible name, so it is found first and
    // its alt checked after.
    const image = within(items[1]).getByRole("img", { hidden: true });
    expect(image).toHaveAttribute("alt", "Pol");
    expect(image).toHaveAttribute("src", "https://rpg.irun.games/images/pol.png");
  });

  it("says so when there are no players yet", () => {
    renderWithProviders(
      <StoryPlayers idStory={7} headingId="players" initial={[]} isOwner={false} />,
    );

    expect(screen.getByText("No players yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("offers Invite Players to the storyteller only", () => {
    const { unmount } = renderWithProviders(
      <StoryPlayers idStory={7} headingId="players" initial={[]} isOwner={true} />,
    );
    expect(screen.getByRole("button", { name: "Invite Players" })).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <StoryPlayers idStory={7} headingId="players" initial={[]} isOwner={false} />,
    );
    expect(screen.queryByRole("button", { name: "Invite Players" })).not.toBeInTheDocument();
  });

  it("adds the invited players to the list once they are saved", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <StoryPlayers idStory={7} headingId="players" initial={players} isOwner={true} />,
    );

    await u.click(screen.getByRole("button", { name: "Invite Players" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite players" });
    await u.type(within(dialog).getByRole("searchbox", { name: "Search players" }), "lu");
    await u.click(await within(dialog).findByRole("checkbox", { name: /Luna/ }));
    await u.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    expect(within(screen.getAllByRole("listitem")[2]).getByText("Luna")).toBeInTheDocument();
    expect(screen.queryByText("No players yet.")).not.toBeInTheDocument();
  });

  it("offers the storyteller a way to unseat each player, and nobody else", () => {
    const { unmount } = renderWithProviders(
      <StoryPlayers idStory={-1} headingId="h" initial={players} isOwner={false} />,
    );
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<StoryPlayers idStory={-1} headingId="h" initial={players} isOwner />);
    for (const player of players) {
      expect(screen.getByRole("button", { name: `Remove ${player.name}` })).toBeInTheDocument();
    }
  });

  it("drops a player from the list once they have been removed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryPlayers idStory={-1} headingId="h" initial={players} isOwner />);

    await user.click(screen.getByRole("button", { name: `Remove ${players[0].name}` }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.queryByText(players[0].name)).not.toBeInTheDocument();
    });
    // The rest keep their seats.
    expect(screen.getByText(players[1].name)).toBeInTheDocument();
  });

  describe("the viewer's own seat", () => {
    // The viewer is PaulKhash, the first player.
    const me: CurrentUser = {
      id: "u1",
      name: "Paul Khash",
      email: "paul@example.test",
      image: null,
      nickName: "PaulKhash",
      idUserType: -10,
      isAnonymous: false,
    };

    it("says Me! in place of their name, with their picture and a way to leave", () => {
      renderWithProviders(
        <StoryPlayers idStory={7} headingId="h" initial={players} isOwner={false} />,
        me,
      );

      const items = screen.getAllByRole("listitem");
      expect(within(items[0]).getByText("Me!")).toBeInTheDocument();
      expect(within(items[0]).queryByText("PaulKhash")).not.toBeInTheDocument();
      expect(within(items[0]).getByRole("button", { name: "Leave game" })).toBeInTheDocument();
      // Everyone else keeps their name, and no way to leave on their behalf.
      expect(within(items[1]).getByText("Pol")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Leave game" })).toHaveLength(1);
    });

    it("drops their seat from the list once they have left", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <StoryPlayers idStory={7} headingId="h" initial={players} isOwner={false} />,
        me,
      );

      await user.click(screen.getByRole("button", { name: "Leave game" }));
      const popover = await screen.findByRole("dialog", { name: "Leave this game?" });
      await user.click(within(popover).getByRole("button", { name: "Leave" }));

      await waitFor(() => expect(screen.queryByText("Me!")).not.toBeInTheDocument());
      expect(sa_leaveStory.mock.calls[0].arguments).toEqual([7]);
      expect(screen.getByText("Pol")).toBeInTheDocument();
    });
  });

  describe("Join", () => {
    it("is offered beside the heading while the story is open, to someone without a seat", () => {
      renderWithProviders(
        <StoryPlayers idStory={7} headingId="h" initial={players} isOwner={false} isOpenToJoin />,
      );
      expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
    });

    it("is not offered when the story is not open, to its storyteller, or to a player already seated", () => {
      const { unmount } = renderWithProviders(
        <StoryPlayers idStory={7} headingId="h" initial={players} isOwner={false} />,
      );
      expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
      unmount();

      const owner = renderWithProviders(
        <StoryPlayers idStory={7} headingId="h" initial={players} isOwner isOpenToJoin />,
      );
      expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
      owner.unmount();

      // The viewer is already PaulKhash's seat.
      renderWithProviders(
        <StoryPlayers idStory={7} headingId="h" initial={players} isOwner={false} isOpenToJoin />,
        { ...viewer, id: "u1" },
      );
      expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
    });

    it("seats the viewer as Me!, with Leave game in place of Join", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <StoryPlayers idStory={7} headingId="h" initial={players} isOwner={false} isOpenToJoin />,
      );

      await user.click(screen.getByRole("button", { name: "Join" }));

      expect(await screen.findByText("Me!")).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
      expect(screen.getByRole("button", { name: "Leave game" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
    });
  });
});
