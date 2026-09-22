import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { PAGE_SIZE, type StoryCardData } from "@/lib/stories";
import { StoriesBoard } from "./stories-board";

function stories(count: number, from = 1, isFavorite = false): StoryCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    idGame: from + i,
    gameTitle: `Story ${from + i}`,
    summary: null,
    imageUrl: null,
    lastPlayed: new Date("2026-01-01T00:00:00Z"),
    systemName: null,
    systemVersion: null,
    variant: null,
    isFavorite,
    isOwner: false,
    isActive: true,
    storytellerName: null,
  }));
}

const emptyLoaders: Parameters<typeof StoriesBoard>[0]["loadMore"] = {
  favorites: async () => [],
  mine: async () => [],
  open: async () => [],
};

function renderBoard(overrides: Partial<Parameters<typeof StoriesBoard>[0]> = {}) {
  return renderWithProviders(
    <StoriesBoard
      initial={{ favorites: [], mine: stories(3), open: [] }}
      loadMore={emptyLoaders}
      setFavorite={async (_id, isFavorite) => ({ isFavorite })}
      {...overrides}
    />,
  );
}

const section = (name: string) => screen.getByRole("region", { name });

describe("StoriesBoard", () => {
  it("offers a Show inactive switch on My Stories only, which reloads that list", async () => {
    const user = userEvent.setup();
    const mine = mock.fn(async (_offset: number, showInactive?: boolean) =>
      showInactive ? stories(4, 20).map((s, i) => ({ ...s, isActive: i !== 3 })) : stories(2, 20),
    );
    renderBoard({
      initial: { favorites: stories(1, 50, true), mine: stories(3), open: stories(1, 90) },
      loadMore: { ...emptyLoaders, mine },
    });

    expect(screen.getAllByRole("switch", { name: "Show inactive" })).toHaveLength(1);
    const toggle = within(section("My Stories")).getByRole("switch", { name: "Show inactive" });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    await waitFor(() => expect(mine.mock.callCount()).toBe(1));
    expect(mine.mock.calls[0].arguments).toEqual([0, true]);
    await waitFor(() =>
      expect(within(section("My Stories")).getAllByRole("article")).toHaveLength(4),
    );
    expect(toggle).toBeChecked();

    await user.click(toggle);
    await waitFor(() => expect(mine.mock.callCount()).toBe(2));
    expect(mine.mock.calls[1].arguments).toEqual([0, false]);
    await waitFor(() =>
      expect(within(section("My Stories")).getAllByRole("article")).toHaveLength(2),
    );
  });

  it("hides Favorite Stories when there are none and orders the rest", () => {
    renderBoard();

    expect(screen.queryByRole("region", { name: "Favorite Stories" })).not.toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["My Stories", "Looking for Players"]);
  });

  it("puts Favorite Stories first when there are some", () => {
    renderBoard({ initial: { favorites: stories(1, 50, true), mine: stories(2), open: [] } });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Favorite Stories", "My Stories", "Looking for Players"]);
  });

  it("favoriting from My Stories adds the card to the top of Favorites and fills its heart", async () => {
    const user = userEvent.setup();
    const setFavorite = mock.fn(async (_id: number, isFavorite: boolean) => ({ isFavorite }));
    renderBoard({
      initial: { favorites: stories(1, 50, true), mine: stories(2), open: [] },
      setFavorite,
    });

    await user.click(within(section("My Stories")).getAllByRole("button", { name: "Add to Favorites" })[1]);

    await waitFor(() => expect(setFavorite.mock.calls[0].arguments).toEqual([2, true]));
    const favoriteTitles = within(section("Favorite Stories"))
      .getAllByRole("article")
      .map((a) => within(a).getByRole("link").textContent);
    expect(favoriteTitles).toEqual(["Story 2", "Story 50"]);
    expect(
      within(section("My Stories")).getByRole("button", { name: "Remove from Favorites" }),
    ).toBeInTheDocument();
  });

  it("un-hearting the last favorite hides the section and empties the heart elsewhere", async () => {
    const user = userEvent.setup();
    renderBoard({ initial: { favorites: stories(1, 2, true), mine: stories(2, 1).map((s) => ({ ...s, isFavorite: s.idGame === 2 })), open: [] } });

    await user.click(within(section("Favorite Stories")).getByRole("button", { name: "Remove from Favorites" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Favorite Stories" })).not.toBeInTheDocument(),
    );
    expect(within(section("My Stories")).getAllByRole("button", { name: "Add to Favorites" })).toHaveLength(2);
  });

  it("reverts the heart when the action fails", async () => {
    const user = userEvent.setup();
    renderBoard({ setFavorite: async () => { throw new Error("nope"); } });

    await user.click(within(section("My Stories")).getAllByRole("button", { name: "Add to Favorites" })[0]);

    await waitFor(() =>
      expect(within(section("My Stories")).getAllByRole("button", { name: "Add to Favorites" })).toHaveLength(3),
    );
    expect(screen.queryByRole("region", { name: "Favorite Stories" })).not.toBeInTheDocument();
  });

  it("loads the next page of a section from its current length and drops duplicates", async () => {
    const user = userEvent.setup();
    const mineLoader = mock.fn(async () => [...stories(1, PAGE_SIZE), ...stories(2, PAGE_SIZE + 1)]);
    renderBoard({
      initial: { favorites: [], mine: stories(PAGE_SIZE), open: [] },
      loadMore: { ...emptyLoaders, mine: mineLoader },
    });

    await user.click(within(section("My Stories")).getByRole("button", { name: "More" }));

    await waitFor(() => expect(within(section("My Stories")).getAllByRole("article")).toHaveLength(PAGE_SIZE + 2));
    // My Stories also passes the Show inactive switch's state, off by default.
    expect(mineLoader.mock.calls[0].arguments).toEqual([PAGE_SIZE, false]);
    expect(within(section("My Stories")).queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("flips the heart on every copy when a story appears in two sections", async () => {
    const user = userEvent.setup();
    renderBoard({ initial: { favorites: [], mine: stories(1, 7), open: stories(1, 7) } });

    await user.click(within(section("My Stories")).getByRole("button", { name: "Add to Favorites" }));

    await waitFor(() =>
      expect(
        within(section("My Stories")).getByRole("button", { name: "Remove from Favorites" }),
      ).toBeInTheDocument(),
    );
    expect(
      within(section("Looking for Players")).getByRole("button", { name: "Remove from Favorites" }),
    ).toBeInTheDocument();
    expect(within(section("Favorite Stories")).getByRole("link", { name: "Story 7" })).toBeInTheDocument();
  });

  it("pages Favorites from the server offset after an optimistic add", async () => {
    const user = userEvent.setup();
    const favoritesLoader = mock.fn(async () => stories(1, 110, true));
    renderBoard({
      initial: { favorites: stories(PAGE_SIZE, 100, true), mine: stories(1, 1), open: [] },
      loadMore: { ...emptyLoaders, favorites: favoritesLoader },
    });

    // The optimistic add puts an eleventh card in the list that never came
    // from a page; asking the server for row 11 would skip one.
    await user.click(within(section("My Stories")).getByRole("button", { name: "Add to Favorites" }));
    await waitFor(() =>
      expect(within(section("Favorite Stories")).getAllByRole("article")).toHaveLength(PAGE_SIZE + 1),
    );

    await user.click(within(section("Favorite Stories")).getByRole("button", { name: "More" }));

    await waitFor(() => expect(favoritesLoader.mock.callCount()).toBe(1));
    expect(favoritesLoader.mock.calls[0].arguments).toEqual([PAGE_SIZE]);
    await waitFor(() =>
      expect(within(section("Favorite Stories")).getAllByRole("article")).toHaveLength(PAGE_SIZE + 2),
    );
    const titles = within(section("Favorite Stories"))
      .getAllByRole("article")
      .map((a) => within(a).getByRole("link").textContent);
    expect(titles[titles.length - 1]).toBe("Story 110");
  });

  it("keeps Favorites visible with More when the client list empties but the server has more", async () => {
    const user = userEvent.setup();
    renderBoard({ initial: { favorites: stories(PAGE_SIZE, 100, true), mine: stories(3), open: [] } });

    for (let left = PAGE_SIZE; left > 0; left--) {
      await user.click(
        within(section("Favorite Stories")).getAllByRole("button", { name: "Remove from Favorites" })[0],
      );
      await waitFor(() =>
        expect(within(section("Favorite Stories")).queryAllByRole("article")).toHaveLength(left - 1),
      );
    }

    // Empty on the client but not on the server: hiding the section would
    // strand the rest of the favorites behind a button that no longer exists.
    expect(section("Favorite Stories")).toBeInTheDocument();
    expect(within(section("Favorite Stories")).getByRole("button", { name: "More" })).toBeInTheDocument();
  });
});
