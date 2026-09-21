# Story Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A heart button on every story card that adds or removes the story from the user's favorites, with the Favorite Stories section moved to the top of the Stories page and hidden when empty.

**Architecture:** Every card learns its own `isFavorite` from the list actions (an `exists` subquery on `game_favorites` for the current user). A new `setFavorite` server action writes the row. A client `StoriesBoard` now owns the three lists and their paging, so a heart toggled in one section updates the Favorites section in place without a page refresh; `StorySection` becomes presentational.

**Tech Stack:** Next.js 16 App Router, React 19, Chakra UI v3, Drizzle ORM 0.45 on `pg`, Zod 4, `node:test` + Testing Library.

**Spec:** Approved in conversation on 2026-09-20 (design message under "Data / Page state / Layout / Card / Tests"); this plan is the written form. Parent spec for the page: `docs/superpowers/specs/2026-09-20-stories-page-design.md`.

## Global Constraints

- **Never commit.** Leave every change in the working tree. Steps end at "tests pass".
- Run web tests with `just test` from anywhere (or `npm test` in `apps/web`); filter with `just test --test-name-pattern "<pattern>"`. Type-check with `npx tsc --noEmit` and lint with `npm run lint`, both inside `apps/web`. The suite currently has 107 passing tests.
- Every server action begins with `const user = await requireUser()` and never trusts a client-supplied id for authorization. Favorites are always written and read for `user.id` only.
- `PAGE_SIZE = 10`. Section order on the page: Favorite Stories, My Stories, Looking for Players. The Favorites section renders only when it has at least one story.
- Heart accessible names are exactly "Add to favorites" and "Remove from favorites"; the button carries `aria-pressed`.
- No new npm dependencies. Icons are hand-drawn SVGs in `apps/web/src/components/nav/icons.tsx`.
- Test files sit next to the code, use `node:test`, `expect`, `renderWithProviders` from `@/test/render`. The actions integration test writes fixture rows with positive ids and removes them in `after`.
- Cover URLs keep going through `cssUrlValue` in `story-card.tsx`; do not touch that helper.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `apps/web/src/lib/stories.ts` | `StoryCardData` gains `isFavorite`; `SectionKey` type |
| `apps/web/src/app/(app)/(nav)/home/actions.ts` | `cardColumns` becomes per-user; new `setFavorite` |
| `apps/web/src/app/(app)/(nav)/home/actions.test.ts` | favorite flag and `setFavorite` integration cases |
| `apps/web/src/components/nav/icons.tsx` | `HeartIcon` |
| `apps/web/src/components/stories/story-card.tsx` | heart button top-right |
| `apps/web/src/components/stories/story-section.tsx` | presentational: receives stories, hasMore, pending, callbacks |
| `apps/web/src/components/stories/stories-board.tsx` | owns the three lists, paging and optimistic favorite toggling |
| `apps/web/src/app/(app)/(nav)/home/page.tsx` | renders `StoriesBoard` |

---

### Task 1: `isFavorite` on every card and the `setFavorite` action

**Files:**
- Modify: `apps/web/src/lib/stories.ts`
- Modify: `apps/web/src/app/(app)/(nav)/home/actions.ts`
- Modify: `apps/web/src/app/(app)/(nav)/home/actions.test.ts`
- Modify (fixtures only, so `tsc` keeps passing): `apps/web/src/components/stories/story-card.test.tsx`, `apps/web/src/components/stories/story-section.test.tsx`

**Interfaces:**
- Consumes: `requireUser`, `schema.games/gameFavorites/gamePlayers/systems`, `idGameSchema` (already in actions.ts).
- Produces: `StoryCardData.isFavorite: boolean`; `type SectionKey = "favorites" | "mine" | "open"`; `setFavorite(idGame: number, isFavorite: boolean): Promise<{ isFavorite: boolean }>`.

- [ ] **Step 1: Add the field and the section key**

In `apps/web/src/lib/stories.ts`, add `isFavorite: boolean;` after `variant: string | null;` in `StoryCardData`, and append:

```ts
/** The three blocks of the Stories page, in the order they render. */
export type SectionKey = "favorites" | "mine" | "open";
export const SECTION_ORDER: readonly SectionKey[] = ["favorites", "mine", "open"];
export const SECTION_TITLES: Record<SectionKey, string> = {
  favorites: "Favorite Stories",
  mine: "My Stories",
  open: "Looking for Players",
};
```

- [ ] **Step 2: Update the two component test fixtures**

In `story-card.test.tsx`, add `isFavorite: false,` to the `story` object after `variant: "Numenera",`. In `story-section.test.tsx`, add `isFavorite: false,` after `variant: null,` inside the `stories()` helper. (Nothing else in those files changes in this task.)

- [ ] **Step 3: Write the failing integration tests**

In `actions.test.ts`, add these `it` blocks before the final `});` of the `describe`:

```ts
  it("marks each card with whether the caller has favorited it", async () => {
    const mine = [...(await actions.listMyStories(0)), ...(await actions.listMyStories(10))];
    const cardA = mine.find((s) => s.idGame === gameA);
    expect(cardA?.isFavorite).toBe(false); // the OTHER user favorited A, not the caller

    const favorites = await actions.listFavoriteStories(0);
    expect(favorites.find((s) => s.idGame === gameB)?.isFavorite).toBe(true);
  });

  it("adds and removes a favorite for the caller only, idempotently", async () => {
    expect(await actions.setFavorite(gameC, true)).toEqual({ isFavorite: true });
    // A second add must not trip the (id_game, id_user) unique constraint.
    expect(await actions.setFavorite(gameC, true)).toEqual({ isFavorite: true });

    let ids = (await actions.listFavoriteStories(0)).map((s) => s.idGame);
    expect(ids).toContain(gameC);

    expect(await actions.setFavorite(gameC, false)).toEqual({ isFavorite: false });
    ids = (await actions.listFavoriteStories(0)).map((s) => s.idGame);
    expect(ids).not.toContain(gameC);

    // The other user's favorite on A is untouched by any of the above.
    const otherRows = await db
      .select({ id: tables.gameFavorites.idGameFavorite })
      .from(tables.gameFavorites)
      .where(eq(tables.gameFavorites.idUser, otherUserId));
    expect(otherRows).toHaveLength(1);
  });

  it("refuses to favorite a story that does not exist", async () => {
    await expect(actions.setFavorite(999999, true)).rejects.toThrow("Story not found");
  });
```

- [ ] **Step 4: Run to verify they fail**

Run: `cd apps/web && npm test -- --test-name-pattern "home actions"`
Expected: the three new cases fail (`isFavorite` undefined; `setFavorite is not a function`). `npx tsc --noEmit` also fails until Step 5, because the fixtures now carry `isFavorite` and the projection does not.

- [ ] **Step 5: Make the projection per-user and add the action**

In `actions.ts`:

1. Change the import line to `import { and, asc, desc, eq, exists, or, sql } from "drizzle-orm";`.
2. Replace the `cardColumns` constant and `cardQuery()` with:

```ts
// Whether the caller has favorited the game on the current outer row. It is
// a correlated EXISTS rather than a join so a favorite never duplicates or
// drops a card, and it is scoped to the caller: nobody sees anyone else's
// hearts.
function favoritedBy(userId: string) {
  return exists(
    db
      .select({ one: gameFavorites.idGameFavorite })
      .from(gameFavorites)
      .where(and(eq(gameFavorites.idGame, games.idGame), eq(gameFavorites.idUser, userId))),
  ).mapWith(Boolean);
}

// One projection shared by every list and by getStory, so the card never sees
// a shape that differs by section.
function cardColumns(userId: string) {
  return {
    idGame: games.idGame,
    gameTitle: games.gameTitle,
    summary: games.summary,
    imageUrl: games.imageUrl,
    lastPlayed: games.lastPlayed,
    systemName: systems.systemName,
    systemVersion: systems.systemVersion,
    variant: systems.variant,
    isFavorite: favoritedBy(userId),
  };
}

function cardQuery(userId: string) {
  return db
    .select(cardColumns(userId))
    .from(games)
    .leftJoin(systems, eq(games.idSystem, systems.idSystem));
}
```

3. Update every caller: `listMyStories` uses `cardQuery(user.id)`; `listFavoriteStories` uses `.select(cardColumns(user.id))`; `listLookingForPlayers` and `getStory` change their first line to `const user = await requireUser();` and use `cardQuery(user.id)`.
4. If `tsc` complains that `isFavorite` is `unknown` rather than `boolean`, replace `favoritedBy`'s body with `sql<boolean>\`exists(${sub})\`` where `sub` is the same select, and keep `.mapWith(Boolean)`.
5. Append the action:

```ts
/**
 * Adds or removes the caller's favorite on a story. Idempotent in both
 * directions: adding twice relies on the (id_game, id_user) unique constraint
 * and removing an absent row is a no-op. Only ever touches rows for user.id.
 */
export async function setFavorite(
  idGame: number,
  isFavorite: boolean,
): Promise<{ isFavorite: boolean }> {
  const user = await requireUser();
  const id = idGameSchema.parse(idGame);
  const wanted = z.boolean().parse(isFavorite);

  const [game] = await db
    .select({ idGame: games.idGame })
    .from(games)
    .where(eq(games.idGame, id))
    .limit(1);
  if (!game) throw new Error("Story not found");

  if (wanted) {
    await db
      .insert(gameFavorites)
      .values({ idGame: id, idUser: user.id, idCreatedByUser: user.id, idUpdatedByUser: user.id })
      .onConflictDoNothing({ target: [gameFavorites.idGame, gameFavorites.idUser] });
  } else {
    await db
      .delete(gameFavorites)
      .where(and(eq(gameFavorites.idGame, id), eq(gameFavorites.idUser, user.id)));
  }

  return { isFavorite: wanted };
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd apps/web && npm test -- --test-name-pattern "home actions"` then `npx tsc --noEmit` and `npm run lint`.
Expected: 12 passing in the suite; tsc and lint clean. Then from the repo root confirm cleanup: `just psql -c "select count(*) from game_favorites"` is 0.

---

### Task 2: Heart button on the card

**Files:**
- Modify: `apps/web/src/components/nav/icons.tsx`
- Modify: `apps/web/src/components/stories/story-card.tsx`
- Modify: `apps/web/src/components/stories/story-card.test.tsx`

**Interfaces:**
- Consumes: `StoryCardData.isFavorite` (Task 1).
- Produces: `HeartIcon({ filled }: { filled: boolean })`; `StoryCard({ story, onToggleFavorite, favoritePending }: { story: StoryCardData; onToggleFavorite?: (story: StoryCardData, isFavorite: boolean) => void; favoritePending?: boolean })`. When `onToggleFavorite` is omitted the heart is not rendered (the detail stub and any future read-only use).

- [ ] **Step 1: Write the failing tests**

Append to `story-card.test.tsx` inside the `describe`:

```tsx
  it("renders no heart when there is no toggle handler", () => {
    renderWithProviders(<StoryCard story={story} />);
    expect(screen.queryByRole("button", { name: /favorites/ })).not.toBeInTheDocument();
  });

  it("shows an unfilled heart that asks to add, and calls back with true", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = mock.fn<(s: typeof story, next: boolean) => void>();
    renderWithProviders(<StoryCard story={story} onToggleFavorite={onToggleFavorite} />);

    const heart = screen.getByRole("button", { name: "Add to favorites" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await user.click(heart);

    expect(onToggleFavorite.mock.calls[0].arguments).toEqual([story, true]);
  });

  it("shows a filled heart that asks to remove, and calls back with false", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = mock.fn<(s: typeof story, next: boolean) => void>();
    renderWithProviders(
      <StoryCard story={{ ...story, isFavorite: true }} onToggleFavorite={onToggleFavorite} />,
    );

    const heart = screen.getByRole("button", { name: "Remove from favorites" });
    expect(heart).toHaveAttribute("aria-pressed", "true");
    await user.click(heart);

    expect(onToggleFavorite.mock.calls[0].arguments[1]).toBe(false);
  });

  it("disables the heart while a toggle is pending", () => {
    renderWithProviders(
      <StoryCard story={story} onToggleFavorite={() => {}} favoritePending />,
    );
    expect(screen.getByRole("button", { name: "Add to favorites" })).toBeDisabled();
  });
```

Add `mock` to the `node:test` import at the top of the file.

- [ ] **Step 2: Run to verify they fail**

Run: `just test --test-name-pattern StoryCard`
Expected: the four new cases fail (no heart button rendered).

- [ ] **Step 3: Add the icon**

Append to `icons.tsx`:

```tsx
// Heart for the story card's favorite toggle. `filled` mirrors aria-pressed on
// the button; the button carries the accessible name.
export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20.5 C7.5 16.8 4 13.9 4 9.9 A4 4 0 0 1 12 8 A4 4 0 0 1 20 9.9 C20 13.9 16.5 16.8 12 20.5 Z" />
    </svg>
  );
}
```

- [ ] **Step 4: Add the button to the card**

In `story-card.tsx`:

1. Change the Chakra import to include `IconButton`: `import { Box, Button, IconButton, LinkBox, LinkOverlay, Popover, Portal, Stack, Text } from "@chakra-ui/react";` and add `import { HeartIcon } from "@/components/nav/icons";`.
2. Change the signature and add the button right after the scrim `Box` (before the content `Stack`):

```tsx
type Props = {
  story: StoryCardData;
  /** Called with the story and the state the user asked for. Omit to hide the heart. */
  onToggleFavorite?: (story: StoryCardData, isFavorite: boolean) => void;
  /** True while a toggle for this story is in flight; the heart is disabled. */
  favoritePending?: boolean;
};

export function StoryCard({ story, onToggleFavorite, favoritePending = false }: Props) {
```

```tsx
      {onToggleFavorite && (
        // Above the LinkOverlay's ::before (z-index 0), so the click is the
        // button's and never the card link's — same technique as "more".
        <IconButton
          type="button"
          aria-label={story.isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={story.isFavorite}
          variant="ghost"
          size="sm"
          rounded="full"
          position="absolute"
          top="2"
          right="2"
          zIndex="1"
          color={story.isFavorite ? "red.300" : "whiteAlpha.900"}
          bg="blackAlpha.400"
          _hover={{ bg: "blackAlpha.600" }}
          disabled={favoritePending}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(story, !story.isFavorite);
          }}
        >
          <HeartIcon filled={story.isFavorite} />
        </IconButton>
      )}
```

Update the leading comment on the component: "the 'more' link and the heart are the two things inside it that do something else".

- [ ] **Step 5: Run to verify they pass**

Run: `just test --test-name-pattern StoryCard`, then `npx tsc --noEmit` and `npm run lint` in `apps/web`.
Expected: all StoryCard tests pass (the earlier ones unchanged); tsc and lint clean.

---

### Task 3: `StorySection` becomes presentational

**Files:**
- Modify: `apps/web/src/components/stories/story-section.tsx` (replace entirely)
- Modify: `apps/web/src/components/stories/story-section.test.tsx` (replace entirely)

**Interfaces:**
- Consumes: `StoryCard` with the new props (Task 2).
- Produces:

```ts
export function StorySection(props: {
  title: string;
  stories: StoryCardData[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onMore: () => void;
  onToggleFavorite: (story: StoryCardData, isFavorite: boolean) => void;
  pendingFavorites: ReadonlySet<number>;
}): JSX.Element
```

- [ ] **Step 1: Replace the test file**

```tsx
import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StoryCardData } from "@/lib/stories";
import { StorySection } from "./story-section";

function stories(count: number, from = 1): StoryCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    idGame: from + i,
    gameTitle: `Story ${from + i}`,
    summary: null,
    imageUrl: null,
    lastPlayed: new Date("2026-01-01T00:00:00Z"),
    systemName: null,
    systemVersion: null,
    variant: null,
    isFavorite: false,
  }));
}

const noop = () => {};
const none: ReadonlySet<number> = new Set();

function renderSection(overrides: Partial<Parameters<typeof StorySection>[0]> = {}) {
  return renderWithProviders(
    <StorySection
      title="My Stories"
      stories={stories(3)}
      hasMore={false}
      isLoadingMore={false}
      onMore={noop}
      onToggleFavorite={noop}
      pendingFavorites={none}
      {...overrides}
    />,
  );
}

describe("StorySection", () => {
  it("shows an empty state when there are no stories", () => {
    renderSection({ stories: [] });

    expect(screen.getByRole("region", { name: "My Stories" })).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("renders a card per story and no More button when there is nothing more", () => {
    renderSection();

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("shows More when asked and reports the click", async () => {
    const user = userEvent.setup();
    const onMore = mock.fn();
    renderSection({ hasMore: true, onMore });

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(onMore.mock.callCount()).toBe(1);
  });

  it("keeps More visible but disabled while loading", () => {
    renderSection({ hasMore: true, isLoadingMore: true });

    expect(screen.getByRole("button", { name: "More" })).toBeDisabled();
  });

  it("passes heart clicks up with the story and the requested state", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = mock.fn<(s: StoryCardData, next: boolean) => void>();
    renderSection({ onToggleFavorite });

    await user.click(screen.getAllByRole("button", { name: "Add to favorites" })[1]);
    expect(onToggleFavorite.mock.calls[0].arguments[0].idGame).toBe(2);
    expect(onToggleFavorite.mock.calls[0].arguments[1]).toBe(true);
  });

  it("disables only the hearts that are pending", () => {
    renderSection({ pendingFavorites: new Set([2]) });

    const hearts = screen.getAllByRole("button", { name: "Add to favorites" });
    expect(hearts[0]).toBeEnabled();
    expect(hearts[1]).toBeDisabled();
    expect(hearts[2]).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `just test --test-name-pattern StorySection`
Expected: fails (the old component ignores the new props and `initialStories` is missing).

- [ ] **Step 3: Replace the component**

```tsx
"use client";

import { useId } from "react";
import { Box, Button, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { StoryCardData } from "@/lib/stories";
import { StoryCard } from "./story-card";

type Props = {
  title: string;
  stories: StoryCardData[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onMore: () => void;
  onToggleFavorite: (story: StoryCardData, isFavorite: boolean) => void;
  /** Ids whose favorite toggle is in flight; their hearts are disabled. */
  pendingFavorites: ReadonlySet<number>;
};

// One titled block of the Stories page. Purely presentational: StoriesBoard
// owns the lists, the paging and the favorite toggling, because a heart in
// one section changes what another section shows.
export function StorySection({
  title,
  stories,
  hasMore,
  isLoadingMore,
  onMore,
  onToggleFavorite,
  pendingFavorites,
}: Props) {
  const headingId = useId();

  return (
    <Stack as="section" aria-labelledby={headingId} gap="4">
      <Heading id={headingId} size="xl">
        {title}
      </Heading>

      {stories.length === 0 ? (
        <Text color="fg.muted">Nothing here yet.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap="4">
          {stories.map((story) => (
            <StoryCard
              key={story.idGame}
              story={story}
              onToggleFavorite={onToggleFavorite}
              favoritePending={pendingFavorites.has(story.idGame)}
            />
          ))}
        </SimpleGrid>
      )}

      {hasMore && (
        <Box>
          <Button variant="outline" onClick={onMore} loading={isLoadingMore} loadingText="More">
            More
          </Button>
        </Box>
      )}
    </Stack>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `just test --test-name-pattern StorySection`
Expected: 6 passing. `npx tsc --noEmit` will now fail only in `home/page.tsx` (it still passes `initialStories`); that is fixed in Task 4.

---

### Task 4: `StoriesBoard` and the page

**Files:**
- Create: `apps/web/src/components/stories/stories-board.tsx`
- Create: `apps/web/src/components/stories/stories-board.test.tsx`
- Modify: `apps/web/src/app/(app)/(nav)/home/page.tsx`

**Interfaces:**
- Consumes: `StorySection` (Task 3), `SectionKey`, `SECTION_ORDER`, `SECTION_TITLES`, `PAGE_SIZE`, `StoryCardData` (Task 1), the actions `listFavoriteStories`, `listMyStories`, `listLookingForPlayers`, `setFavorite` (Task 1).
- Produces:

```ts
export function StoriesBoard(props: {
  initial: Record<SectionKey, StoryCardData[]>;
  loadMore: Record<SectionKey, (offset: number) => Promise<StoryCardData[]>>;
  setFavorite: (idGame: number, isFavorite: boolean) => Promise<{ isFavorite: boolean }>;
}): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { PAGE_SIZE, type SectionKey, type StoryCardData } from "@/lib/stories";
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
  }));
}

const emptyLoaders: Record<SectionKey, (offset: number) => Promise<StoryCardData[]>> = {
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

    await user.click(within(section("My Stories")).getAllByRole("button", { name: "Add to favorites" })[1]);

    await waitFor(() => expect(setFavorite.mock.calls[0].arguments).toEqual([2, true]));
    const favoriteTitles = within(section("Favorite Stories"))
      .getAllByRole("article")
      .map((a) => within(a).getByRole("link").textContent);
    expect(favoriteTitles).toEqual(["Story 2", "Story 50"]);
    expect(
      within(section("My Stories")).getByRole("button", { name: "Remove from favorites" }),
    ).toBeInTheDocument();
  });

  it("un-hearting the last favorite hides the section and empties the heart elsewhere", async () => {
    const user = userEvent.setup();
    renderBoard({ initial: { favorites: stories(1, 2, true), mine: stories(2, 1).map((s) => ({ ...s, isFavorite: s.idGame === 2 })), open: [] } });

    await user.click(within(section("Favorite Stories")).getByRole("button", { name: "Remove from favorites" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Favorite Stories" })).not.toBeInTheDocument(),
    );
    expect(within(section("My Stories")).getAllByRole("button", { name: "Add to favorites" })).toHaveLength(2);
  });

  it("reverts the heart when the action fails", async () => {
    const user = userEvent.setup();
    renderBoard({ setFavorite: async () => { throw new Error("nope"); } });

    await user.click(within(section("My Stories")).getAllByRole("button", { name: "Add to favorites" })[0]);

    await waitFor(() =>
      expect(within(section("My Stories")).getAllByRole("button", { name: "Add to favorites" })).toHaveLength(3),
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
    expect(mineLoader.mock.calls[0].arguments).toEqual([PAGE_SIZE]);
    expect(within(section("My Stories")).queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });
});
```

Note on the "favoriting" test's `mine: stories(2)`: Story 1 and Story 2 are both unfavorited, so index `[1]` of the "Add to favorites" buttons within My Stories is Story 2.

- [ ] **Step 2: Run to verify it fails**

Run: `just test --test-name-pattern StoriesBoard`
Expected: fails because `./stories-board` does not exist.

- [ ] **Step 3: Implement the board**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Stack } from "@chakra-ui/react";
import {
  PAGE_SIZE,
  SECTION_ORDER,
  SECTION_TITLES,
  type SectionKey,
  type StoryCardData,
} from "@/lib/stories";
import { StorySection } from "./story-section";

type Loader = (offset: number) => Promise<StoryCardData[]>;

type Props = {
  initial: Record<SectionKey, StoryCardData[]>;
  /** Server actions, one per section; called with the number already shown. */
  loadMore: Record<SectionKey, Loader>;
  /** Server action that writes the caller's favorite. */
  setFavorite: (idGame: number, isFavorite: boolean) => Promise<{ isFavorite: boolean }>;
};

type SectionState = { stories: StoryCardData[]; hasMore: boolean; isLoadingMore: boolean };
type BoardState = Record<SectionKey, SectionState>;

function initialState(initial: Props["initial"]): BoardState {
  const state = {} as BoardState;
  for (const key of SECTION_ORDER) {
    const stories = initial[key];
    // A page shorter than PAGE_SIZE means the well is dry.
    state[key] = { stories, hasMore: stories.length === PAGE_SIZE, isLoadingMore: false };
  }
  return state;
}

/**
 * Applies a favorite change everywhere it shows: the heart on every copy of
 * the story, and membership of the Favorites list (prepended on add, removed
 * on remove). Pure, so the failure path can call it again with the old value.
 */
function withFavorite(state: BoardState, story: StoryCardData, isFavorite: boolean): BoardState {
  const flip = (list: StoryCardData[]) =>
    list.map((s) => (s.idGame === story.idGame ? { ...s, isFavorite } : s));

  const next = {} as BoardState;
  for (const key of SECTION_ORDER) next[key] = { ...state[key], stories: flip(state[key].stories) };

  const favorites = next.favorites.stories;
  if (isFavorite && !favorites.some((s) => s.idGame === story.idGame)) {
    next.favorites.stories = [{ ...story, isFavorite: true }, ...favorites];
  } else if (!isFavorite) {
    next.favorites.stories = favorites.filter((s) => s.idGame !== story.idGame);
  }
  return next;
}

// The Stories page below its header. Owns all three lists because a heart
// clicked in one section changes another; every write and every further page
// still goes through a server action that re-checks the session.
export function StoriesBoard({ initial, loadMore, setFavorite }: Props) {
  const [board, setBoard] = useState(() => initialState(initial));
  const [pendingFavorites, setPendingFavorites] = useState<ReadonlySet<number>>(new Set());
  const [, startTransition] = useTransition();

  function onMore(key: SectionKey) {
    const offset = board[key].stories.length;
    setBoard((b) => ({ ...b, [key]: { ...b[key], isLoadingMore: true } }));
    startTransition(async () => {
      try {
        const page = await loadMore[key](offset);
        setBoard((b) => {
          // Favoriting may have prepended a card the server also returns:
          // keep the first copy, so a story never appears twice in a section.
          const seen = new Set(b[key].stories.map((s) => s.idGame));
          const fresh = page.filter((s) => !seen.has(s.idGame));
          return {
            ...b,
            [key]: {
              stories: [...b[key].stories, ...fresh],
              hasMore: page.length === PAGE_SIZE,
              isLoadingMore: false,
            },
          };
        });
      } catch {
        // Leave the section as it was; the button stays so they can retry.
        setBoard((b) => ({ ...b, [key]: { ...b[key], isLoadingMore: false } }));
      }
    });
  }

  function onToggleFavorite(story: StoryCardData, isFavorite: boolean) {
    if (pendingFavorites.has(story.idGame)) return;
    setPendingFavorites((p) => new Set(p).add(story.idGame));
    setBoard((b) => withFavorite(b, story, isFavorite));
    startTransition(async () => {
      try {
        await setFavorite(story.idGame, isFavorite);
      } catch {
        // Put it back the way it was.
        setBoard((b) => withFavorite(b, story, !isFavorite));
      } finally {
        setPendingFavorites((p) => {
          const next = new Set(p);
          next.delete(story.idGame);
          return next;
        });
      }
    });
  }

  return (
    <Stack gap="10">
      {SECTION_ORDER.map((key) => {
        const { stories, hasMore, isLoadingMore } = board[key];
        // Favorites earn their place at the top; an empty block there would
        // only push My Stories down for everyone who has not hearted anything.
        if (key === "favorites" && stories.length === 0) return null;
        return (
          <StorySection
            key={key}
            title={SECTION_TITLES[key]}
            stories={stories}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onMore={() => onMore(key)}
            onToggleFavorite={onToggleFavorite}
            pendingFavorites={pendingFavorites}
          />
        );
      })}
    </Stack>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `just test --test-name-pattern StoriesBoard`
Expected: 6 passing, no React warnings. If the "reverts the heart" test sees a stale count, the revert and the pending-clear both go through `setBoard`/`setPendingFavorites` inside the transition; `waitFor` covers it.

- [ ] **Step 5: Wire the page**

Replace `apps/web/src/app/(app)/(nav)/home/page.tsx`:

```tsx
import NextLink from "next/link";
import { Button, Container, Flex, Heading, Stack } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { StoriesBoard } from "@/components/stories/stories-board";
import {
  listFavoriteStories,
  listLookingForPlayers,
  listMyStories,
  setFavorite,
} from "./actions";

// The Stories page: the signed-in home and the "Stories" nav item are the
// same route. requireSession() here rather than trusting the group layout;
// see lib/require-session.ts for why. Every action re-checks the user against
// the database before touching data.
export default async function HomePage() {
  await requireSession();

  const [favorites, mine, open] = await Promise.all([
    listFavoriteStories(0),
    listMyStories(0),
    listLookingForPlayers(0),
  ]);

  return (
    <Container maxW="7xl" py="8">
      <Stack gap="10">
        <Flex justify="space-between" align="center" wrap="wrap" gap="4">
          <Heading size="3xl">Stories</Heading>
          <Button asChild>
            <NextLink href="/home/new">New story</NextLink>
          </Button>
        </Flex>

        <StoriesBoard
          initial={{ favorites, mine, open }}
          loadMore={{
            favorites: listFavoriteStories,
            mine: listMyStories,
            open: listLookingForPlayers,
          }}
          setFavorite={setFavorite}
        />
      </Stack>
    </Container>
  );
}
```

- [ ] **Step 6: Full verification**

Run: `cd apps/web && npx tsc --noEmit && npm run lint && npm test`, then `npm run build` (restore `next-env.d.ts` afterwards with `git checkout -- apps/web/next-env.d.ts`), then from the repo root `just psql -c "select count(*) from game_favorites"`.
Expected: tsc and lint clean; the suite green (107 minus the 4 replaced StorySection tests plus 3 + 4 + 6 + 6 new ones); build lists `/home`; favorites count 0.

- [ ] **Step 7: Browser check** (owner, or anyone signed in)

On `/home`: Favorites is absent at first. Heart a card in My Stories: it fills, the Favorites section appears at the top with that card. Un-heart it from either section: it empties and the section disappears. Reload: the state persists.
