import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { PAGE_SIZE, type StoryCardData } from "@/lib/stories";

// The hearts' action, which the board reaches through useFavorites.
type SetFavoriteResult = { ok: true; isFavorite: boolean } | { ok: false; error: string };
const sa_setFavorite = mock.fn(
  async (_id: number, isFavorite: boolean): Promise<SetFavoriteResult> => ({
    ok: true,
    isFavorite,
  }),
);
// The next page, which the board asks for from the number of rows it holds.
const sa_listLookingForPlayers = mock.fn(async (_offset: number): Promise<StoryCardData[]> => []);
let StoriesBoard: typeof import("./stories-board").StoriesBoard;

function stories(count: number, from = 1, isFavorite = false): StoryCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    idStory: from + i,
    title: `Story ${from + i}`,
    summary: null,
    imageUrl: null,
    lastPlayed: new Date("2026-01-01T00:00:00Z"),
    systemName: null,
    systemVersion: null,
    variant: null,
    isFavorite,
    isOwner: false,
    isActive: true,
    isLookingForPlayers: true,
    storytellerName: null,
    hasOpenSession: false,
    playerCount: 0,
    waitingCount: 0,
    isPlayer: false,
    isPublic: false,
    presentCount: 0,
    sessionCount: 0,
    playMinutes: 0,
  }));
}

const section = () => screen.getByRole("region", { name: "Looking for Players" });

describe("StoriesBoard", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_setFavorite, sa_listLookingForPlayers },
    });
    ({ StoriesBoard } = await import("./stories-board"));
  });

  beforeEach(() => {
    sa_setFavorite.mock.resetCalls();
    sa_setFavorite.mock.mockImplementation(async (_id, isFavorite) => ({ ok: true, isFavorite }));
    sa_listLookingForPlayers.mock.resetCalls();
    sa_listLookingForPlayers.mock.mockImplementation(async () => []);
  });

  it("shows Looking for Players alone, with its own empty text", () => {
    renderWithProviders(<StoriesBoard initial={[]} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Looking for Players"]);
    expect(
      within(section()).getByText("No stories are looking for players right now."),
    ).toBeInTheDocument();
  });

  it("fills a heart without a Favorites section to land in", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoriesBoard initial={stories(2, 90)} />);

    const hearts = within(section()).getAllByRole("button", { name: "Add to Favorites" });
    await user.click(hearts[0]);

    await waitFor(() => expect(sa_setFavorite.mock.calls[0].arguments).toEqual([90, true]));
    expect(
      within(section()).getByRole("button", { name: "Remove from Favorites" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Favorites" })).not.toBeInTheDocument();
  });

  it("reverts the heart when the action fails", async () => {
    const user = userEvent.setup();
    sa_setFavorite.mock.mockImplementationOnce(async () => {
      throw new Error("nope");
    });
    renderWithProviders(<StoriesBoard initial={stories(3)} />);

    await user.click(within(section()).getAllByRole("button", { name: "Add to Favorites" })[0]);

    await waitFor(() =>
      expect(within(section()).getAllByRole("button", { name: "Add to Favorites" })).toHaveLength(
        3,
      ),
    );
  });

  it("loads the next page from its current length and drops duplicates", async () => {
    const user = userEvent.setup();
    sa_listLookingForPlayers.mock.mockImplementation(async () => [
      ...stories(1, PAGE_SIZE),
      ...stories(2, PAGE_SIZE + 1),
    ]);
    renderWithProviders(<StoriesBoard initial={stories(PAGE_SIZE)} />);

    await user.click(within(section()).getByRole("button", { name: "More" }));

    await waitFor(() =>
      expect(within(section()).getAllByRole("article")).toHaveLength(PAGE_SIZE + 2),
    );
    expect(sa_listLookingForPlayers.mock.calls[0].arguments).toEqual([PAGE_SIZE]);
    // A short page means the well is dry.
    expect(within(section()).queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("keeps the list and the More button when the next page fails", async () => {
    const user = userEvent.setup();
    sa_listLookingForPlayers.mock.mockImplementationOnce(async () => {
      throw new Error("nope");
    });
    renderWithProviders(<StoriesBoard initial={stories(PAGE_SIZE)} />);

    await user.click(within(section()).getByRole("button", { name: "More" }));

    await waitFor(() => expect(sa_listLookingForPlayers.mock.callCount()).toBe(1));
    expect(within(section()).getAllByRole("article")).toHaveLength(PAGE_SIZE);
    expect(within(section()).getByRole("button", { name: "More" })).toBeInTheDocument();
  });
});
