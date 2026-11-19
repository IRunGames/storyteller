# Stories Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/home` page with a Stories page: three card sections with load-more, a new-story form, and the app's first real data access, done entirely through session-checked server actions.

**Architecture:** Schema changes go through the dbmate workflow in `db/` and are mirrored in `apps/web/src/db/schema.ts`. A single `requireUser()` guard verifies the session and the user row; every server action in `home/actions.ts` starts with it and runs its own Drizzle query. Pages are server components that call those actions; cards and sections are client components.

**Tech Stack:** Next.js 16 App Router, React 19, Chakra UI v3, Drizzle ORM 0.45 on `pg`, Zod 4, react-hook-form, Better Auth, `node:test` + Testing Library, dbmate via `just`.

**Spec:** `docs/superpowers/specs/2026-09-20-stories-page-design.md`

## Global Constraints

- **Never commit.** The repo owner commits themselves. Leave every change in the working tree. Plan steps therefore end at "tests pass", not "commit".
- Run web tests with `just test` from anywhere in the repo, or `npm test` in `apps/web`. Filter with `just test --test-name-pattern "<pattern>"`.
- Run db commands with `just` from anywhere: `just new <name>`, `just make_custom <file>`, `just make_seed <file>`, `just migrate`, `just status`, `just psql -c "<sql>"`.
- One-time DDL goes straight into `db/migrations` via `just new`. Re-executable SQL (table creation scripts) goes in `db/custom` and is wrapped with `just make_custom`. Seeds live in `db/seeds` and are wrapped with `just make_seed`.
- Seeded records use negative ids.
- `schema.ts` mirrors what dbmate built; never run drizzle-kit generate/push.
- Drizzle column keys are camelCase; SQL names match the database exactly (`id_game`, `game_title`).
- Every server action begins with `const user = await requireUser()` and never trusts an id from the client for authorization.
- `PAGE_SIZE = 10`, `SUMMARY_PREVIEW_CHARS = 200`.
- No new npm dependencies. If one becomes necessary, add a bullet to `apps/web/technologies.md`.
- Test files sit next to the code they test, named `*.test.ts` / `*.test.tsx`, using `node:test`, `expect`, and `renderWithProviders` from `@/test/render`.
- Client components that touch `next/navigation` or `@/db` are tested with `mock.module` and a dynamic `import()` in `before`, exactly as `src/components/nav/app-header.test.tsx` does.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `db/migrations/<ts>_add_games_summary_and_looking_for_players.sql` | One-time: two new columns on `games` |
| `db/custom/create_game_favorites_table.sql` | Re-executable: `game_favorites` table plus metatable registration |
| `db/seeds/seed_games.sql` | Existing seed, gains `summary` per row |
| `apps/web/src/db/schema.ts` | Drizzle mirror, gains `systems`, `games`, `gamePlayers`, `gameFavorites` |
| `apps/web/src/lib/authorize.ts` | `requireUser()` and `UnauthorizedError` |
| `apps/web/src/lib/story-schemas.ts` | `newStorySchema`, `NewStoryValues` |
| `apps/web/src/lib/stories.ts` | Shared constants and the `StoryCardData` type, `systemLabel()`, `formatLastPlayed()` |
| `apps/web/src/app/(app)/(nav)/home/actions.ts` | All data access for the stories feature |
| `apps/web/src/app/(app)/(nav)/home/page.tsx` | The Stories page |
| `apps/web/src/app/(app)/(nav)/home/new/page.tsx` | New story page (server) |
| `apps/web/src/app/(app)/(nav)/home/new/new-story-form.tsx` | New story form (client) |
| `apps/web/src/app/(app)/(nav)/home/[id]/page.tsx` | Story detail stub |
| `apps/web/src/components/stories/story-card.tsx` | One card with cover, title, system, summary popover, date |
| `apps/web/src/components/stories/story-section.tsx` | Heading, grid of cards, More button |

---

### Task 1: Database schema and seed summaries

**Files:**
- Create: `db/migrations/<timestamp>_add_games_summary_and_looking_for_players.sql` (via `just new`)
- Create: `db/custom/create_game_favorites_table.sql`
- Create: `db/migrations/<timestamp>_do_custom_create_game_favorites_table.sql` (via `just make_custom`)
- Modify: `db/seeds/seed_games.sql`
- Delete then recreate: `db/migrations/20260920195028_do_seed_games.sql` (via `just make_seed`)

**Interfaces:**
- Produces: columns `games.summary text`, `games.is_looking_for_players boolean not null default false`; table `game_favorites(id_game_favorite, id_game, id_user, created_at, updated_at, id_created_by_user, id_updated_by_user)` with `UNIQUE (id_game, id_user)`.

- [ ] **Step 1: Scaffold the one-time migration**

Run: `just new add_games_summary_and_looking_for_players`
Expected: prints the path of a new file under `db/migrations/` containing `-- migrate:up` and `-- migrate:down`.

- [ ] **Step 2: Write the column additions**

Replace the file's contents with:

```sql
-- migrate:up
-- The Stories page shows a summary on each card and a "Looking for Players"
-- section. Both are plain columns on games; neither needs a lookup table.
ALTER TABLE games ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_looking_for_players boolean NOT NULL DEFAULT false;

-- migrate:down

```

- [ ] **Step 3: Write the favorites table script**

Create `db/custom/create_game_favorites_table.sql`:

```sql
-- migrate:up
-- A user's favorite games, for the "Favorite Stories" section of the Stories
-- page. One row per (game, user); the audit columns come from the metatable
-- procedures below rather than being declared here, so they match games.
CREATE TABLE IF NOT EXISTS game_favorites (
    id_game_favorite integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    id_game          bigint NOT NULL REFERENCES games (id_game) ON DELETE CASCADE,
    id_user          uuid   NOT NULL REFERENCES users (id_user) ON DELETE CASCADE,
    UNIQUE (id_game, id_user)
);

-- Register the table so the needs_* flags have a row to land on. On a
-- database built from scratch _tables may be empty at this point.
CALL _p_update_tables();

-- _p_update_tables() only overwrites the has_* flags on conflict, never the
-- needs_* ones, so this survives later runs.
UPDATE _tables
SET needs_timestamps = TRUE,
    needs_user_ids   = TRUE,
    updated_at       = NOW()
WHERE table_name = 'game_favorites';

-- A table absent from _tables would silently miss out, so say so instead.
DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM _tables WHERE table_name = 'game_favorites') THEN
            RAISE EXCEPTION
                'game_favorites is not present in _tables even after '
                    '_p_update_tables(), so its audit columns cannot be added.';
        END IF;
    END
$$;

-- Adds created_at / updated_at with the set_updated_at trigger, then
-- id_created_by_user / id_updated_by_user with their foreign keys. Both are
-- idempotent across every flagged table.
CALL _p_update_tables_timestamps();
CALL _p_update_tables_user_ids();

-- migrate:down

```

- [ ] **Step 4: Wrap it into a migration**

Run: `just make_custom create_game_favorites_table.sql`
Expected: `Migration created: ./migrations/<timestamp>_do_custom_create_game_favorites_table.sql` (or similar). Open it and confirm the body matches the script.

- [ ] **Step 5: Add summaries to the games seed**

In `db/seeds/seed_games.sql`, change the INSERT column list and every row. Replace the whole `INSERT ... ;` statement with:

```sql
    INSERT INTO games (id_game, game_title, id_system, image_url, summary, hours_played, is_active, last_played,
                       id_created_by_user, id_updated_by_user)
    VALUES
        ( -1, 'Something Wicked',      NULL, 'https://rpg.irun.games/_astro/something-wicked.BDFq7VyR_2qTJPB.webp',
          'A magical gothic horror campaign. Each character has glimpsed the supernatural and been irrevocably changed by it, and is defined by the power they acquired, the price they paid, the curse they carry, their secrets, their calling, their closest companion and the places that matter to them.',
          0, true,  DEFAULT,      '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Old Gods of Appalachia (Cypher System)
        ( -2, 'Down in Adder''s Hollow', -28, NULL,
          'A mysterious affliction strikes an Appalachian community, and the residents turn to the estranged healer Ma Nettles to find out what is behind the strange occurrences.',
          0, true,  DEFAULT,      '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -3, 'Last Train Out',         -28, 'https://rpg.irun.games/_astro/lto.D2boiODh_kSUkl.webp',
          'A group of Appalachian investigators boards the 7am train out of Asheville to uncover the mystery behind a string of disappearances tied to a suspicious rail line.',
          0, true,  DEFAULT,      '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Exalted
        ( -4, 'The Endless Caravan',   -102, 'https://rpg.irun.games/_astro/Caravan.CzLLI-AL_2bqp8z.webp',
          'A Night Guard is hired to protect the Endless Caravan on its dangerous passage across the grasslands of the Green Sea, in a loose take on the Exalted setting.',
          0, true,  DEFAULT,      '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -5, 'In the Eye Of...',       -97, 'https://rpg.irun.games/images/exalted/in-the-eye-of/starfall.jpg',
          'Solar Exalted, newly awakened to their power, join the mysterious Night Driver aboard his black ship and sail into the dangerous West to confront an ancient darkness he believed sealed away.',
          0, true,  DEFAULT,      '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -6, 'A Time for Masks',      NULL, 'https://rpg.irun.games/images/a-time-for-masks/40337142-0b5d-472b-908e-43fb64ee1cb8.jpg',
          'In a Victorian world, each player character has mysteriously crafted a magical mask that grants extraordinary powers. They begin using the masks to right wrongs, and meet unexpected resistance from forces unknown.',
          0, true,  DEFAULT,      '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Invisible Sun
        ( -7, 'Embers Leap',            -34, 'https://rpg.irun.games/images/invisible-sun/embers-leap/InvisibleSunLogo.jpg',
          'Fellow escapees from the Gray gather at Apostate Imbir''s gala in Satyrine to celebrate Imbolc and to take up matters that will shape the city''s future.',
          18, false, '2019-01-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -8, 'Kaliphate',             NULL, NULL,
          'Under the god Baruk''s guidance the aging Kaliph has brought peace and prosperity to the Isthmus and its neighbours. Now he is dying, his young successor is largely unknown, and the factions are positioning themselves. Players take the side of the Prince''s allies or the Kaliph''s old guard.',
          0, true,  DEFAULT,      '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -9, 'Resurrection (WY)',     NULL, NULL,
          'Wyoming, 1844. Visions of divine fire have called a group of supernaturally gifted people to a town where Millerite believers await the prophesied return of Christ. Their gifts are rooted in virtue and personal tragedy, and the townsfolk and the apocalyptic newcomers are on a collision course.',
          0, false, '2018-01-08', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-10, 'Psychoneira',           NULL, 'https://rpg.irun.games/images/psychoneira/psychoneira.jpg',
          'The Sacramento Valley Psychiatric Sleep Disorder Clinic, run by the SimpleCommunion Institute, treats people whose impossible dreams and visions have begun to intrude on waking life. The players are its patients, and the staff may help them find the truth or keep them from it.',
          0, true,  DEFAULT,      '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-11, 'True Sight',            NULL, 'https://rpg.irun.games/images/true-sight/5376500817_f27ae1c0ef_z-300x300.jpg',
          'A Witch Hunter and his Elven wife arrive at a remote northern fort, where the Great Plains end and the Dark Trees begin, to investigate disappearances and a woman found ritually murdered among the gardens. The Hunter, the Healer, the Hound, the Captain and the Stalker follow the trail.',
          33, false, '2013-09-26', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Numenera (Cypher System)
        (-12, 'Amber Spires',           -26, 'https://rpg.irun.games/images/numenera/amber-spires/Parc-guell-spires-1024x768.jpg',
          'In the city of Spires the characters serve the Amber Papacy, and Cardinal R''zak has a mission for them.',
          3, false, '2014-03-24', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-13, 'The Devil''s Spine',     -26, NULL,
          'Baron Tichronius marches to war against the Gaian Heresy and hires the characters to manage his estate at Uxphon in his absence. What begins as stewardship grows into a sprawling adventure of disappearances, ancient mysteries and the strange forces of the Ninth World.',
          99, false, '2015-06-25', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-14, 'Silent Running',         -26, 'https://rpg.irun.games/images/numenera/silent-running/Screenshot-2024-01-27-at-11.58.39-1.png',
          'When winter lifts, no word comes from the mountain city of Pesht. Skilled adventurers are hired to climb up and find out why it has fallen silent.',
          9, false, '2013-06-10', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9');
```

Also update the header comment: after the `last_played` paragraph add:

```sql
    -- summary is one to three sentences taken from each campaign's page on
    -- the site. is_looking_for_players keeps its default (false) for all rows.
```

- [ ] **Step 6: Replace the seed migration**

Nothing is committed, so replace the existing seed migration rather than stack a second one. `just rollback` only undoes the latest migration, and Steps 1 and 4 have already added two newer files, so un-apply the seed by removing its dbmate record directly:

```bash
just psql -c "DELETE FROM schema_migrations WHERE version = '20260920195028'"
rm db/migrations/20260920195028_do_seed_games.sql
just make_seed seed_games.sql
```

The seeded rows stay in the table; the regenerated migration deletes and re-inserts them with summaries.

Then in the new `db/migrations/<timestamp>_do_seed_games.sql` replace `DELETE FROM xxx;` with `DELETE FROM games WHERE id_game < 0;` and `Seeding xxx` with `Seeding games`.

Note: the new seed migration's timestamp will sort after the column migration from Step 1 because Step 1 ran first, so the `summary` column exists when the seed inserts.

- [ ] **Step 7: Apply and verify**

Run: `just migrate`
Expected: three migrations apply in order: the columns, the favorites table, the seed.

Run:
```bash
just psql -c "\d game_favorites" -c "select id_game, left(summary, 40) as summary, is_looking_for_players from games where id_game < 0 order by id_game desc limit 3"
```
Expected: `game_favorites` shows `created_at`, `updated_at`, `id_created_by_user`, `id_updated_by_user`, the `set_updated_at` trigger and the unique constraint; the three games rows show a non-null summary and `f`.

---

### Task 2: Drizzle schema mirror

**Files:**
- Modify: `apps/web/src/db/schema.ts` (append after `verification`, before the relations block)

**Interfaces:**
- Produces: exported tables `systems`, `games`, `gamePlayers`, `gameFavorites`; types `Game = typeof games.$inferSelect`, `System = typeof systems.$inferSelect`.

- [ ] **Step 1: Add the tables**

Insert after the `verification` table definition:

```ts
// ---------------------------------------------------------------------------
// Game tables. Built by dbmate (db/custom/create_foundation_tables.sql and
// later migrations); described here so the app can query them with types.
// ---------------------------------------------------------------------------

export const systems = pgTable("systems", {
  idSystem: integer("id_system").primaryKey(),
  systemName: varchar("system_name").notNull(),
  systemVersion: varchar("system_version"),
  variant: varchar("variant"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

export const games = pgTable("games", {
  idGame: integer("id_game").primaryKey(),
  gameTitle: varchar("game_title").notNull(),
  summary: text("summary"),
  hoursPlayed: doublePrecision("hours_played").default(0).notNull(),
  idSystem: integer("id_system"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true).notNull(),
  isLookingForPlayers: boolean("is_looking_for_players").default(false).notNull(),
  lastPlayed: timestamp("last_played", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

// id_game is bigint on the child tables but integer on games itself; mode
// "number" keeps both sides comparable in the query builder.
export const gamePlayers = pgTable("game_players", {
  idGamePlayer: integer("id_game_player").primaryKey(),
  idGame: bigint("id_game", { mode: "number" }).notNull(),
  idUser: uuid("id_user").notNull(),
  idCharacter: bigint("id_character", { mode: "number" }),
  hoursPlayed: doublePrecision("hours_played"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const gameFavorites = pgTable("game_favorites", {
  idGameFavorite: integer("id_game_favorite").primaryKey(),
  idGame: bigint("id_game", { mode: "number" }).notNull(),
  idUser: uuid("id_user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

export type Game = typeof games.$inferSelect;
export type System = typeof systems.$inferSelect;
```

Add `bigint` to the `drizzle-orm/pg-core` import list at the top of the file.

- [ ] **Step 2: Add relations**

Append after `accountRelations`:

```ts
export const gamesRelations = relations(games, ({ one, many }) => ({
  system: one(systems, {
    fields: [games.idSystem],
    references: [systems.idSystem],
  }),
  players: many(gamePlayers),
  favorites: many(gameFavorites),
}));

export const gamePlayersRelations = relations(gamePlayers, ({ one }) => ({
  game: one(games, { fields: [gamePlayers.idGame], references: [games.idGame] }),
  user: one(user, { fields: [gamePlayers.idUser], references: [user.id] }),
}));

export const gameFavoritesRelations = relations(gameFavorites, ({ one }) => ({
  game: one(games, { fields: [gameFavorites.idGame], references: [games.idGame] }),
  user: one(user, { fields: [gameFavorites.idUser], references: [user.id] }),
}));
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the existing suite to confirm nothing regressed**

Run: `just test`
Expected: all existing tests pass.

---

### Task 3: `requireUser()` guard

**Files:**
- Create: `apps/web/src/lib/authorize.ts`
- Test: `apps/web/src/lib/authorize.test.ts`

**Interfaces:**
- Consumes: `getSession` from `@/lib/require-session`; `db.query.user.findFirst` from `@/db`.
- Produces: `export class UnauthorizedError extends Error`; `export async function requireUser(): Promise<DbUser>` where `DbUser = typeof schema.user.$inferSelect`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/authorize.test.ts`:

```ts
import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

const getSession = mock.fn<() => Promise<{ user: { id: string } } | null>>();
const findFirst = mock.fn<(args: unknown) => Promise<unknown>>();

const activeUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul",
  email: "storyteller@irun.games",
  isActive: true,
};

let requireUser: typeof import("./authorize").requireUser;
let UnauthorizedError: typeof import("./authorize").UnauthorizedError;

describe("requireUser", () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    mock.module("@/db", {
      namedExports: {
        db: { query: { user: { findFirst } } },
        schema: { user: { id: "id_user" } },
      },
    });
    ({ requireUser, UnauthorizedError } = await import("./authorize"));
  });

  beforeEach(() => {
    getSession.mock.resetCalls();
    findFirst.mock.resetCalls();
  });

  it("rejects when there is no session", async () => {
    getSession.mock.mockImplementation(async () => null);

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(findFirst.mock.callCount()).toBe(0);
  });

  it("rejects when the session user has no row", async () => {
    getSession.mock.mockImplementation(async () => ({ user: { id: activeUser.id } }));
    findFirst.mock.mockImplementation(async () => undefined);

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects an inactive user", async () => {
    getSession.mock.mockImplementation(async () => ({ user: { id: activeUser.id } }));
    findFirst.mock.mockImplementation(async () => ({ ...activeUser, isActive: false }));

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns the database row for an active user", async () => {
    getSession.mock.mockImplementation(async () => ({ user: { id: activeUser.id } }));
    findFirst.mock.mockImplementation(async () => activeUser);

    await expect(requireUser()).resolves.toEqual(activeUser);
    expect(findFirst.mock.callCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `just test --test-name-pattern requireUser`
Expected: fails because `./authorize` cannot be found.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/authorize.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSession } from "@/lib/require-session";

export type DbUser = typeof schema.user.$inferSelect;

/** Thrown when an action is reached without a live session and active user. */
export class UnauthorizedError extends Error {
  constructor(message = "You need to be signed in to do that.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * The gate every server action passes through. A session cookie alone is not
 * enough: the user must still exist in `users` and be active, so a deleted or
 * deactivated account cannot keep acting on a cookie that has not expired.
 *
 * Returns the database row, so callers use `user.id` from here and never an id
 * sent by the client.
 */
export async function requireUser(): Promise<DbUser> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, session.user.id),
  });
  if (!user || !user.isActive) throw new UnauthorizedError();

  return user;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `just test --test-name-pattern requireUser`
Expected: 4 passing.

---

### Task 4: Story schema, constants and helpers

**Files:**
- Create: `apps/web/src/lib/story-schemas.ts`
- Create: `apps/web/src/lib/stories.ts`
- Test: `apps/web/src/lib/story-schemas.test.ts`
- Test: `apps/web/src/lib/stories.test.ts`

**Interfaces:**
- Produces:
  - `newStorySchema`, `NewStoryValues = { title: string; idSystem: number | null; summary: string; imageUrl: string; isLookingForPlayers: boolean }`
  - `PAGE_SIZE = 10`, `SUMMARY_PREVIEW_CHARS = 200`
  - `type StoryCardData = { idGame: number; gameTitle: string; summary: string | null; imageUrl: string | null; lastPlayed: Date; systemName: string | null; systemVersion: string | null; variant: string | null }`
  - `systemLabel(story: Pick<StoryCardData, "systemName" | "systemVersion" | "variant">): string | null`
  - `formatLastPlayed(date: Date): string`

- [ ] **Step 1: Write the failing schema tests**

Create `apps/web/src/lib/story-schemas.test.ts`:

```ts
import { describe, it } from "node:test";
import { expect } from "expect";

import { newStorySchema } from "./story-schemas";

function messagesFor(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

const good = {
  title: "Something Wicked",
  idSystem: -25,
  summary: "A magical gothic horror campaign.",
  imageUrl: "https://rpg.irun.games/images/x.jpg",
  isLookingForPlayers: false,
};

describe("newStorySchema", () => {
  it("accepts a complete story and trims the title", () => {
    const result = newStorySchema.safeParse({ ...good, title: "  Something Wicked  " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(good);
  });

  it("refuses a blank title", () => {
    expect(messagesFor(newStorySchema.safeParse({ ...good, title: "  " }))).toEqual({
      title: "Please give the story a title.",
    });
  });

  it("refuses a title over 200 characters", () => {
    expect(messagesFor(newStorySchema.safeParse({ ...good, title: "x".repeat(201) }))).toEqual({
      title: "Keep the title under 200 characters.",
    });
  });

  it("treats an empty system as none", () => {
    const result = newStorySchema.safeParse({ ...good, idSystem: "" });

    expect(result.success).toBe(true);
    expect(result.data?.idSystem).toBeNull();
  });

  it("coerces a numeric string system id from a select", () => {
    const result = newStorySchema.safeParse({ ...good, idSystem: "-25" });

    expect(result.success).toBe(true);
    expect(result.data?.idSystem).toBe(-25);
  });

  it("allows an empty image URL but refuses a malformed one", () => {
    expect(newStorySchema.safeParse({ ...good, imageUrl: "" }).success).toBe(true);
    expect(messagesFor(newStorySchema.safeParse({ ...good, imageUrl: "not a url" }))).toEqual({
      imageUrl: "Please enter a valid URL.",
    });
  });

  it("refuses a summary over 4000 characters", () => {
    expect(messagesFor(newStorySchema.safeParse({ ...good, summary: "x".repeat(4001) }))).toEqual({
      summary: "Keep the summary under 4000 characters.",
    });
  });
});
```

- [ ] **Step 2: Write the failing helper tests**

Create `apps/web/src/lib/stories.test.ts`:

```ts
import { describe, it } from "node:test";
import { expect } from "expect";

import { formatLastPlayed, systemLabel } from "./stories";

describe("systemLabel", () => {
  it("returns null when there is no system", () => {
    expect(systemLabel({ systemName: null, systemVersion: null, variant: null })).toBeNull();
  });

  it("shows just the name", () => {
    expect(systemLabel({ systemName: "Daggerheart", systemVersion: null, variant: null })).toBe(
      "Daggerheart",
    );
  });

  it("joins name, variant and version", () => {
    expect(
      systemLabel({ systemName: "Cypher System", systemVersion: "Revised", variant: "Numenera" }),
    ).toBe("Cypher System · Numenera (Revised)");
  });
});

describe("formatLastPlayed", () => {
  it("formats as a short month, day and year", () => {
    expect(formatLastPlayed(new Date("2015-06-25T12:00:00Z"))).toBe("Jun 25, 2015");
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `just test --test-name-pattern "newStorySchema|systemLabel|formatLastPlayed"`
Expected: fail because the modules do not exist.

- [ ] **Step 4: Implement the schema**

Create `apps/web/src/lib/story-schemas.ts`:

```ts
import { z } from "zod";

// A <select> posts "" for "no system" and a string for a chosen one; the
// preprocess turns both into what the games.id_system column wants.
const idSystem = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
  z.number().int().nullable(),
);

const imageUrl = z
  .string()
  .trim()
  .pipe(z.union([z.literal(""), z.url("Please enter a valid URL.")]));

export const newStorySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Please give the story a title.")
    .max(200, "Keep the title under 200 characters."),
  idSystem,
  summary: z.string().trim().max(4000, "Keep the summary under 4000 characters."),
  imageUrl,
  isLookingForPlayers: z.boolean(),
});

export type NewStoryValues = z.infer<typeof newStorySchema>;
```

- [ ] **Step 5: Implement the helpers**

Create `apps/web/src/lib/stories.ts`:

```ts
/** Cards per fetch in every Stories section. */
export const PAGE_SIZE = 10;

/** Summaries longer than this get a "more" link that opens the full text. */
export const SUMMARY_PREVIEW_CHARS = 200;

/** The projection every list action returns and every card renders. */
export type StoryCardData = {
  idGame: number;
  gameTitle: string;
  summary: string | null;
  imageUrl: string | null;
  lastPlayed: Date;
  systemName: string | null;
  systemVersion: string | null;
  variant: string | null;
};

/** "Cypher System · Numenera (Revised)", or null when the game has no system. */
export function systemLabel(
  story: Pick<StoryCardData, "systemName" | "systemVersion" | "variant">,
): string | null {
  if (!story.systemName) return null;
  let label = story.systemName;
  if (story.variant) label += ` · ${story.variant}`;
  if (story.systemVersion) label += ` (${story.systemVersion})`;
  return label;
}

const lastPlayedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatLastPlayed(date: Date): string {
  return lastPlayedFormat.format(date);
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `just test --test-name-pattern "newStorySchema|systemLabel|formatLastPlayed"`
Expected: 11 passing.

---

### Task 5: Server actions

**Files:**
- Create: `apps/web/src/app/(app)/(nav)/home/actions.ts`
- Test: `apps/web/src/app/(app)/(nav)/home/actions.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 3), `games`, `systems`, `gamePlayers`, `gameFavorites` (Task 2), `newStorySchema`, `PAGE_SIZE`, `StoryCardData` (Task 4).
- Produces:
  - `listMyStories(offset: number): Promise<StoryCardData[]>`
  - `listFavoriteStories(offset: number): Promise<StoryCardData[]>`
  - `listLookingForPlayers(offset: number): Promise<StoryCardData[]>`
  - `getStory(idGame: number): Promise<StoryCardData | null>`
  - `listSystems(): Promise<{ idSystem: number; label: string }[]>`
  - `createStory(input: unknown): Promise<{ ok: false; errors: Record<string, string> }>` (redirects on success, so it never resolves `ok: true`)

- [ ] **Step 1: Write the failing integration test**

Create `apps/web/src/app/(app)/(nav)/home/actions.test.ts`:

```ts
// Integration test against the real database. Skipped when DATABASE_URL is
// unset so `just test` stays green offline. Relies on db/seeds/seed_games.sql
// having been applied: the seed user owns 14 games.
import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

describe("home actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    actions = await import("./actions");
  });

  it("lists the seed user's stories newest-updated first, ten at a time", async () => {
    const first = await actions.listMyStories(0);
    const second = await actions.listMyStories(10);

    expect(first).toHaveLength(10);
    expect(second.length).toBeGreaterThanOrEqual(4);
    expect(first.map((s) => s.idGame)).not.toContain(second[0].idGame);
    expect(first[0]).toMatchObject({
      gameTitle: expect.any(String),
      lastPlayed: expect.any(Date),
    });
  });

  it("joins the system onto each card", async () => {
    const all = [...(await actions.listMyStories(0)), ...(await actions.listMyStories(10))];
    const numenera = all.find((s) => s.gameTitle === "The Devil's Spine");

    expect(numenera).toMatchObject({
      systemName: "Cypher System",
      variant: "Numenera",
      systemVersion: "Revised",
    });
  });

  it("returns nothing for favorites and looking-for-players until data exists", async () => {
    expect(await actions.listFavoriteStories(0)).toEqual([]);
    expect(await actions.listLookingForPlayers(0)).toEqual([]);
  });

  it("fetches one story by id", async () => {
    const story = await actions.getStory(-1);
    expect(story?.gameTitle).toBe("Something Wicked");
    expect(await actions.getStory(999999)).toBeNull();
  });

  it("lists systems with a display label", async () => {
    const systems = await actions.listSystems();
    expect(systems.length).toBeGreaterThan(100);
    expect(systems.find((s) => s.idSystem === -26)?.label).toBe(
      "Cypher System · Numenera (Revised)",
    );
  });

  it("rejects a negative offset", async () => {
    await expect(actions.listMyStories(-1)).rejects.toThrow();
  });

  it("returns field errors for an invalid new story", async () => {
    const result = await actions.createStory({ title: "", idSystem: null, summary: "", imageUrl: "", isLookingForPlayers: false });
    expect(result).toEqual({ ok: false, errors: { title: "Please give the story a title." } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npm test -- --test-name-pattern "home actions"`
Expected: fails because `./actions` does not exist. (If it reports skipped, `DATABASE_URL` is missing from `apps/web/.env.local`.)

- [ ] **Step 3: Implement the actions**

Create `apps/web/src/app/(app)/(nav)/home/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { and, asc, desc, eq, exists, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { PAGE_SIZE, systemLabel, type StoryCardData } from "@/lib/stories";
import { newStorySchema } from "@/lib/story-schemas";

const { games, systems, gamePlayers, gameFavorites } = schema;

// Every export here is a server action: it is the only way the Stories pages
// touch the database, and each one starts by proving who is asking.

const offsetSchema = z.number().int().min(0);

// One projection shared by every list and by getStory, so the card never sees
// a shape that differs by section.
const cardColumns = {
  idGame: games.idGame,
  gameTitle: games.gameTitle,
  summary: games.summary,
  imageUrl: games.imageUrl,
  lastPlayed: games.lastPlayed,
  systemName: systems.systemName,
  systemVersion: systems.systemVersion,
  variant: systems.variant,
};

function cardQuery() {
  return db.select(cardColumns).from(games).leftJoin(systems, eq(games.idSystem, systems.idSystem));
}

/** Games the user created or plays in. */
export async function listMyStories(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  const playsIn = db
    .select({ one: gamePlayers.idGamePlayer })
    .from(gamePlayers)
    .where(and(eq(gamePlayers.idGame, games.idGame), eq(gamePlayers.idUser, user.id)));

  return cardQuery()
    .where(or(eq(games.idCreatedByUser, user.id), exists(playsIn)))
    .orderBy(desc(games.updatedAt))
    .limit(PAGE_SIZE)
    .offset(skip);
}

/** Games the user has favorited. */
export async function listFavoriteStories(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  return db
    .select(cardColumns)
    .from(games)
    .innerJoin(
      gameFavorites,
      and(eq(gameFavorites.idGame, games.idGame), eq(gameFavorites.idUser, user.id)),
    )
    .leftJoin(systems, eq(games.idSystem, systems.idSystem))
    .orderBy(desc(games.updatedAt))
    .limit(PAGE_SIZE)
    .offset(skip);
}

/** Active games whose storyteller has flagged them as open to new players. */
export async function listLookingForPlayers(offset: number): Promise<StoryCardData[]> {
  await requireUser();
  const skip = offsetSchema.parse(offset);

  return cardQuery()
    .where(and(eq(games.isLookingForPlayers, true), eq(games.isActive, true)))
    .orderBy(desc(games.updatedAt))
    .limit(PAGE_SIZE)
    .offset(skip);
}

export async function getStory(idGame: number): Promise<StoryCardData | null> {
  await requireUser();
  const id = z.number().int().parse(idGame);

  const [story] = await cardQuery().where(eq(games.idGame, id)).limit(1);
  return story ?? null;
}

export async function listSystems(): Promise<{ idSystem: number; label: string }[]> {
  await requireUser();

  const rows = await db
    .select({
      idSystem: systems.idSystem,
      systemName: systems.systemName,
      systemVersion: systems.systemVersion,
      variant: systems.variant,
    })
    .from(systems)
    .orderBy(asc(systems.systemName), asc(systems.systemVersion), asc(systems.variant));

  return rows.map((row) => ({ idSystem: row.idSystem, label: systemLabel(row) ?? row.systemName }));
}

export type CreateStoryResult = { ok: false; errors: Record<string, string> };

/**
 * Validates and inserts a new game owned by the caller, then redirects to the
 * Stories page. Validation failures come back as field errors for the form;
 * on success the redirect throws, so this never resolves with ok: true.
 */
export async function createStory(input: unknown): Promise<CreateStoryResult> {
  const user = await requireUser();

  const parsed = newStorySchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const values = parsed.data;
  await db.insert(games).values({
    gameTitle: values.title,
    idSystem: values.idSystem,
    summary: values.summary || null,
    imageUrl: values.imageUrl || null,
    isLookingForPlayers: values.isLookingForPlayers,
    idCreatedByUser: user.id,
    idUpdatedByUser: user.id,
  });

  redirect("/home");
}
```

Note on `games.idGame`: it is declared `integer(...).primaryKey()` with no `.default`, but the database column has `DEFAULT nextval(...)`. Drizzle allows omitting it in `insert().values()` only if it is optional in the insert type. If `tsc` complains that `idGame` is required, change the schema line in Task 2 to `idGame: integer("id_game").primaryKey().default(sql\`nextval('games_id_game_seq')\`)` and import `sql` (already imported in schema.ts).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npm test -- --test-name-pattern "home actions"`
Expected: 7 passing. Then `npx tsc --noEmit` with no errors.

---

### Task 6: `StoryCard`

**Files:**
- Create: `apps/web/src/components/stories/story-card.tsx`
- Test: `apps/web/src/components/stories/story-card.test.tsx`

**Interfaces:**
- Consumes: `StoryCardData`, `SUMMARY_PREVIEW_CHARS`, `systemLabel`, `formatLastPlayed` (Task 4).
- Produces: `export function StoryCard({ story }: { story: StoryCardData })`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/stories/story-card.test.tsx`:

```tsx
import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { SUMMARY_PREVIEW_CHARS } from "@/lib/stories";
import { StoryCard } from "./story-card";

const story = {
  idGame: -13,
  gameTitle: "The Devil's Spine",
  summary: "Baron Tichronius marches to war.",
  imageUrl: "https://rpg.irun.games/images/x.jpg",
  lastPlayed: new Date("2015-06-25T12:00:00Z"),
  systemName: "Cypher System",
  systemVersion: "Revised",
  variant: "Numenera",
};

describe("StoryCard", () => {
  it("shows the title as a link to the story, the system line and the date", () => {
    renderWithProviders(<StoryCard story={story} />);

    expect(screen.getByRole("link", { name: "The Devil's Spine" })).toHaveAttribute(
      "href",
      "/home/-13",
    );
    expect(screen.getByText("Cypher System · Numenera (Revised)")).toBeInTheDocument();
    expect(screen.getByText("Jun 25, 2015")).toBeInTheDocument();
    expect(screen.getByText("Baron Tichronius marches to war.")).toBeInTheDocument();
  });

  it("uses the cover image as the card background", () => {
    renderWithProviders(<StoryCard story={story} />);

    const cover = screen.getByTestId("story-cover");
    expect(cover.style.backgroundImage).toContain("https://rpg.irun.games/images/x.jpg");
  });

  it("leaves the system line out when the game has no system", () => {
    renderWithProviders(
      <StoryCard story={{ ...story, systemName: null, systemVersion: null, variant: null }} />,
    );

    expect(screen.queryByText(/Cypher/)).not.toBeInTheDocument();
  });

  it("offers 'more' only for a long summary, and opens the full text in a popover", async () => {
    const user = userEvent.setup();
    const long = "word ".repeat(SUMMARY_PREVIEW_CHARS).trim();

    renderWithProviders(<StoryCard story={{ ...story, summary: "short" }} />);
    expect(screen.queryByRole("button", { name: "more" })).not.toBeInTheDocument();

    renderWithProviders(<StoryCard story={{ ...story, summary: long }} />);
    await user.click(screen.getByRole("button", { name: "more" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(long);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `just test --test-name-pattern StoryCard`
Expected: fails because `./story-card` does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/stories/story-card.tsx`:

```tsx
"use client";

import NextLink from "next/link";
import { Box, Button, LinkBox, LinkOverlay, Popover, Portal, Stack, Text } from "@chakra-ui/react";
import {
  SUMMARY_PREVIEW_CHARS,
  formatLastPlayed,
  systemLabel,
  type StoryCardData,
} from "@/lib/stories";

// One story on the Stories page. The whole card links to the story; the
// "more" link is the one thing inside it that does something else, so it
// stops the click before LinkOverlay sees it.
export function StoryCard({ story }: { story: StoryCardData }) {
  const system = systemLabel(story);
  const summary = story.summary ?? "";
  const isLong = summary.length > SUMMARY_PREVIEW_CHARS;

  return (
    <LinkBox
      as="article"
      position="relative"
      overflow="hidden"
      rounded="xl"
      aspectRatio={{ base: 3 / 4, md: 4 / 3 }}
      color="white"
      _hover={{ boxShadow: "lg" }}
      transition="box-shadow 0.15s"
    >
      <Box
        data-testid="story-cover"
        position="absolute"
        inset="0"
        bg="gray.700"
        bgSize="cover"
        bgPos="center"
        style={story.imageUrl ? { backgroundImage: `url("${story.imageUrl}")` } : undefined}
      />
      {/* Scrim: dark at the bottom for the date, lighter but present at the top
          so the title reads on a bright cover. */}
      <Box
        position="absolute"
        inset="0"
        bgGradient="to-b"
        gradientFrom="blackAlpha.700"
        gradientVia="blackAlpha.400"
        gradientTo="blackAlpha.800"
      />

      <Stack position="relative" h="full" p="4" gap="2">
        <Stack gap="0">
          <Text as="h3" textStyle="lg" fontWeight="semibold" lineClamp={2}>
            <LinkOverlay asChild>
              <NextLink href={`/home/${story.idGame}`}>{story.gameTitle}</NextLink>
            </LinkOverlay>
          </Text>
          {system && (
            <Text textStyle="xs" color="whiteAlpha.800">
              {system}
            </Text>
          )}
        </Stack>

        {summary && (
          <Box flex="1" minH="0">
            <Text textStyle="sm" lineClamp={3} color="whiteAlpha.900">
              {summary}
            </Text>
            {isLong && (
              <Popover.Root positioning={{ placement: "bottom" }}>
                <Popover.Trigger asChild>
                  <Button
                    size="xs"
                    variant="plain"
                    color="whiteAlpha.900"
                    textDecoration="underline"
                    px="0"
                    h="auto"
                    position="relative"
                    zIndex="1"
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                    }}
                  >
                    more
                  </Button>
                </Popover.Trigger>
                <Portal>
                  <Popover.Positioner>
                    <Popover.Content maxW="sm">
                      <Popover.Arrow />
                      <Popover.Body>
                        <Text textStyle="sm">{summary}</Text>
                      </Popover.Body>
                    </Popover.Content>
                  </Popover.Positioner>
                </Portal>
              </Popover.Root>
            )}
          </Box>
        )}

        <Text textStyle="xs" color="whiteAlpha.800" alignSelf="flex-end" mt="auto">
          {formatLastPlayed(story.lastPlayed)}
        </Text>
      </Stack>
    </LinkBox>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `just test --test-name-pattern StoryCard`
Expected: 4 passing. If the popover test cannot find `role="dialog"`, check the rendered output with `screen.debug()`: Chakra's Popover content carries `role="dialog"`; if it renders lazily, add `lazyMount` to `Popover.Root` and keep `findByRole`.

Note: `preventDefault` on the trigger's click must not stop the popover opening. Chakra opens on the trigger's `onClick` before ours runs because `asChild` merges handlers with the component's own first. If the popover fails to open in the test, replace `preventDefault()` with nothing and instead give the button `type="button"` (which already prevents form submission) and rely on `stopPropagation()` alone; the LinkOverlay only reacts to clicks that reach it.

---

### Task 7: `StorySection`

**Files:**
- Create: `apps/web/src/components/stories/story-section.tsx`
- Test: `apps/web/src/components/stories/story-section.test.tsx`

**Interfaces:**
- Consumes: `StoryCard` (Task 6), `PAGE_SIZE`, `StoryCardData` (Task 4).
- Produces: `export function StorySection({ title, initialStories, loadMore }: { title: string; initialStories: StoryCardData[]; loadMore: (offset: number) => Promise<StoryCardData[]> })`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/stories/story-section.test.tsx`:

```tsx
import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { PAGE_SIZE, type StoryCardData } from "@/lib/stories";
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
  }));
}

describe("StorySection", () => {
  it("shows an empty state when there are no stories", () => {
    renderWithProviders(
      <StorySection title="My Stories" initialStories={[]} loadMore={async () => []} />,
    );

    expect(screen.getByRole("heading", { name: "My Stories" })).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("hides More when the first page came back short", () => {
    renderWithProviders(
      <StorySection title="My Stories" initialStories={stories(3)} loadMore={async () => []} />,
    );

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("loads the next page from the current length and hides More after a short page", async () => {
    const user = userEvent.setup();
    const loadMore = mock.fn<(offset: number) => Promise<StoryCardData[]>>(async () =>
      stories(2, PAGE_SIZE + 1),
    );

    renderWithProviders(
      <StorySection title="My Stories" initialStories={stories(PAGE_SIZE)} loadMore={loadMore} />,
    );

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(PAGE_SIZE + 2));
    expect(loadMore.mock.calls[0].arguments).toEqual([PAGE_SIZE]);
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();

    const section = screen.getByRole("region", { name: "My Stories" });
    expect(within(section).getByText(`Story ${PAGE_SIZE + 2}`)).toBeInTheDocument();
  });

  it("keeps More when a full page comes back", async () => {
    const user = userEvent.setup();
    const loadMore = async () => stories(PAGE_SIZE, PAGE_SIZE + 1);

    renderWithProviders(
      <StorySection title="My Stories" initialStories={stories(PAGE_SIZE)} loadMore={loadMore} />,
    );

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(PAGE_SIZE * 2));
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `just test --test-name-pattern StorySection`
Expected: fails because `./story-section` does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/stories/story-section.tsx`:

```tsx
"use client";

import { useId, useState, useTransition } from "react";
import { Box, Button, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { PAGE_SIZE, type StoryCardData } from "@/lib/stories";
import { StoryCard } from "./story-card";

type Props = {
  title: string;
  initialStories: StoryCardData[];
  /** A server action; called with the number of stories already shown. */
  loadMore: (offset: number) => Promise<StoryCardData[]>;
};

// One titled block of the Stories page. The page gives it the first page
// already fetched; every further page comes through the server action, which
// re-checks the session on each call.
export function StorySection({ title, initialStories, loadMore }: Props) {
  const headingId = useId();
  const [stories, setStories] = useState(initialStories);
  // A page shorter than PAGE_SIZE means the well is dry.
  const [hasMore, setHasMore] = useState(initialStories.length === PAGE_SIZE);
  const [isPending, startTransition] = useTransition();

  function onMore() {
    startTransition(async () => {
      try {
        const next = await loadMore(stories.length);
        setStories((current) => [...current, ...next]);
        setHasMore(next.length === PAGE_SIZE);
      } catch {
        // Leave the section as it was; the button stays so they can retry.
      }
    });
  }

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
            <StoryCard key={story.idGame} story={story} />
          ))}
        </SimpleGrid>
      )}

      {hasMore && (
        <Box>
          <Button variant="outline" onClick={onMore} loading={isPending}>
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
Expected: 4 passing. If `getByRole("region", { name })` fails, a `<section>` only has the `region` role when it has an accessible name; confirm `aria-labelledby` reaches the DOM (`Stack as="section"` forwards it).

---

### Task 8: The Stories page and the detail stub

**Files:**
- Modify: `apps/web/src/app/(app)/(nav)/home/page.tsx` (replace entirely)
- Create: `apps/web/src/app/(app)/(nav)/home/[id]/page.tsx`

**Interfaces:**
- Consumes: `listMyStories`, `listFavoriteStories`, `listLookingForPlayers`, `getStory` (Task 5); `StorySection` (Task 7); `requireSession`.

- [ ] **Step 1: Replace the home page**

`apps/web/src/app/(app)/(nav)/home/page.tsx`:

```tsx
import NextLink from "next/link";
import { Button, Container, Flex, Heading, Stack } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { StorySection } from "@/components/stories/story-section";
import { listFavoriteStories, listLookingForPlayers, listMyStories } from "./actions";

// The Stories page: the signed-in home and the "Stories" nav item are the
// same route. requireSession() here rather than trusting the group layout;
// see lib/require-session.ts for why. The three list actions each re-check
// the user against the database before querying.
export default async function HomePage() {
  await requireSession();

  const [mine, favorites, open] = await Promise.all([
    listMyStories(0),
    listFavoriteStories(0),
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

        <StorySection title="My Stories" initialStories={mine} loadMore={listMyStories} />
        <StorySection
          title="Favorite Stories"
          initialStories={favorites}
          loadMore={listFavoriteStories}
        />
        <StorySection
          title="Looking for Players"
          initialStories={open}
          loadMore={listLookingForPlayers}
        />
      </Stack>
    </Container>
  );
}
```

- [ ] **Step 2: Add the detail stub**

`apps/web/src/app/(app)/(nav)/home/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Container, Heading, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { systemLabel } from "@/lib/stories";
import { getStory } from "../actions";

// Placeholder so a card click lands somewhere. The real story page comes later.
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  const idGame = Number(id);
  if (!Number.isInteger(idGame)) notFound();

  const story = await getStory(idGame);
  if (!story) notFound();

  const system = systemLabel(story);

  return (
    <Container maxW="3xl" py="8">
      <Stack gap="2">
        <Heading size="3xl">{story.gameTitle}</Heading>
        {system && <Text color="fg.muted">{system}</Text>}
        {story.summary && <Text>{story.summary}</Text>}
      </Stack>
    </Container>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Check it in the browser**

Run: `just dev`, sign in as storyteller@irun.games, open http://localhost:3000/home.
Expected: "Stories" heading with a "New story" button top right; My Stories shows 10 cards with covers, titles, system lines and dates, plus a More button that appends the remaining 4 and then disappears; Favorite Stories and Looking for Players show "Nothing here yet."; a long summary shows "more" and opens a popover; clicking a card opens `/home/-13` and shows the title.

---

### Task 9: New story page

**Files:**
- Create: `apps/web/src/app/(app)/(nav)/home/new/page.tsx`
- Create: `apps/web/src/app/(app)/(nav)/home/new/new-story-form.tsx`
- Test: `apps/web/src/app/(app)/(nav)/home/new/new-story-form.test.tsx`

**Interfaces:**
- Consumes: `listSystems`, `createStory`, `CreateStoryResult` (Task 5); `newStorySchema`, `NewStoryValues` (Task 4).
- Produces: `export function NewStoryForm({ systems, onCreate }: { systems: { idSystem: number; label: string }[]; onCreate: (values: NewStoryValues) => Promise<CreateStoryResult> })`.

- [ ] **Step 1: Write the failing form test**

Create `apps/web/src/app/(app)/(nav)/home/new/new-story-form.test.tsx`:

```tsx
import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { NewStoryValues } from "@/lib/story-schemas";
import { NewStoryForm } from "./new-story-form";

const systems = [
  { idSystem: -6, label: "Daggerheart (1e)" },
  { idSystem: -26, label: "Cypher System · Numenera (Revised)" },
];

describe("NewStoryForm", () => {
  it("refuses to submit without a title and does not call the action", async () => {
    const user = userEvent.setup();
    const onCreate = mock.fn(async () => ({ ok: false as const, errors: {} }));

    renderWithProviders(<NewStoryForm systems={systems} onCreate={onCreate} />);
    await user.click(screen.getByRole("button", { name: "Create story" }));

    expect(await screen.findByText("Please give the story a title.")).toBeInTheDocument();
    expect(onCreate.mock.callCount()).toBe(0);
  });

  it("submits the typed values with the chosen system", async () => {
    const user = userEvent.setup();
    const onCreate = mock.fn<(values: NewStoryValues) => Promise<{ ok: false; errors: Record<string, string> }>>(
      async () => ({ ok: false, errors: {} }),
    );

    renderWithProviders(<NewStoryForm systems={systems} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.selectOptions(screen.getByLabelText(/System/), "-26");
    await user.type(screen.getByLabelText(/Summary/), "A gala in Satyrine.");
    await user.click(screen.getByLabelText(/Looking for players/));
    await user.click(screen.getByRole("button", { name: "Create story" }));

    await waitFor(() => expect(onCreate.mock.callCount()).toBe(1));
    expect(onCreate.mock.calls[0].arguments[0]).toEqual({
      title: "Embers Leap",
      idSystem: -26,
      summary: "A gala in Satyrine.",
      imageUrl: "",
      isLookingForPlayers: true,
    });
  });

  it("shows server-side field errors", async () => {
    const user = userEvent.setup();
    const onCreate = async () => ({
      ok: false as const,
      errors: { imageUrl: "Please enter a valid URL." },
    });

    renderWithProviders(<NewStoryForm systems={systems} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.type(screen.getByLabelText(/Image URL/), "https://example.com/x.jpg");
    await user.click(screen.getByRole("button", { name: "Create story" }));

    expect(await screen.findByText("Please enter a valid URL.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `just test --test-name-pattern NewStoryForm`
Expected: fails because `./new-story-form` does not exist.

- [ ] **Step 3: Implement the form**

Create `apps/web/src/app/(app)/(nav)/home/new/new-story-form.tsx`:

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Heading,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { newStorySchema, type NewStoryValues } from "@/lib/story-schemas";
import type { CreateStoryResult } from "../actions";

type Props = {
  systems: { idSystem: number; label: string }[];
  /** The createStory server action. Redirects on success. */
  onCreate: (values: NewStoryValues) => Promise<CreateStoryResult>;
};

export function NewStoryForm({ systems, onCreate }: Props) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<NewStoryValues>({
    resolver: zodResolver(newStorySchema),
    defaultValues: {
      title: "",
      idSystem: null,
      summary: "",
      imageUrl: "",
      isLookingForPlayers: false,
    },
  });

  async function onSubmit(values: NewStoryValues) {
    const result = await onCreate(values);

    // On success the action redirects and this never runs. Anything that
    // comes back is a field error the client check did not catch.
    for (const [field, message] of Object.entries(result.errors)) {
      setError(field as keyof NewStoryValues, { message });
    }
    if (Object.keys(result.errors).length === 0) {
      setError("root", { message: "Could not create the story. Please try again." });
    }
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="2xl">New story</Heading>
        <Text color="fg.muted">Give it a name and a system; the rest can wait.</Text>
      </Stack>

      {errors.root && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{errors.root.message}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap="4">
          <Field.Root required invalid={!!errors.title}>
            <Field.Label>Title</Field.Label>
            <Input autoComplete="off" {...register("title")} />
            <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.idSystem}>
            <Field.Label>System</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field {...register("idSystem")}>
                <option value="">No system</option>
                {systems.map((system) => (
                  <option key={system.idSystem} value={system.idSystem}>
                    {system.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Field.ErrorText>{errors.idSystem?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.summary}>
            <Field.Label>Summary</Field.Label>
            <Textarea rows={5} {...register("summary")} />
            <Field.ErrorText>{errors.summary?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.imageUrl}>
            <Field.Label>Image URL</Field.Label>
            <Input type="url" placeholder="https://" {...register("imageUrl")} />
            <Field.ErrorText>{errors.imageUrl?.message}</Field.ErrorText>
          </Field.Root>

          <Checkbox.Root>
            <Checkbox.HiddenInput {...register("isLookingForPlayers")} />
            <Checkbox.Control />
            <Checkbox.Label>Looking for players</Checkbox.Label>
          </Checkbox.Root>

          <Button type="submit" loading={isSubmitting || isSubmitSuccessful} alignSelf="flex-start">
            Create story
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
```

Note on the `System` select: `register("idSystem")` puts the raw `<select>` value (a string, or `""`) into the form state, and `newStorySchema`'s preprocess turns it into a number or null before `onSubmit` sees it. That is why the test expects `idSystem: -26` as a number.

- [ ] **Step 4: Run to verify it passes**

Run: `just test --test-name-pattern NewStoryForm`
Expected: 3 passing. If `getByLabelText(/Looking for players/)` fails, Chakra's `Checkbox.Root` renders a `<label>` wrapping the hidden input, so the label text should resolve; otherwise add `aria-label="Looking for players"` to `Checkbox.HiddenInput`.

- [ ] **Step 5: Add the page**

Create `apps/web/src/app/(app)/(nav)/home/new/page.tsx`:

```tsx
import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { createStory, listSystems } from "../actions";
import { NewStoryForm } from "./new-story-form";

export default async function NewStoryPage() {
  await requireSession();
  const systems = await listSystems();

  return (
    <Container maxW="lg" py="8">
      <NewStoryForm systems={systems} onCreate={createStory} />
    </Container>
  );
}
```

- [ ] **Step 6: Type-check, lint, full suite**

Run: `cd apps/web && npx tsc --noEmit && npm run lint && npm test`
Expected: all clean and green (the actions integration test runs because `.env.local` has `DATABASE_URL`).

- [ ] **Step 7: Check it in the browser**

With `just dev` running, open http://localhost:3000/home/new. Create a story with a title and system. Expected: redirect to `/home` and the new card appears first in My Stories with today's date. Then remove it so the seed stays the only data:

```bash
just psql -c "DELETE FROM games WHERE id_game > 0"
```

---

### Task 10: Documentation touch-ups

**Files:**
- Modify: `apps/web/technologies.md`
- Modify: `db/README.md`

- [ ] **Step 1: Record the data access convention**

Append to `apps/web/technologies.md` under "Technologies":

```md
- Data access: every read and write is a server action in the route's `actions.ts`, starting with `requireUser()` from `src/lib/authorize.ts`, which checks the session and the user row (exists, active) before the query runs. No separate query layer.
```

- [ ] **Step 2: Note the metatable pattern for new tables**

In `db/README.md`, under "Make a custom migration", append:

```md
New tables should register with the metatable rather than declaring audit
columns by hand: `CALL _p_update_tables();`, then
`UPDATE _tables SET needs_timestamps = TRUE, needs_user_ids = TRUE WHERE table_name = '<table>';`,
then `CALL _p_update_tables_timestamps(); CALL _p_update_tables_user_ids();`.
See `custom/create_game_favorites_table.sql` for the full pattern including
the guard that fails loudly if the table was not registered.
```

- [ ] **Step 3: Final verification**

Run: `just test && cd apps/web && npx tsc --noEmit && npm run lint && cd ../.. && git status --short`
Expected: green, and the status lists only the files in the File Structure table plus the spec, plan, seed and migration files. Nothing committed.
