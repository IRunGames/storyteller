import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
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

let StoryPlayers: typeof import("./story-players").StoryPlayers;

describe("StoryPlayers", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_searchPlayers, sa_addStoryPlayers, sa_removeStoryPlayer },
    });
    ({ StoryPlayers } = await import("./story-players"));
  });

  beforeEach(() => {
    sa_searchPlayers.mock.resetCalls();
    sa_addStoryPlayers.mock.resetCalls();
    sa_removeStoryPlayer.mock.resetCalls();
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
});
