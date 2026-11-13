import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import { PAGE_SIZE, type StoryCardData } from "@/lib/stories";
import { USER_TYPES } from "@/lib/user-types";

function stories(count: number, from = 1): StoryCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    idStory: from + i,
    title: `Story ${from + i}`,
    summary: null,
    imageUrl: null,
    lastPlayed: new Date("2026-01-01T00:00:00Z"),
    systemName: null,
    systemVersion: null,
    variant: null,
    isFavorite: true,
    isOwner: false,
    isActive: true,
    isLookingForPlayers: false,
    storytellerName: null,
    hasOpenSession: false,
    playerCount: 0,
    waitingCount: 0,
    isPlayer: false,
    isPublic: false,
    presentCount: 0,
    sessionCount: 0,
    playMinutes: 0,
    buildSceneId: null,
  }));
}

// The component imports its server actions itself, so the module is mocked
// before the dynamic import below loads it.
const sa_listFavoriteStories = mock.fn(async (_offset: number): Promise<StoryCardData[]> => []);
const sa_setFavorite = mock.fn(async (_idStory: number, isFavorite: boolean) => ({ isFavorite }));

let HomeFavorites: typeof import("./home-favorites").HomeFavorites;

const section = () => screen.getByRole("region", { name: "Favorites" });

// The block reads the signed-in user's type for its first-story button, so
// it renders under a UserProvider: a storyteller unless the test says.
function renderFavorites(
  initial: StoryCardData[],
  idUserType: number = USER_TYPES.unpaidStoryteller,
) {
  const user: CurrentUser = {
    id: "0190f5e2-1f2a-7c3b-9b1e-2f7c5d3a4b61",
    name: "Fixture Storyteller",
    email: "fixture-storyteller@example.com",
    image: null,
    nickName: null,
    idUserType,
    isAnonymous: false,
  };
  return renderWithProviders(
    <UserProvider user={user}>
      <HomeFavorites initial={initial} />
    </UserProvider>,
  );
}

describe("HomeFavorites", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_listFavoriteStories, sa_setFavorite },
    });
    ({ HomeFavorites } = await import("./home-favorites"));
  });

  beforeEach(() => {
    sa_listFavoriteStories.mock.resetCalls();
    sa_listFavoriteStories.mock.mockImplementation(async () => []);
    sa_setFavorite.mock.resetCalls();
    sa_setFavorite.mock.mockImplementation(async (_id, isFavorite) => ({ isFavorite }));
  });

  it("shows the favorites it was given as a titled section", () => {
    renderFavorites(stories(2));

    expect(within(section()).getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("points an empty list at the Stories page", () => {
    renderFavorites([]);

    expect(within(section()).getByRole("link", { name: "Stories page" })).toHaveAttribute(
      "href",
      "/stories",
    );
  });

  it("offers a storyteller with an empty list their first story, on the way back to Stories", () => {
    renderFavorites([]);

    expect(
      within(section()).getByRole("link", { name: "Go create your first story" }),
    ).toHaveAttribute("href", "/stories/new?redirectTo=%2Fstories");
  });

  it("keeps the first-story button from a player", () => {
    renderFavorites([], USER_TYPES.paidPlayer);

    expect(
      within(section()).queryByRole("link", { name: "Go create your first story" }),
    ).not.toBeInTheDocument();
  });

  it("removes a card when its heart is clicked, and tells the server", async () => {
    const user = userEvent.setup();
    renderFavorites(stories(2));

    const first = screen.getByRole("article", { name: "Story 1" });
    await user.click(within(first).getByRole("button", { name: "Remove from Favorites" }));

    await waitFor(() => expect(sa_setFavorite.mock.callCount()).toBe(1));
    expect(sa_setFavorite.mock.calls[0].arguments).toEqual([1, false]);
    expect(screen.queryByRole("article", { name: "Story 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Story 2" })).toBeInTheDocument();
  });

  it("puts the card back when the server refuses", async () => {
    const user = userEvent.setup();
    sa_setFavorite.mock.mockImplementation(async () => {
      throw new Error("nope");
    });
    renderFavorites(stories(2));

    const first = screen.getByRole("article", { name: "Story 1" });
    await user.click(within(first).getByRole("button", { name: "Remove from Favorites" }));

    await waitFor(() => expect(sa_setFavorite.mock.callCount()).toBe(1));
    await waitFor(() =>
      expect(screen.getByRole("article", { name: "Story 1" })).toBeInTheDocument(),
    );
    expect(within(section()).getAllByRole("article")).toHaveLength(2);
  });

  it("pages with More from the row after the last one the server sent", async () => {
    const user = userEvent.setup();
    sa_listFavoriteStories.mock.mockImplementation(async (offset) => stories(3, offset + 1));
    renderFavorites(stories(PAGE_SIZE));

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() => expect(sa_listFavoriteStories.mock.callCount()).toBe(1));
    expect(sa_listFavoriteStories.mock.calls[0].arguments).toEqual([PAGE_SIZE]);
    await waitFor(() =>
      expect(within(section()).getAllByRole("article")).toHaveLength(PAGE_SIZE + 3),
    );
    // A short page means the well is dry.
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });
});
