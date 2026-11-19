// Integration test against the real database. Skipped when DATABASE_URL is
// unset so `just test` stays green offline. Reads a few seeded stories and
// systems (db/seeds) but writes none of them.
//
// The seed alone cannot tell a working query from `return []`: story_players,
// story_favorites and "looking for players" are all empty in it. So `before`
// inserts a second user and three stories of its own — a story the test user only
// PLAYS in, a story it merely favorites, and a flagged-but-inactive story — and
// `after` deletes them again. Every fixture id is positive and left to the
// database default, so it can never collide with the seed's negative ids.
import { after, before, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

import { initialStatus, pausePair, terminalStatus } from "@/test/workflow";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import { STORY_NOT_FOUND, STORY_NOT_YOURS } from "@/lib/messages";

const TEST_USER_EMAIL = "stories-actions@example.test";
let testUser = "";

let actions: typeof import("./actions");

// The session statuses this file needs, found in the workflow rather than
// written down: the one a session starts in, the one it ends in, and the pair
// it passes through when it pauses. See src/test/workflow.ts for why.
let statusOpen = "";
let statusDone = "";
let statusPause = "";
let statusResume = "";

let db: Db;
let tables: Tables;

const TITLE_A = "Fixture A — other's story, test user plays in it, LFP, active";
const TITLE_B = "Fixture B — other's story, test user only favorites it";
const TITLE_C = "Fixture C — other's story, LFP but inactive";
const TITLE_D = "Fixture D — test user's own story, inactive";
const TITLE_E = "Fixture E — test user's own story, archived, and favorited by them";
const TITLE_F = "Fixture F — other's story, public, run in Numenera";

let otherUserId = "";
let storyA = 0;
let storyB = 0;
let storyC = 0;
let storyD = 0;
let storyF = 0;
let storyE = 0;
let openSessionId = 0;
let doneSessionId = 0;
let pastSessionIds: number[] = [];
let fixtureStoryIds: number[] = [];

// What each write tells the players' table, mocked so the tests see which
// helper an action reached for; what the helpers send is their own test's
// business (lib/realtime/publish-scene.test.ts).
// The table's head count goes out through lib/guests, caught here.
const recountTable = mock.fn((_idStory: number) => {});
const published = {
  publishSceneChanged: mock.fn(async (..._args: unknown[]) => {}),
  publishSessionUpdated: mock.fn(async (..._args: unknown[]) => {}),
};

describeWithDb("stories actions", { email: TEST_USER_EMAIL }, (suite) => {
  before(async () => {
    ({ db, tables } = suite);
    testUser = suite.testUser;
    mock.module("@/lib/realtime/publish-scene", { namedExports: published });
    mock.module("@/lib/guests", {
      namedExports: {
        recountTable,
        removeGuests: async () => {},
        removeGuestsFrom: async () => [],
      },
    });
    actions = await import("./actions");

    const workflow = await (
      await import("@/components/status/actions")
    ).sa_listStatusOptions("story_sessions");
    statusOpen = initialStatus(workflow);
    statusDone = terminalStatus(workflow);
    ({ pause: statusPause, resume: statusResume } = pausePair(workflow));

    otherUserId = await suite.makeUser("stories-fixture-other@example.test", {
      name: "Fixture Other",
      nickName: "Other",
    });

    // RETURNING order for a multi-row INSERT is not promised, so map by title.
    const inserted = await db
      .insert(tables.stories)
      .values([
        {
          title: TITLE_A,
          idCreatedByUser: otherUserId,
          isLookingForPlayers: true,
          isActive: true,
        },
        { title: TITLE_B, idCreatedByUser: otherUserId },
        {
          title: TITLE_C,
          idCreatedByUser: otherUserId,
          isLookingForPlayers: true,
          isActive: false,
        },
        { title: TITLE_D, idCreatedByUser: testUser, isActive: false },
        {
          title: TITLE_E,
          idCreatedByUser: testUser,
          isActive: false,
          isArchived: true,
          idArchivedByUser: testUser,
        },
        // Public, so the test user may read it with no seat; -26 is Cypher
        // System · Numenera · Revised in seeds/seed_systems.sql.
        { title: TITLE_F, idCreatedByUser: otherUserId, isPublic: true, idSystem: -26 },
      ])
      .returning({ idStory: tables.stories.idStory, title: tables.stories.title });

    const idFor = (title: string) => {
      const row = inserted.find((r) => r.title === title);
      if (!row) throw new Error(`fixture story not inserted: ${title}`);
      return row.idStory;
    };
    storyA = idFor(TITLE_A);
    storyB = idFor(TITLE_B);
    storyC = idFor(TITLE_C);
    storyD = idFor(TITLE_D);
    storyE = idFor(TITLE_E);
    storyF = idFor(TITLE_F);
    fixtureStoryIds = [storyA, storyB, storyC, storyD, storyE, storyF];

    // The test user plays in A but does not own it: this is the only row that
    // exercises the exists(plays-in) branch of sa_listMyStoryPage.
    await db.insert(tables.storyPlayers).values({ idStory: storyA, idUser: testUser });

    // The test user favorites B; the OTHER user favorites A. A must never
    // reach the test user's favorites, which is what pins the idUser predicate.
    // E is archived and favorited by the test user, so it pins that an
    // archived story is off both sections of the Stories page.
    await db.insert(tables.storyFavorites).values([
      { idStory: storyB, idUser: testUser },
      { idStory: storyE, idUser: testUser },
      { idStory: storyA, idUser: otherUserId },
    ]);

    // A is at the table: its current session is open. B's current session has
    // already finished, which is what pins the status predicate rather than
    // a bare "has a current session".
    const [openSession] = await db
      .insert(tables.storySessions)
      .values({ idStory: storyA })
      .returning({ id: tables.storySessions.idStorySession });
    openSessionId = openSession.id;
    const [doneSession] = await db
      .insert(tables.storySessions)
      .values({ idStory: storyB })
      .returning({ id: tables.storySessions.idStorySession });
    doneSessionId = doneSession.id;
    await db
      .update(tables.storySessions)
      .set({ status: statusDone })
      .where(eq(tables.storySessions.idStorySession, doneSession.id));
    await db
      .update(tables.stories)
      .set({ idStorySession: openSession.id })
      .where(eq(tables.stories.idStory, storyA));
    await db
      .update(tables.stories)
      .set({ idStorySession: doneSession.id })
      .where(eq(tables.stories.idStory, storyB));

    // D's current session came back from a pause, one update per step because
    // the trigger only allows the transitions the workflow lists. It is at the
    // table just like A's.
    const [resumedSession] = await db
      .insert(tables.storySessions)
      .values({ idStory: storyD })
      .returning({ id: tables.storySessions.idStorySession });
    for (const status of [statusPause, statusResume]) {
      await db
        .update(tables.storySessions)
        .set({ status })
        .where(eq(tables.storySessions.idStorySession, resumedSession.id));
    }
    await db
      .update(tables.stories)
      .set({ idStorySession: resumedSession.id })
      .where(eq(tables.stories.idStory, storyD));

    // A has played before: five finished sessions on top of the open one, so
    // sa_listStorySessions has a full first page and one row left over. They
    // are inserted after the open session, so they are newer than it and the
    // open one is what the second page holds. The workflow trigger stamps
    // open_at with NOW() on insert and done_at on the move to done; open_at
    // is pushed back first so the generated length is 90 minutes rather
    // than the few milliseconds between the two statements.
    const pastSessions = await db
      .insert(tables.storySessions)
      .values(Array.from({ length: 5 }, () => ({ idStory: storyA })))
      .returning({ id: tables.storySessions.idStorySession });
    pastSessionIds = pastSessions.map((row) => row.id);
    await db
      .update(tables.storySessions)
      .set({ openAt: sql`now() - interval '90 minutes'` })
      .where(inArray(tables.storySessions.idStorySession, pastSessionIds));
    await db
      .update(tables.storySessions)
      .set({ status: statusDone })
      .where(inArray(tables.storySessions.idStorySession, pastSessionIds));
  });

  after(async () => {
    if (!db) return;
    if (fixtureStoryIds.length) {
      // Sessions first: stories.id_story_session points at them.
      await db
        .update(tables.stories)
        .set({ idStorySession: null })
        .where(inArray(tables.stories.idStory, fixtureStoryIds));
      await db
        .delete(tables.storySessions)
        .where(inArray(tables.storySessions.idStory, fixtureStoryIds));
      await db
        .delete(tables.storyFavorites)
        .where(inArray(tables.storyFavorites.idStory, fixtureStoryIds));
      await db
        .delete(tables.storyPlayers)
        .where(inArray(tables.storyPlayers.idStory, fixtureStoryIds));
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, fixtureStoryIds));
    }
  });

  it("lists the user's own, played-in and favorited stories on one page, searched and sorted in the database", async () => {
    const page = (over: Record<string, unknown> = {}) =>
      actions.sa_listMyStoryPage({
        search: "",
        showInactive: false,
        sortBy: "recent",
        sortDesc: true,
        offset: 0,
        ...over,
      });
    const ids = (rows: { idStory: number }[]) => rows.map((row) => row.idStory);

    // Played in (A) and only favorited (B) are both here; someone else's
    // story the user has no part in (C), their own retired one (D) and
    // their archived favorite (E) are not.
    const shown = ids(await page());
    expect(shown).toEqual(expect.arrayContaining([storyA, storyB]));
    for (const id of [storyC, storyD, storyE]) expect(shown).not.toContain(id);

    // Show inactive brings the retired story of their own, never the archived one.
    const withInactive = ids(await page({ showInactive: true }));
    expect(withInactive).toContain(storyD);
    expect(withInactive).not.toContain(storyE);
    expect(withInactive).not.toContain(storyC);

    // The search runs over stories.search_text.
    expect(ids(await page({ search: "only favorites it" }))).toEqual([storyB]);
    expect(await page({ search: "nothing has this in it" })).toEqual([]);

    // And over the story's system, by its name, version or variant: B is
    // given a fixture system of its own for this, and loses it after.
    const [system] = await db
      .insert(tables.systems)
      .values({
        systemName: "Fixture Stories Search System",
        systemVersion: "9th",
        variant: "Revised",
      })
      .returning({ idSystem: tables.systems.idSystem });
    await db
      .update(tables.stories)
      .set({ idSystem: system.idSystem })
      .where(eq(tables.stories.idStory, storyB));
    try {
      expect(ids(await page({ search: "stories search system" }))).toEqual([storyB]);
      expect(ids(await page({ search: "9th" }))).toContain(storyB);
      expect(ids(await page({ search: "System 9th Revised" }))).toEqual([storyB]);
      // Sorted by system: the labels in order, case set aside, and the
      // stories with no system after them all.
      const bySystem = await page({ sortBy: "system", sortDesc: false });
      const labels = bySystem.map((row) =>
        row.systemName
          ? [row.systemName, row.systemVersion, row.variant].filter(Boolean).join(" ").toLowerCase()
          : null,
      );
      const named = labels.filter((label): label is string => label !== null);
      expect(named).toEqual([...named].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      expect(labels.slice(named.length).every((label) => label === null)).toBe(true);
      expect(named).toContain("fixture stories search system 9th revised");
      // Sorted by when last played, newest first.
      const stamps = (await page({ sortBy: "lastPlayed", sortDesc: true })).map((row) =>
        row.lastPlayed.getTime(),
      );
      expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
    } finally {
      await db
        .update(tables.stories)
        .set({ idSystem: null })
        .where(eq(tables.stories.idStory, storyB));
      await db.delete(tables.systems).where(eq(tables.systems.idSystem, system.idSystem));
    }

    // Sorted by favorite, the favorites come first, and last the other way.
    const byFavorite = await page({ sortBy: "favorite", sortDesc: true });
    expect(byFavorite[0].idStory).toBe(storyB);
    expect(byFavorite[0].isFavorite).toBe(true);
    const unfavoriteFirst = await page({ sortBy: "favorite", sortDesc: false });
    expect(unfavoriteFirst.at(-1)?.idStory).toBe(storyB);

    // Sorted by title, case set aside; by a count, the counts in order.
    const byTitle = (await page({ sortBy: "title", sortDesc: false })).map((row) =>
      row.title.toLowerCase(),
    );
    expect(byTitle).toEqual([...byTitle].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    const bySessions = (await page({ sortBy: "sessions", sortDesc: true })).map(
      (row) => row.sessionCount,
    );
    expect(bySessions).toEqual([...bySessions].sort((a, b) => b - a));
    const byStatus = await page({ showInactive: true, sortBy: "status", sortDesc: false });
    expect(byStatus[0].isActive).toBe(false);

    // A query that is out of bounds is an empty page, not an error.
    expect(await page({ sortBy: "nonsense" })).toEqual([]);
    expect(await page({ offset: -1 })).toEqual([]);
  });

  it("counts who is waiting on a card, leaving out the viewer", async () => {
    // Both waiting for story A: the viewer (the test user) and one other.
    // Rows cascade away with the fixture stories in after().
    await db.insert(tables.sessionPlayers).values([
      { idStory: storyA, idCreatedByUser: testUser },
      { idStory: storyA, idCreatedByUser: otherUserId },
    ]);
    try {
      expect((await actions.sa_getStory(storyA))?.waitingCount).toBe(1);
    } finally {
      await db.delete(tables.sessionPlayers).where(eq(tables.sessionPlayers.idStory, storyA));
    }
  });

  it("joins the system onto each card", async () => {
    // Read straight from sa_getStory, which builds the same card as the
    // lists, rather than by paging My Stories for it: the suites that run
    // alongside this one add and touch the test user's stories, so which
    // page a story sits on can change between one page and the next. F is
    // public, so the test user may read it with no seat.
    const numenera = await actions.sa_getStory(storyF);

    expect(numenera).toMatchObject({
      systemName: "Cypher System",
      variant: "Numenera",
      systemVersion: "Revised",
    });
  });

  it("returns only the caller's own favorites", async () => {
    const ids = (await actions.sa_listFavoriteStories(0)).map((s) => s.idStory);

    // Scoped to the fixtures so a real favorite the owner adds while poking at
    // the UI does not fail the suite. The equality still pins the idUser
    // predicate: the OTHER user favorites A, and A must not appear.
    expect(ids.filter((id) => fixtureStoryIds.includes(id))).toEqual([storyB]);
    expect(ids).not.toContain(storyA);
  });

  it("returns only active stories that are looking for players", async () => {
    const ids = (await actions.sa_listLookingForPlayers(0)).map((s) => s.idStory);

    // Scoped to the fixtures so a real story flagged through the UI does not
    // fail the suite. A is flagged + active; C is flagged but inactive and
    // must be filtered out by is_active.
    expect(ids.filter((id) => fixtureStoryIds.includes(id))).toEqual([storyA]);
    expect(ids).not.toContain(storyC);
  });

  it("fetches one story by id", async () => {
    // The edit tests below rename D, so the title to expect is read from the
    // row rather than written down: the case is that the id fetches its own
    // story.
    const [own] = await db
      .select({ title: tables.stories.title })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, storyD));
    const story = await actions.sa_getStory(storyD);
    expect(story?.title).toBe(own.title);
    expect(await actions.sa_getStory(999999)).toBeNull();
    // Beyond int4: Postgres would error on the comparison, so the id is
    // rejected before the query and the page's notFound() takes over.
    expect(await actions.sa_getStory(3000000000)).toBeNull();
  });

  it("lists a story's players by display name, in the order they joined", async () => {
    // Both seated on D at one joined_at, so the name breaks the tie: the
    // other user by their nickname, the test user, who has none, by name.
    const joinedAt = new Date();
    await db.insert(tables.storyPlayers).values([
      { idStory: storyD, idUser: testUser, joinedAt },
      { idStory: storyD, idUser: otherUserId, joinedAt },
    ]);
    try {
      expect(await actions.sa_listStoryPlayers(storyD)).toEqual([
        { idUser: otherUserId, name: "Other", image: null },
        { idUser: testUser, name: "Test User", image: null },
      ]);
    } finally {
      await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, storyD));
    }
  });

  it("returns no players for a story without any, or with an unusable id", async () => {
    // F is public and nobody is seated on it.
    expect(await actions.sa_listStoryPlayers(storyF)).toEqual([]);
    expect(await actions.sa_listStoryPlayers(3000000000)).toEqual([]);
  });

  it("reads a story only as its storyteller, a player, or when it is public or advertised", async () => {
    // B is the other user's, private and not advertised, and the test user
    // has no seat there: every read of it is empty, as for a story that is
    // not there, and a favorite cannot be put on it. Made public, or
    // advertised while active (the Find list shows those to everyone), the
    // same reads answer.
    const none = { previous: null, next: null };
    const reads = async () => ({
      story: (await actions.sa_getStory(storyB))?.idStory ?? null,
      sessions: (await actions.sa_listStorySessions(storyB, 0)).length,
      count: await actions.sa_countStorySessions(storyB),
      players: await actions.sa_listStoryPlayers(storyB),
      neighbours: await actions.sa_getStorySessionNeighbours(doneSessionId),
    });
    const flags = async (values: {
      isPublic: boolean;
      isLookingForPlayers: boolean;
      isActive: boolean;
    }) => db.update(tables.stories).set(values).where(eq(tables.stories.idStory, storyB));

    try {
      expect(await reads()).toEqual({
        story: null,
        sessions: 0,
        count: 0,
        players: [],
        neighbours: none,
      });
      expect(await actions.sa_setFavorite(storyB, true)).toEqual({
        ok: false,
        error: STORY_NOT_FOUND,
      });

      await flags({ isPublic: true, isLookingForPlayers: false, isActive: true });
      const asPublic = await reads();
      expect(asPublic.story).toBe(storyB);
      expect(asPublic.sessions).toBeGreaterThan(0);
      expect(asPublic.count).toBe(asPublic.sessions);

      await flags({ isPublic: false, isLookingForPlayers: true, isActive: true });
      expect((await reads()).story).toBe(storyB);

      // Advertised but retired is not on the Find list, so not public either.
      await flags({ isPublic: false, isLookingForPlayers: true, isActive: false });
      expect((await reads()).story).toBeNull();
    } finally {
      await flags({ isPublic: false, isLookingForPlayers: false, isActive: true });
    }
  });

  it("finds players by name, nickname or email, ten at most, case blind", async () => {
    // D is the test user's own story, so they may search for players for it.
    const byNick = await actions.sa_searchPlayers(storyD, "HERMIONE");
    expect(byNick).toEqual([
      {
        idUser: "00000000-0000-7000-8000-000000000009",
        name: "Hermione",
        email: "hermione.granger@example.com",
        image: null,
      },
    ]);

    // Prefixed with the suite's name: the play and library suites run
    // alongside this one with fixture users of their own, and a bare
    // "fixture-other@" matched theirs too.
    const byEmail = await actions.sa_searchPlayers(storyD, "stories-fixture-other@");
    expect(byEmail.map((m) => m.idUser)).toEqual([otherUserId]);

    // "e" is in nearly every seed address, so this is where the cap bites.
    const many = await actions.sa_searchPlayers(storyD, "e");
    expect(many).toHaveLength(10);
  });

  it("searches nothing for a blank query and leaves out the caller and the seated", async () => {
    expect(await actions.sa_searchPlayers(storyD, "")).toEqual([]);
    expect(await actions.sa_searchPlayers(storyD, "   ")).toEqual([]);

    // The test user is the storyteller of D: they cannot invite themselves.
    expect(await actions.sa_searchPlayers(storyD, TEST_USER_EMAIL)).toEqual([]);

    // PaulKhash already plays in Vampire (-15). D has nobody seated, so from
    // D they match; from Vampire they would not, but Vampire belongs to
    // PalmDave, so it is the fixture below that pins the exclusion.
    expect((await actions.sa_searchPlayers(storyD, "PaulKhash")).map((m) => m.name)).toEqual([
      "PaulKhash",
    ]);
  });

  it("refuses to search for, or add to, a story the caller did not create", async () => {
    expect(await actions.sa_searchPlayers(storyA, "her")).toEqual([]);
    expect(await actions.sa_addStoryPlayers(storyA, [otherUserId])).toEqual({
      ok: false,
      error: STORY_NOT_YOURS,
    });
    // An id that is not a story's, or no story's, answers as someone else's
    // story does: the popover is only ever shown to the owner of one that is.
    expect(await actions.sa_searchPlayers(2 ** 40, "her")).toEqual([]);
    expect(await actions.sa_searchPlayers(2147483647, "her")).toEqual([]);
  });

  it("seats the chosen users, skips anyone already seated, and returns who was added", async () => {
    const added = await actions.sa_addStoryPlayers(storyD, [
      otherUserId,
      "00000000-0000-7000-8000-000000000009",
    ]);
    expect(added).toEqual({
      ok: true,
      players: [
        { idUser: "00000000-0000-7000-8000-000000000009", name: "Hermione", image: null },
        { idUser: otherUserId, name: "Other", image: null },
      ],
    });

    // Seated players no longer match a search, and adding them again seats
    // nobody twice.
    expect(await actions.sa_searchPlayers(storyD, "Hermione")).toEqual([]);
    expect(await actions.sa_addStoryPlayers(storyD, [otherUserId])).toEqual({
      ok: true,
      players: [],
    });

    const seated = await actions.sa_listStoryPlayers(storyD);
    expect(seated.map((p) => p.idUser).sort()).toEqual(
      [otherUserId, "00000000-0000-7000-8000-000000000009"].sort(),
    );
    const rows = await db
      .select()
      .from(tables.storyPlayers)
      .where(eq(tables.storyPlayers.idStory, storyD));
    expect(rows).toHaveLength(2);
  });

  it("will not seat the storyteller, an unknown user, or more than ten at once", async () => {
    const nobody = { ok: true, players: [] };
    expect(await actions.sa_addStoryPlayers(storyD, [testUser])).toEqual(nobody);
    expect(
      await actions.sa_addStoryPlayers(storyD, ["00000000-0000-7000-8000-0000000000ff"]),
    ).toEqual(nobody);
    const refused = { ok: false, error: "Choose whom to invite." };
    expect(await actions.sa_addStoryPlayers(storyD, ["not-a-uuid"])).toEqual(refused);
    expect(
      await actions.sa_addStoryPlayers(
        storyD,
        Array.from(
          { length: 11 },
          (_, i) => `00000000-0000-7000-8000-0000000000${String(i).padStart(2, "0")}`,
        ),
      ),
    ).toEqual(refused);
  });

  it("lists a story's sessions newest first, five at a time, with their length", async () => {
    const first = await actions.sa_listStorySessions(storyA, 0);
    expect(first.map((s) => s.idStorySession)).toEqual([...pastSessionIds].sort((a, b) => b - a));
    // Numbered in opening order: the open session was first, so the five
    // after it run 2 to 6, newest first here. None has a title yet.
    expect(first.map((s) => s.number)).toEqual([6, 5, 4, 3, 2]);
    for (const session of first) {
      expect(session.status).toBe(statusDone);
      expect(session.length).toBe(90);
      expect(session.title).toBeNull();
      expect(session.startedAt).toBeInstanceOf(Date);
    }

    // The open session is the oldest, so it is all the second page holds,
    // and it has no length yet.
    const second = await actions.sa_listStorySessions(storyA, 5);
    expect(second).toHaveLength(1);
    expect(second[0].idStorySession).toBe(openSessionId);
    expect(second[0].number).toBe(1);
    expect(second[0].status).toBe(statusOpen);
    expect(second[0].length).toBeNull();
  });

  it("leaves the time a session sat suspended out of its length", async () => {
    // On D, the test user's own story, so the list is theirs to read.
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: storyD })
      .returning({ id: tables.storySessions.idStorySession });
    // PgUpdateSetSource rather than the insert type so a value may be SQL.
    const set = (values: PgUpdateSetSource<typeof tables.storySessions>) =>
      db
        .update(tables.storySessions)
        .set(values)
        .where(eq(tables.storySessions.idStorySession, session.id));

    // Opened 90 minutes ago, paused 30 minutes ago, resumed now and finished
    // now: an hour at the table. The workflow trigger stamps suspended_at with
    // NOW() as the row enters the pause, so it is pushed back afterwards, in
    // its own statement, the way open_at is for the page-one fixtures.
    await set({ openAt: sql`now() - interval '90 minutes'` });
    await set({ status: statusPause });
    await set({ suspendedAt: sql`now() - interval '30 minutes'` });
    await set({ status: statusResume });
    await set({ status: statusDone });

    const sessions = await actions.sa_listStorySessions(storyD, 0);
    expect(sessions.find((s) => s.idStorySession === session.id)?.length).toBe(60);
  });

  it("returns no sessions for a story without any, or with an unusable id", async () => {
    // F is public and has never been played.
    expect(await actions.sa_listStorySessions(storyF, 0)).toEqual([]);
    expect(await actions.sa_listStorySessions(2 ** 40, 0)).toEqual([]);
  });

  it("describes one session: its number, who came, and the notes only for the storyteller", async () => {
    // A is another user's story, so the caller is a player there: the
    // open session is its first, and the notes stay private.
    await db
      .update(tables.storySessions)
      .set({
        title: "Fixture session",
        summary: "What happened.",
        notes: "Private.",
        lingeringQuestions: "Why?",
      })
      .where(eq(tables.storySessions.idStorySession, openSessionId));
    // Who came, as the live table records it: a session_players row each,
    // PRESENT at the session. They go with the session when the story's
    // fixtures are cleared (ON DELETE CASCADE).
    await db.insert(tables.sessionPlayers).values(
      [otherUserId, testUser].map((idUser) => ({
        idStory: storyA,
        idStorySession: openSessionId,
        status: "PRESENT",
        idCreatedByUser: idUser,
        idUpdatedByUser: idUser,
      })),
    );
    // The sitting's picture is an attachments row now, not a column of its
    // own, so the fixture attaches one the way the uploader would.
    const [picture] = await db
      .insert(tables.attachments)
      .values({
        status: "READY",
        url: "https://x.test/hero.jpg",
        idCreatedByUser: otherUserId,
        idUpdatedByUser: otherUserId,
      })
      .returning({ id: tables.attachments.idAttachment });
    // The sitting's cover is its use of the picture; the use's trigger gives
    // the picture the sitting's story.
    await db.insert(tables.attachmentUses).values({
      idAttachment: picture.id,
      kind: "STORY_SESSION",
      idExternal: openSessionId,
      tags: ["cover"],
      idCreatedByUser: otherUserId,
      idUpdatedByUser: otherUserId,
    });

    // finally, because the row is READY and every later case in this file
    // reads through the same projections: an assertion failing below must not
    // leave a picture hanging off the fixture sitting.
    try {
      const detail = await actions.sa_getStorySession(openSessionId);
      expect(detail).toMatchObject({
        idStorySession: openSessionId,
        number: 1,
        title: "Fixture session",
        status: statusOpen,
        length: null,
        imageLink: "https://x.test/hero.jpg",
        summary: "What happened.",
        // The test user plays in A, and the notes are the table's: the
        // players read what they and the storyteller wrote up there.
        notes: "Private.",
        lingeringQuestions: "Why?",
      });
      expect(detail?.players.map((p) => p.idUser).sort()).toEqual([otherUserId, testUser].sort());
      expect(detail?.players.find((p) => p.idUser === otherUserId)?.name).toBe("Other");

      // The five past sessions were opened after it, in one statement, so the
      // id breaks the tie and the highest is the sixth.
      const newest = await actions.sa_getStorySession(Math.max(...pastSessionIds));
      expect(newest?.number).toBe(6);
      expect(newest?.length).toBe(90);
      expect(newest?.players).toEqual([]);

      // D is the caller's own story, so its notes come back.
      const [current] = await actions.sa_listStorySessions(storyD, 0);
      await db
        .update(tables.storySessions)
        .set({ notes: "Mine.", lingeringQuestions: "Still mine." })
        .where(eq(tables.storySessions.idStorySession, current.idStorySession));
      expect(await actions.sa_getStorySession(current.idStorySession)).toMatchObject({
        notes: "Mine.",
        lingeringQuestions: "Still mine.",
      });

      expect(await actions.sa_getStorySession(2 ** 40)).toBeNull();
      expect(await actions.sa_getStorySession(2 ** 30)).toBeNull();
    } finally {
      await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, picture.id));
      await db
        .delete(tables.sessionPlayers)
        .where(eq(tables.sessionPlayers.idStorySession, openSessionId));
    }
  });

  it("lists systems with a display label", async () => {
    const systems = await actions.sa_listSystems();
    expect(systems.length).toBeGreaterThan(100);
    expect(systems.find((s) => s.idSystem === -26)?.label).toBe(
      "Cypher System · Numenera (Revised)",
    );
  });

  it("returns field errors for an invalid new story", async () => {
    const result = await actions.sa_createStory({
      title: "",
      idSystem: null,
      summary: "",
      isLookingForPlayers: false,
      isActive: true,
      isArchived: false,
      isPublic: false,
    });
    expect(result).toEqual({ ok: false, errors: { title: "Please give the story a title." } });
  });

  it("hands the storyteller their story's values for the edit form, and nobody else", async () => {
    // D is the test user's own story; A is the other user's, though the seed
    // user plays in it, which is what pins the check to the creator.
    expect(await actions.sa_getStoryForEdit(storyD)).toEqual({
      title: TITLE_D,
      idSystem: null,
      summary: "",
      isLookingForPlayers: false,
      isActive: false,
      isArchived: false,
      isPublic: false,
    });
    expect(await actions.sa_getStoryForEdit(storyA)).toBeNull();
    expect(await actions.sa_getStoryForEdit(2 ** 40)).toBeNull();
  });

  it("saves the edit form over the caller's own story and refuses anyone else's", async () => {
    const values = {
      title: `${TITLE_D} (edited)`,
      idSystem: -26,
      summary: "Now with a summary.",
      isLookingForPlayers: true,
      // D stays inactive: the fixture is what the "hides inactive" test below
      // relies on, and the edit tests only borrow it.
      isActive: false,
      isArchived: false,
      isPublic: true,
    };

    // On success the action redirects, which Next implements by throwing.
    await expect(actions.sa_updateStory(storyD, values)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await actions.sa_getStoryForEdit(storyD)).toEqual(values);
    const [row] = await db
      .select({ idUpdatedByUser: tables.stories.idUpdatedByUser })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, storyD));
    expect(row.idUpdatedByUser).toBe(testUser);

    // A is the other user's; the test user plays in it, which is exactly
    // what must not be enough.
    const notYours = { ok: false, errors: { root: STORY_NOT_YOURS } };
    expect(await actions.sa_updateStory(storyA, values)).toEqual(notYours);
    expect((await actions.sa_getStory(storyA))?.title).toBe(TITLE_A);
    expect(await actions.sa_updateStory(2 ** 30, values)).toEqual(notYours);

    expect(await actions.sa_updateStory(storyD, { ...values, title: "" })).toEqual({
      ok: false,
      errors: { title: "Please give the story a title." },
    });
  });

  it("keeps the story's copy of its system's stat block definition through an edit, and lets it go with the system only when told it goes", async () => {
    const values = {
      title: TITLE_D,
      idSystem: -26,
      summary: "",
      isLookingForPlayers: false,
      isActive: false,
      isArchived: false,
      isPublic: false,
    };
    const copy = { groups: [], updatedAt: "2026-11-01T00:00:00.000Z" };
    const row = async () =>
      (
        await db
          .select({ idSystem: tables.stories.idSystem, copy: tables.stories.statBlockDefinition })
          .from(tables.stories)
          .where(eq(tables.stories.idStory, storyD))
      )[0];
    await db
      .update(tables.stories)
      .set({ idSystem: -26, statBlockDefinition: copy })
      .where(eq(tables.stories.idStory, storyD));

    await expect(actions.sa_updateStory(storyD, values)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await row()).toEqual({ idSystem: -26, copy });
    // The copy was of Numenera's definition; The Strange has its own. A save
    // that was not told the copy goes changes nothing, the form's warning
    // being the only way to say it.
    expect(await actions.sa_updateStory(storyD, { ...values, idSystem: -27 })).toEqual({
      ok: false,
      errors: {
        idSystem:
          "This story has its own stat block, which changing its system would delete. Reload the page to see what goes.",
      },
    });
    expect(await row()).toEqual({ idSystem: -26, copy });
    await expect(
      actions.sa_updateStory(storyD, { ...values, idSystem: -27 }, { dropStatBlock: true }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await row()).toEqual({ idSystem: -27, copy: null });
  });

  it("archives a story as inactive and not looking for players, stamped with the archiver, and undoes all of it", async () => {
    const values = {
      title: TITLE_D,
      idSystem: null,
      summary: "",
      isLookingForPlayers: true,
      isActive: true,
      isArchived: true,
      isPublic: false,
    };
    const archival = () =>
      db
        .select({
          isActive: tables.stories.isActive,
          isLookingForPlayers: tables.stories.isLookingForPlayers,
          isArchived: tables.stories.isArchived,
          archivedAt: tables.stories.archivedAt,
          idArchivedByUser: tables.stories.idArchivedByUser,
        })
        .from(tables.stories)
        .where(eq(tables.stories.idStory, storyD))
        .then(([row]) => row);

    await expect(actions.sa_updateStory(storyD, values)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await archival()).toEqual({
      isActive: false,
      isLookingForPlayers: false,
      isArchived: true,
      archivedAt: expect.any(Date),
      idArchivedByUser: testUser,
    });

    // Unarchiving posts the boxes as the form left them, inactive here so
    // the fixture keeps its meaning for the tests that follow, and the
    // database clears what it stamped.
    await expect(
      actions.sa_updateStory(storyD, { ...values, isArchived: false, isActive: false }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await archival()).toEqual({
      isActive: false,
      isLookingForPlayers: true,
      isArchived: false,
      archivedAt: null,
      idArchivedByUser: null,
    });
  });

  // Every story on the caller's Stories page, read through the page's own
  // action as the page reads it, touched last first.
  async function myStories(showInactive = false) {
    return actions.sa_listMyStoryPage({
      search: "",
      showInactive,
      sortBy: "recent",
      sortDesc: true,
      offset: 0,
    });
  }

  it("marks each card with whether the caller has favorited it", async () => {
    const mine = await myStories();
    const cardA = mine.find((s) => s.idStory === storyA);
    expect(cardA?.isFavorite).toBe(false); // the OTHER user favorited A, not the caller

    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.find((s) => s.idStory === storyB)?.isFavorite).toBe(true);
  });

  it("marks a card whose current session is open, and not one whose session is done", async () => {
    const open = await actions.sa_listLookingForPlayers(0);
    expect(open.find((s) => s.idStory === storyA)?.hasOpenSession).toBe(true);

    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.find((s) => s.idStory === storyB)?.hasOpenSession).toBe(false);

    // No current session at all. A fixture rather than a seed story: the
    // seed stories are the ones played in development, and any of them may
    // have a session open while the tests run.
    expect((await actions.sa_getStory(storyE))?.hasOpenSession).toBe(false);

    // Resumed after a pause counts as open: the table is in play again.
    expect((await actions.sa_getStory(storyD))?.hasOpenSession).toBe(true);
  });

  it("counts each card's players", async () => {
    const all = await myStories(true);
    // The test user is fixture A's only player.
    expect(all.find((s) => s.idStory === storyA)?.playerCount).toBe(1);

    // A second seat on A is counted.
    await db.insert(tables.storyPlayers).values({ idStory: storyA, idUser: otherUserId });
    try {
      const again = await myStories(true);
      expect(again.find((s) => s.idStory === storyA)?.playerCount).toBe(2);
    } finally {
      await db
        .delete(tables.storyPlayers)
        .where(
          and(eq(tables.storyPlayers.idStory, storyA), eq(tables.storyPlayers.idUser, otherUserId)),
        );
    }
  });

  it("hides the caller's inactive stories unless asked to show them", async () => {
    const all = async (showInactive: boolean) => await myStories(showInactive);

    const hidden = (await all(false)).map((s) => s.idStory);
    expect(hidden).not.toContain(storyD);
    expect(hidden).toContain(storyA);

    const shown = await all(true);
    expect(shown.map((s) => s.idStory)).toContain(storyD);
    expect(shown.find((s) => s.idStory === storyD)?.isActive).toBe(false);
    expect(shown.find((s) => s.idStory === storyA)?.isActive).toBe(true);
  });

  it("leaves an archived story off My Stories, even with inactive shown, and off Favorites", async () => {
    const mine = await myStories(true);
    expect(mine.map((s) => s.idStory)).toContain(storyD);
    expect(mine.map((s) => s.idStory)).not.toContain(storyE);

    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.map((s) => s.idStory)).toContain(storyB);
    expect(favorites.map((s) => s.idStory)).not.toContain(storyE);

    // Still there for its storyteller to unarchive.
    expect((await actions.sa_getStoryForEdit(storyE))?.isArchived).toBe(true);
  });

  it("marks each card with whether the caller owns it", async () => {
    const mine = await myStories(true);
    expect(mine.find((s) => s.idStory === storyD)?.isOwner).toBe(true); // created it
    expect(mine.find((s) => s.idStory === storyA)?.isOwner).toBe(false); // only plays in it
  });

  it("names each card's storyteller, preferring their nickname", async () => {
    const mine = await myStories(true);
    expect(mine.find((s) => s.idStory === storyA)?.storytellerName).toBe("Other"); // nickname set
    expect(mine.find((s) => s.idStory === storyD)?.storytellerName).toBe("Test User"); // none

    // The favorites list builds its joins separately, so it is checked too.
    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.find((s) => s.idStory === storyB)?.storytellerName).toBe("Other");
  });

  it("retires a story and brings it back from the list's pill, for its storyteller and an administrator", async () => {
    const activeOf = async (id: number) =>
      (
        await db
          .select({ isActive: tables.stories.isActive })
          .from(tables.stories)
          .where(eq(tables.stories.idStory, id))
      )[0].isActive;

    // The storyteller's own story goes both ways (D is the test user's,
    // retired); another's is not found.
    expect(await actions.sa_setStoryActive(storyD, true)).toEqual({ ok: true, isActive: true });
    expect(await activeOf(storyD)).toBe(true);
    expect(await actions.sa_setStoryActive(storyD, false)).toEqual({ ok: true, isActive: false });
    expect(await activeOf(storyD)).toBe(false);
    expect(await actions.sa_setStoryActive(storyB, false)).toEqual({
      ok: false,
      error: STORY_NOT_FOUND,
    });
    expect(await activeOf(storyB)).toBe(true);
    // Anything but a boolean is refused the same way.
    expect(await actions.sa_setStoryActive(storyD, "no")).toEqual({
      ok: false,
      error: STORY_NOT_FOUND,
    });

    // An administrator may move any story. The test user is made one for
    // the moment and put back after.
    const [{ idUserType }] = await db
      .select({ idUserType: tables.user.idUserType })
      .from(tables.user)
      .where(eq(tables.user.id, testUser));
    await db.update(tables.user).set({ idUserType: -100 }).where(eq(tables.user.id, testUser));
    try {
      expect(await actions.sa_setStoryActive(storyB, false)).toEqual({
        ok: true,
        isActive: false,
      });
      expect(await actions.sa_setStoryActive(storyB, true)).toEqual({ ok: true, isActive: true });
    } finally {
      await db.update(tables.user).set({ idUserType }).where(eq(tables.user.id, testUser));
    }
  });

  it("holds an account to its active stories: no new one, and none brought back, at the limit", async () => {
    // The test user is an unpaid player (makeTestUser), so three; they own
    // D (retired) and E (archived) and nothing active.
    expect(await actions.sa_getStoryAllowance()).toEqual({ active: 0, limit: 3 });
    const full = await db
      .insert(tables.stories)
      .values(
        [1, 2, 3].map((n) => ({
          title: `Fixture active story ${n} of 3`,
          idCreatedByUser: testUser,
          isActive: true,
        })),
      )
      .returning({ idStory: tables.stories.idStory });
    const message =
      "You already have 3 active stories, the most at a time. Make one inactive to start or bring back another.";
    try {
      expect(await actions.sa_getStoryAllowance()).toEqual({ active: 3, limit: 3 });
      expect(
        await actions.sa_createStory({
          title: "Fixture story one too many",
          idSystem: null,
          summary: "",
          isLookingForPlayers: false,
          isActive: true,
          isArchived: false,
          isPublic: false,
        }),
      ).toEqual({ ok: false, errors: { root: message } });
      expect(
        await db
          .select({ id: tables.stories.idStory })
          .from(tables.stories)
          .where(eq(tables.stories.title, "Fixture story one too many")),
      ).toEqual([]);

      // Bringing a retired story back counts the same, from the pill and
      // from Edit story; retiring one is always allowed.
      expect(await actions.sa_setStoryActive(storyD, true)).toEqual({ ok: false, error: message });
      const values = await actions.sa_getStoryForEdit(storyD);
      expect(await actions.sa_updateStory(storyD, { ...values!, isActive: true })).toEqual({
        ok: false,
        errors: { root: message },
      });
      expect(
        (
          await db
            .select({ isActive: tables.stories.isActive })
            .from(tables.stories)
            .where(eq(tables.stories.idStory, storyD))
        )[0].isActive,
      ).toBe(false);
      expect(await actions.sa_setStoryActive(full[0].idStory, false)).toEqual({
        ok: true,
        isActive: false,
      });
      // One below the limit again, so D may come back.
      expect(await actions.sa_setStoryActive(storyD, true)).toEqual({ ok: true, isActive: true });
      await actions.sa_setStoryActive(storyD, false);
    } finally {
      await db.delete(tables.stories).where(
        inArray(
          tables.stories.idStory,
          full.map((row) => row.idStory),
        ),
      );
    }
  });

  it("adds and removes a favorite for the caller only, idempotently", async () => {
    // F is the other user's, public, so the test user may read and favorite it.
    expect(await actions.sa_setFavorite(storyF, true)).toEqual({ ok: true, isFavorite: true });
    // A second add must not trip the (id_story, id_user) unique constraint.
    expect(await actions.sa_setFavorite(storyF, true)).toEqual({ ok: true, isFavorite: true });

    let ids = (await actions.sa_listFavoriteStories(0)).map((s) => s.idStory);
    expect(ids).toContain(storyF);

    expect(await actions.sa_setFavorite(storyF, false)).toEqual({ ok: true, isFavorite: false });
    ids = (await actions.sa_listFavoriteStories(0)).map((s) => s.idStory);
    expect(ids).not.toContain(storyF);

    // The other user's favorite on A is untouched by any of the above.
    const otherRows = await db
      .select({ id: tables.storyFavorites.idStoryFavorite })
      .from(tables.storyFavorites)
      .where(eq(tables.storyFavorites.idUser, otherUserId));
    expect(otherRows).toHaveLength(1);
  });

  it("refuses to favorite a story that does not exist", async () => {
    expect(await actions.sa_setFavorite(999999, true)).toEqual({
      ok: false,
      error: STORY_NOT_FOUND,
    });
  });

  it("gives the storyteller the sitting's scenes, in the order they were played", async () => {
    // On storyD, which the test user owns: scenes are the storyteller's, and
    // the caller is only the storyteller of their own stories.
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: storyD, title: "Scene ordering" })
      .returning({ id: tables.storySessions.idStorySession });

    // Three scenes, run in an order that is neither the order they were
    // written nor the order of their ids.
    const rows = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: storyD, idStorySession: session.id, sceneTitle: "Scene written first" },
        { idStory: storyD, idStorySession: session.id, sceneTitle: "Scene written second" },
        { idStory: storyD, idStorySession: session.id, sceneTitle: "Scene never run" },
      ])
      .returning({ id: tables.storyScenes.idStoryScene, title: tables.storyScenes.sceneTitle });
    const idOf = (title: string) => rows.find((row) => row.title === title)!.id;

    // active_at is what the workflow stamps as a scene comes up at the table;
    // written here directly, since moving the rows through the workflow would
    // stamp them all within the same millisecond.
    await db
      .update(tables.storyScenes)
      .set({ activeAt: sql`now() - interval '10 minutes'` })
      .where(eq(tables.storyScenes.idStoryScene, idOf("Scene written second")));
    await db
      .update(tables.storyScenes)
      .set({ activeAt: sql`now() - interval '5 minutes'` })
      .where(eq(tables.storyScenes.idStoryScene, idOf("Scene written first")));

    const detail = await actions.sa_getStorySession(session.id);
    // The test user's own story, so the session's pill is theirs to move.
    expect(detail?.isStoryteller).toBe(true);
    expect(detail?.scenes.map((scene) => scene.title)).toEqual([
      "Scene written second",
      "Scene written first",
      // Attached to the sitting but never run, so it has no active_at and
      // comes last rather than first.
      "Scene never run",
    ]);
    // Each one carries the status the database gave it.
    for (const scene of detail!.scenes) {
      expect(typeof scene.status).toBe("string");
      expect(scene.status.length).toBeGreaterThan(0);
    }

    await db.delete(tables.storyScenes).where(
      inArray(
        tables.storyScenes.idStoryScene,
        rows.map((row) => row.id),
      ),
    );
    await db
      .delete(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, session.id));
  });

  it("gives nobody but the storyteller a sitting's scenes", async () => {
    const [scene] = await db
      .insert(tables.storyScenes)
      .values({ idStory: storyA, idStorySession: openSessionId, sceneTitle: "Hidden scene" })
      .returning({ id: tables.storyScenes.idStoryScene });

    // storyA belongs to the other user, so the test user reading this session
    // is a player at it: the notes are theirs to read, but the scenes of a
    // session still open are prep and stay behind.
    const detail = await actions.sa_getStorySession(openSessionId);
    expect(detail?.notes).toBe("Private.");
    expect(detail?.scenes).toEqual([]);
    // Nor is its status theirs to move.
    expect(detail?.isStoryteller).toBe(false);

    await db.delete(tables.storyScenes).where(eq(tables.storyScenes.idStoryScene, scene.id));
  });

  it("takes a player off a story and their favorite of it with them", async () => {
    // storyD is the test user's own, so they are its storyteller. Seat the
    // other user on it and let them favorite it.
    await db.insert(tables.storyPlayers).values({ idStory: storyD, idUser: otherUserId });
    await db.insert(tables.storyFavorites).values({ idStory: storyD, idUser: otherUserId });

    const result = await actions.sa_removeStoryPlayer(storyD, otherUserId);
    expect(result).toEqual({ ok: true });

    const seats = await db
      .select()
      .from(tables.storyPlayers)
      .where(
        and(eq(tables.storyPlayers.idStory, storyD), eq(tables.storyPlayers.idUser, otherUserId)),
      );
    expect(seats).toEqual([]);
    const favorites = await db
      .select()
      .from(tables.storyFavorites)
      .where(
        and(
          eq(tables.storyFavorites.idStory, storyD),
          eq(tables.storyFavorites.idUser, otherUserId),
        ),
      );
    expect(favorites).toEqual([]);
  });

  it("leaves everyone else's seats and favorites alone", async () => {
    // Two players on the same story, one of them favoriting it, and a
    // favorite of a different story by the one being removed.
    await db.insert(tables.storyPlayers).values([
      { idStory: storyD, idUser: otherUserId },
      { idStory: storyD, idUser: testUser },
    ]);
    await db.insert(tables.storyFavorites).values([
      { idStory: storyD, idUser: testUser },
      { idStory: storyE, idUser: otherUserId },
    ]);

    await actions.sa_removeStoryPlayer(storyD, otherUserId);

    // Scoped to the two this case seated: other tests in this file put
    // their own players on the fixture stories.
    const seats = await db
      .select({ idUser: tables.storyPlayers.idUser })
      .from(tables.storyPlayers)
      .where(
        and(
          eq(tables.storyPlayers.idStory, storyD),
          inArray(tables.storyPlayers.idUser, [otherUserId, testUser]),
        ),
      );
    expect(seats).toEqual([{ idUser: testUser }]);
    // The other player's favorite of this story, and the removed player's
    // favorite of another, both survive; only the removed player's favorite
    // of this story goes. Asked row by row, because the fixtures in `before`
    // favorite these stories too.
    const favorite = async (idStory: number, idUser: string) =>
      (
        await db
          .select({ one: tables.storyFavorites.idStoryFavorite })
          .from(tables.storyFavorites)
          .where(
            and(
              eq(tables.storyFavorites.idStory, idStory),
              eq(tables.storyFavorites.idUser, idUser),
            ),
          )
      ).length;
    expect(await favorite(storyD, testUser)).toBe(1);
    expect(await favorite(storyE, otherUserId)).toBe(1);
    expect(await favorite(storyD, otherUserId)).toBe(0);

    await db
      .delete(tables.storyPlayers)
      .where(
        and(
          eq(tables.storyPlayers.idStory, storyD),
          inArray(tables.storyPlayers.idUser, [otherUserId, testUser]),
        ),
      );
    // Only the two this case added: storyE is favorited by the test user in
    // `before`, and other cases rely on that.
    await db
      .delete(tables.storyFavorites)
      .where(
        or(
          and(
            eq(tables.storyFavorites.idStory, storyD),
            eq(tables.storyFavorites.idUser, testUser),
          ),
          and(
            eq(tables.storyFavorites.idStory, storyE),
            eq(tables.storyFavorites.idUser, otherUserId),
          ),
        ),
      );
  });

  it("lets a player leave a story, taking their favorite of it, and only theirs", async () => {
    // A story of its own: the shared fixtures seat and favorite the test user
    // on stories that other cases count on.
    const [story] = await db
      .insert(tables.stories)
      .values({ title: "Fixture story to leave", idCreatedByUser: otherUserId })
      .returning({ id: tables.stories.idStory });
    try {
      await db.insert(tables.storyPlayers).values([
        { idStory: story.id, idUser: testUser },
        { idStory: story.id, idUser: otherUserId },
      ]);
      await db.insert(tables.storyFavorites).values([
        { idStory: story.id, idUser: testUser },
        { idStory: story.id, idUser: otherUserId },
      ]);

      expect(await actions.sa_leaveStory(story.id)).toEqual({ ok: true });

      const seats = await db
        .select({ idUser: tables.storyPlayers.idUser })
        .from(tables.storyPlayers)
        .where(eq(tables.storyPlayers.idStory, story.id));
      expect(seats).toEqual([{ idUser: otherUserId }]);
      const favorites = await db
        .select({ idUser: tables.storyFavorites.idUser })
        .from(tables.storyFavorites)
        .where(eq(tables.storyFavorites.idStory, story.id));
      expect(favorites).toEqual([{ idUser: otherUserId }]);

      // Gone already, so there is no seat to leave.
      expect(await actions.sa_leaveStory(story.id)).toEqual({
        ok: false,
        error: "You are not a player of this story.",
      });
    } finally {
      await db.delete(tables.storyFavorites).where(eq(tables.storyFavorites.idStory, story.id));
      await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, story.id));
      await db.delete(tables.stories).where(eq(tables.stories.idStory, story.id));
    }
  });

  it("will not let anyone leave a story they have no seat at, their own included", async () => {
    // storyD is the test user's own: the storyteller has no seat to leave.
    expect(await actions.sa_leaveStory(storyD)).toEqual({
      ok: false,
      error: "You are not a player of this story.",
    });
    expect(await actions.sa_leaveStory(Number.MAX_SAFE_INTEGER)).toEqual({
      ok: false,
      error: "You are not a player of this story.",
    });
  });

  it("lets anyone join a story that is looking for players, once", async () => {
    const [story] = await db
      .insert(tables.stories)
      .values({
        title: "Fixture story to join",
        isLookingForPlayers: true,
        idCreatedByUser: otherUserId,
      })
      .returning({ id: tables.stories.idStory });
    try {
      expect((await actions.sa_getStory(story.id))?.isLookingForPlayers).toBe(true);

      const joined = await actions.sa_joinStory(story.id);
      // The seat as the list shows it, so the page can add it at once.
      expect(joined).toMatchObject({ ok: true, player: { idUser: testUser } });

      // Already seated: refused, and no second seat.
      expect(await actions.sa_joinStory(story.id)).toEqual({
        ok: false,
        error: "This story is not open for you to join.",
      });
      const seats = await db
        .select({ idUser: tables.storyPlayers.idUser })
        .from(tables.storyPlayers)
        .where(eq(tables.storyPlayers.idStory, story.id));
      expect(seats).toEqual([{ idUser: testUser }]);
    } finally {
      await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, story.id));
      await db.delete(tables.stories).where(eq(tables.stories.idStory, story.id));
    }
  });

  it("will not seat anyone at a story that is not looking, retired, or their own", async () => {
    const stories = await db
      .insert(tables.stories)
      .values([
        { title: "Fixture not looking", idCreatedByUser: otherUserId },
        {
          title: "Fixture looking but retired",
          isLookingForPlayers: true,
          isActive: false,
          idCreatedByUser: otherUserId,
        },
        { title: "Fixture own and looking", isLookingForPlayers: true, idCreatedByUser: testUser },
      ])
      .returning({ id: tables.stories.idStory });
    const ids = stories.map((story) => story.id);
    try {
      for (const id of [...ids, Number.MAX_SAFE_INTEGER]) {
        expect(await actions.sa_joinStory(id)).toEqual({
          ok: false,
          error: "This story is not open for you to join.",
        });
      }
      const seats = await db
        .select()
        .from(tables.storyPlayers)
        .where(inArray(tables.storyPlayers.idStory, ids));
      expect(seats).toEqual([]);
    } finally {
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, ids));
    }
  });

  it("tells the tables when a player is taken off, and recounts the table they were at", async () => {
    // Seated and present at D's current session, as the link button's
    // Remove finds a player: the seat, the presence and the favorite all go,
    // the scene is said to have changed, and the head count is published.
    const [{ idStorySession }] = await db
      .select({ idStorySession: tables.stories.idStorySession })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, storyD));
    await db.insert(tables.storyPlayers).values({ idStory: storyD, idUser: otherUserId });
    await db.insert(tables.sessionPlayers).values({
      idStory: storyD,
      idStorySession,
      status: "PRESENT",
      idCreatedByUser: otherUserId,
      idUpdatedByUser: otherUserId,
    });
    published.publishSceneChanged.mock.resetCalls();
    recountTable.mock.resetCalls();
    try {
      expect(await actions.sa_removeStoryPlayer(storyD, otherUserId)).toEqual({ ok: true });
      const presence = await db
        .select({ id: tables.sessionPlayers.idSessionPlayer })
        .from(tables.sessionPlayers)
        .where(
          and(
            eq(tables.sessionPlayers.idStory, storyD),
            eq(tables.sessionPlayers.idCreatedByUser, otherUserId),
          ),
        );
      expect(presence).toEqual([]);
      expect(published.publishSceneChanged.mock.calls.map((call) => call.arguments)).toEqual([
        [storyD],
      ]);
      expect(recountTable.mock.calls.map((call) => call.arguments)).toEqual([[storyD]]);
    } finally {
      await db
        .delete(tables.sessionPlayers)
        .where(
          and(
            eq(tables.sessionPlayers.idStory, storyD),
            eq(tables.sessionPlayers.idCreatedByUser, otherUserId),
          ),
        );
      await db
        .delete(tables.storyPlayers)
        .where(
          and(eq(tables.storyPlayers.idStory, storyD), eq(tables.storyPlayers.idUser, otherUserId)),
        );
    }
  });

  it("removing someone who is not seated is not an error", async () => {
    expect(await actions.sa_removeStoryPlayer(storyD, otherUserId)).toEqual({ ok: true });
  });

  it("refuses a story the caller did not create, and the storyteller themselves", async () => {
    // storyA belongs to the other user, and the test user only plays in it.
    expect(await actions.sa_removeStoryPlayer(storyA, testUser)).toEqual({
      ok: false,
      error: STORY_NOT_YOURS,
    });

    // The storyteller has no story_players row to take away.
    const refusal = await actions.sa_removeStoryPlayer(storyD, testUser);
    expect(refusal.ok).toBe(false);

    // And an id that is not a user at all.
    const bad = await actions.sa_removeStoryPlayer(storyD, "not-a-uuid");
    expect(bad.ok).toBe(false);
  });

  // The card's picture no longer comes from a column, so nothing about the
  // rule that picks it is visible in the schema: which statuses count, and
  // which of several attachments wins. Both live in the subquery
  // attachmentUrl() builds, which is what this case pins.
  it("takes a story's cover from the READY attachment tagged cover, and from nothing else", async () => {
    const coverOf = async () => (await actions.sa_getStory(storyD))?.imageUrl;
    const rows = await db
      .insert(tables.attachments)
      .values(
        [
          // First by every order the old rule used, and still not the cover.
          { url: "https://x.test/first.jpg", tags: ["map"] },
          { url: "https://x.test/cover.jpg", tags: ["map"] },
        ].map((values) => ({
          idStory: storyD,
          status: "READY",
          idCreatedByUser: testUser,
          idUpdatedByUser: testUser,
          ...values,
        })),
      )
      .returning({ id: tables.attachments.idAttachment, url: tables.attachments.url });
    const ids = rows.map((row) => row.id);
    const coverId = rows.find((row) => row.url === "https://x.test/cover.jpg")!.id;
    // The cover is the story's use of the second, tagged; the first has none.
    const useOf = (idAttachment: number) =>
      db.insert(tables.attachmentUses).values({
        idAttachment,
        kind: "STORY",
        idExternal: storyD,
        tags: ["cover"],
        idCreatedByUser: testUser,
        idUpdatedByUser: testUser,
      });
    await useOf(coverId);

    try {
      expect(await coverOf()).toBe("https://x.test/cover.jpg");

      // With no cover at all the story shows none, rather than falling back
      // to the READY attachment left over.
      await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, coverId));
      expect(await coverOf()).toBeNull();

      // Nor is a cover that is not READY a picture, even with the tag on it.
      // ERROR with a url, so the status is what rules it out.
      const [failed] = await db
        .insert(tables.attachments)
        .values({
          idStory: storyD,
          status: "ERROR",
          url: "https://x.test/failed.jpg",
          idCreatedByUser: testUser,
          idUpdatedByUser: testUser,
        })
        .returning({ id: tables.attachments.idAttachment });
      ids.push(failed.id);
      await useOf(failed.id);
      expect(await coverOf()).toBeNull();
    } finally {
      await db.delete(tables.attachments).where(inArray(tables.attachments.idAttachment, ids));
    }
  });

  it("goes on to where the form was told instead, and never off the site", async () => {
    const title = "Fixture G — made from the home page";

    try {
      const target = async (afterCreate: unknown) =>
        (
          (await actions
            .sa_createStory(
              {
                title,
                idSystem: null,
                summary: "",
                isLookingForPlayers: false,
                isActive: true,
                isArchived: false,
                isPublic: false,
              },
              afterCreate,
            )
            .then(
              () => null,
              (error: unknown) => error,
            )) as { digest?: string }
        ).digest;

      expect(await target("/stories")).toContain(";/stories;");
      expect(await target("https://evil.example/")).toMatch(/;\/stories\/\d+;/);
    } finally {
      await db.delete(tables.stories).where(eq(tables.stories.title, title));
    }
  });

  it("creates the caller's story and redirects to its page", async () => {
    const title = "Fixture F — freshly created";

    try {
      // Next implements redirect() by throwing; the target rides in the digest.
      const thrown: unknown = await actions
        .sa_createStory({
          title,
          idSystem: null,
          summary: "",
          isLookingForPlayers: false,
          isActive: true,
          isArchived: false,
          isPublic: false,
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      const [created] = await db
        .select({
          idStory: tables.stories.idStory,
          idCreatedByUser: tables.stories.idCreatedByUser,
        })
        .from(tables.stories)
        .where(eq(tables.stories.title, title));
      expect(created.idCreatedByUser).toBe(testUser);
      expect((thrown as { digest?: string }).digest).toContain(`;/stories/${created.idStory};`);
    } finally {
      // By title rather than by an id captured mid-test, so a failure before
      // the SELECT above still cleans the story up.
      await db.delete(tables.stories).where(eq(tables.stories.title, title));
    }
  });
});
