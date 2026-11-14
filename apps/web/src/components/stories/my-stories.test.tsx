import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { UserPreferenceMap } from "@/lib/user-preference-schemas";
import { PAGE_SIZE, type StoryCardData } from "@/lib/stories";
import type { MyStoryListQuery } from "@/lib/story-list-schemas";

const story = (
  idStory: number,
  title: string,
  over: Partial<StoryCardData> = {},
): StoryCardData => ({
  idStory,
  title,
  summary: null,
  imageUrl: null,
  lastPlayed: new Date("2026-01-01T00:00:00Z"),
  systemName: null,
  systemVersion: null,
  variant: null,
  isFavorite: false,
  isOwner: true,
  isPlayer: false,
  isPublic: false,
  isActive: true,
  isLookingForPlayers: false,
  storytellerName: null,
  hasOpenSession: false,
  playerCount: 2,
  waitingCount: 0,
  presentCount: 0,
  sessionCount: 5,
  playMinutes: 60,
  ...over,
});

const vampire = story(-15, "Vampire");
const kildealg = story(-16, "Kildealg", { isFavorite: true });

// Answers by the query: a search for "kil" finds Kildealg alone; anything
// else both, Kildealg first when sorted by favorite.
const sa_listMyStoryPage = mock.fn(async (input: MyStoryListQuery) => {
  if (input.search === "kil") return [kildealg];
  if (input.sortBy === "favorite") return [kildealg, vampire];
  return [vampire, kildealg];
});
const sa_listFavoriteStories = mock.fn(async (_offset: number) => [story(200, "Story 200")]);
const sa_setFavorite = mock.fn(async (_idStory: number, isFavorite: boolean) => ({ isFavorite }));
const sa_setUserPreference = mock.fn(async (_input: unknown) => ({ ok: true as const }));

type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];
let MyStories: typeof import("./my-stories").MyStories;

function renderPage(
  preferences: UserPreferenceMap = {},
  initial = [vampire, kildealg],
  initialFavorites: StoryCardData[] = [],
) {
  renderWithProviders(
    <UserPreferencesProvider preferences={preferences}>
      <MyStories initial={initial} initialFavorites={initialFavorites} />
    </UserPreferencesProvider>,
  );
}

const titles = (rows: HTMLElement[]) => rows.map((row) => row.getAttribute("aria-label"));

describe("MyStories", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_listFavoriteStories, sa_listMyStoryPage, sa_setFavorite },
    });
    mock.module("@/components/preferences/actions", { namedExports: { sa_setUserPreference } });
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
    ({ MyStories } = await import("./my-stories"));
  });

  beforeEach(() => {
    sa_listMyStoryPage.mock.resetCalls();
    sa_listFavoriteStories.mock.resetCalls();
    sa_setFavorite.mock.resetCalls();
    sa_setUserPreference.mock.resetCalls();
  });
  afterEach(() => cleanup());

  it("opens on the cards of My Stories, with no Favorites section while there are none", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "My Stories" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Favorites" })).toBeNull();
    expect(screen.getByRole("article", { name: "Vampire" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Kildealg" })).toBeInTheDocument();
    // The page opened with its first page, so nothing was asked for.
    expect(sa_listMyStoryPage.mock.callCount()).toBe(0);
  });

  it("puts the search, New story and the view toggle at the end of the heading line", () => {
    renderPage();

    const heading = screen.getByRole("heading", { name: "My Stories" });
    const line = heading.parentElement!.parentElement!;
    const search = screen.getByRole("searchbox", { name: "Search stories" });
    const newStory = screen.getByRole("link", { name: "New story" });
    const group = screen.getByRole("group", { name: "View" });
    for (const element of [search, newStory, group]) expect(line).toContainElement(element);
    expect(
      search.compareDocumentPosition(newStory) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(newStory.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(newStory).toHaveAttribute("href", "/stories/new");
  });

  it("switches to the list from the toggle and keeps it as the user's preference", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("article", { name: "Vampire" })).toBeNull();
    expect(screen.getByRole("table", { name: "Stories" })).toBeInTheDocument();
    await waitFor(() => expect(sa_setUserPreference.mock.callCount()).toBe(1));
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "stories.view",
      value: "list",
    });
  });

  it("sorts the list on the server from a header", async () => {
    const user = userEvent.setup();
    renderPage({ "stories.view": "list" });

    expect(titles(screen.getAllByRole("row").slice(1))).toEqual(["Vampire", "Kildealg"]);
    await user.click(screen.getByRole("button", { name: "Favorite" }));
    await waitFor(() => expect(sa_listMyStoryPage.mock.callCount()).toBe(1));
    expect(sa_listMyStoryPage.mock.calls[0].arguments[0]).toMatchObject({
      sortBy: "favorite",
      offset: 0,
    });
    await waitFor(() =>
      expect(titles(screen.getAllByRole("row").slice(1))).toEqual(["Kildealg", "Vampire"]),
    );
  });

  it("searches once the typing stops, and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole("searchbox", { name: "Search stories" }), "kil");
    await waitFor(() =>
      expect(sa_listMyStoryPage.mock.calls.at(-1)?.arguments[0]).toEqual({
        search: "kil",
        showInactive: false,
        sortBy: "recent",
        sortDesc: true,
        offset: 0,
      }),
    );
    // One question for the whole word, not one per letter.
    expect(sa_listMyStoryPage.mock.callCount()).toBe(1);
    await waitFor(() => expect(screen.queryByRole("article", { name: "Vampire" })).toBeNull());
    expect(screen.getByRole("article", { name: "Kildealg" })).toBeInTheDocument();
  });

  it("asks for retired stories too from Show inactive", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("switch", { name: "Show inactive" }));
    await waitFor(() =>
      expect(sa_listMyStoryPage.mock.calls.at(-1)?.arguments[0]).toMatchObject({
        showInactive: true,
      }),
    );
  });

  it("turns a heart at once and saves it", async () => {
    const user = userEvent.setup();
    renderPage({ "stories.view": "list" });

    const row = screen.getByRole("row", { name: "Vampire" });
    await user.click(within(row).getByRole("button", { name: "Add to Favorites" }));
    expect(within(row).getByRole("button", { name: "Remove from Favorites" })).toBeInTheDocument();
    await waitFor(() => expect(sa_setFavorite.mock.callCount()).toBe(1));
    expect(sa_setFavorite.mock.calls[0].arguments).toEqual([-15, true]);
  });

  it("puts the favorites first in a section of their own on the cards, but not in the list", async () => {
    const user = userEvent.setup();
    renderPage({}, [vampire, kildealg], [kildealg]);

    const favorites = screen.getByRole("region", { name: "Favorites" });
    const mine = screen.getByRole("region", { name: "My Stories" });
    expect(favorites.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(favorites).getByRole("article", { name: "Kildealg" })).toBeInTheDocument();
    expect(within(favorites).queryByRole("article", { name: "Vampire" })).toBeNull();
    // My Stories still holds every story, the favorite among them.
    expect(within(mine).getByRole("article", { name: "Kildealg" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.queryByRole("region", { name: "Favorites" })).toBeNull();
  });

  it("moves a story into Favorites and out again by its heart on either list", async () => {
    const user = userEvent.setup();
    renderPage({}, [vampire, kildealg], [kildealg]);
    const favorites = () => screen.getByRole("region", { name: "Favorites" });
    const mine = screen.getByRole("region", { name: "My Stories" });

    const vampireCard = within(mine).getByRole("article", { name: "Vampire" });
    await user.click(within(vampireCard).getByRole("button", { name: "Add to Favorites" }));
    expect(titles(within(favorites()).getAllByRole("article"))).toEqual(["Vampire", "Kildealg"]);

    const kildealgFavorite = within(favorites()).getByRole("article", { name: "Kildealg" });
    await user.click(
      within(kildealgFavorite).getByRole("button", { name: "Remove from Favorites" }),
    );
    expect(titles(within(favorites()).getAllByRole("article"))).toEqual(["Vampire"]);
    // The same story's card in My Stories turns its heart too.
    const kildealgCard = within(mine).getByRole("article", { name: "Kildealg" });
    expect(
      within(kildealgCard).getByRole("button", { name: "Add to Favorites" }),
    ).toBeInTheDocument();

    await waitFor(() => expect(sa_setFavorite.mock.callCount()).toBe(2));
    expect(sa_setFavorite.mock.calls.map((call) => call.arguments)).toEqual([
      [-15, true],
      [-16, false],
    ]);
  });

  it("takes a story back out of Favorites when its heart cannot be saved", async () => {
    const user = userEvent.setup();
    sa_setFavorite.mock.mockImplementationOnce(async () => {
      throw new Error("refused");
    });
    renderPage();

    const vampireCard = screen.getByRole("article", { name: "Vampire" });
    await user.click(within(vampireCard).getByRole("button", { name: "Add to Favorites" }));
    await waitFor(() =>
      expect(within(vampireCard).getByRole("button", { name: "Add to Favorites" })).toBeEnabled(),
    );
    expect(screen.queryByRole("region", { name: "Favorites" })).toBeNull();
  });

  it("brings the next favorites from the Favorites section's own More", async () => {
    const user = userEvent.setup();
    const full = Array.from({ length: PAGE_SIZE }, (_, i) =>
      story(i + 101, `Favorite ${i + 1}`, { isFavorite: true }),
    );
    renderPage({}, [vampire, kildealg], full);

    const favorites = screen.getByRole("region", { name: "Favorites" });
    await user.click(within(favorites).getByRole("button", { name: "More" }));
    await waitFor(() => expect(sa_listFavoriteStories.mock.callCount()).toBe(1));
    expect(sa_listFavoriteStories.mock.calls[0].arguments).toEqual([PAGE_SIZE]);
    expect(
      await within(favorites).findByRole("article", { name: "Story 200" }),
    ).toBeInTheDocument();
    expect(within(favorites).queryByRole("button", { name: "More" })).toBeNull();
    expect(sa_listMyStoryPage.mock.callCount()).toBe(0);
  });

  it("brings the next page of the same query from More", async () => {
    const user = userEvent.setup();
    const full = Array.from({ length: 24 }, (_, i) => story(i + 1, `Story ${i + 1}`));
    sa_listMyStoryPage.mock.mockImplementationOnce(async () => [story(100, "Story 100")]);
    renderPage({}, full);

    await user.click(screen.getByRole("button", { name: "More" }));
    await waitFor(() => expect(sa_listMyStoryPage.mock.callCount()).toBe(1));
    expect(sa_listMyStoryPage.mock.calls[0].arguments[0]).toMatchObject({ offset: 24 });
    expect(await screen.findByRole("article", { name: "Story 100" })).toBeInTheDocument();
    // A short page means there is no more.
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });
});
