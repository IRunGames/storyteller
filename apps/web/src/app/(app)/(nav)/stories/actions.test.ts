// Integration test against the real database. Skipped when DATABASE_URL is
// unset so `just test` stays green offline. Relies on db/seeds/seed_stories.sql
// having been applied: the seed user owns 14 stories.
//
// The seed alone cannot tell a working query from `return []`: story_players,
// story_favorites and "looking for players" are all empty in it. So `before`
// inserts a second user and three stories of its own — a story the seed user only
// PLAYS in, a story it merely favorites, and a flagged-but-inactive story — and
// `after` deletes them again. Every fixture id is positive and left to the
// database default, so it can never collide with the seed's negative ids.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { loadEnvConfig } from "@next/env";

import { initialStatus, pausePair, terminalStatus } from "@/test/workflow";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

// The session statuses this file needs, found in the workflow rather than
// written down: the one a session starts in, the one it ends in, and the pair
// it passes through when it pauses. See src/test/workflow.ts for why.
let statusOpen = "";
let statusDone = "";
let statusPause = "";
let statusResume = "";

// `@/db` opens its pool at import time, so it has to be pulled in from inside
// `before` — a static import is evaluated before loadEnvConfig() above runs,
// and the pool would be built without a connection string.
type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const TITLE_A = "Fixture A — other's story, seed user plays in it, LFP, active";
const TITLE_B = "Fixture B — other's story, seed user only favorites it";
const TITLE_C = "Fixture C — other's story, LFP but inactive";
const TITLE_D = "Fixture D — seed user's own story, inactive";
const TITLE_E = "Fixture E — seed user's own story, archived, and favorited by them";

let otherUserId = "";
let storyA = 0;
let storyB = 0;
let storyC = 0;
let storyD = 0;
let storyE = 0;
let openSessionId = 0;
let pastSessionIds: number[] = [];
let fixtureStoryIds: number[] = [];

describe("stories actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    const workflow = await (
      await import("@/components/status/actions")
    ).sa_listStatusOptions("story_sessions");
    statusOpen = initialStatus(workflow);
    statusDone = terminalStatus(workflow);
    ({ pause: statusPause, resume: statusResume } = pausePair(workflow));

    const [otherUser] = await db
      .insert(tables.user)
      .values({ name: "Fixture Other", nickName: "Other", email: "fixture-other@example.test" })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

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
        { title: TITLE_D, idCreatedByUser: SEED_USER, isActive: false },
        {
          title: TITLE_E,
          idCreatedByUser: SEED_USER,
          isActive: false,
          isArchived: true,
          idArchivedByUser: SEED_USER,
        },
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
    fixtureStoryIds = [storyA, storyB, storyC, storyD, storyE];

    // The seed user plays in A but does not own it: this is the only row that
    // exercises the exists(plays-in) branch of sa_listMyStories.
    await db.insert(tables.storyPlayers).values({ idStory: storyA, idUser: SEED_USER });

    // The seed user favorites B; the OTHER user favorites A. A must never
    // reach the seed user's favorites, which is what pins the idUser predicate.
    // E is archived and favorited by the seed user, so it pins that an
    // archived story is off both sections of the Stories page.
    await db.insert(tables.storyFavorites).values([
      { idStory: storyB, idUser: SEED_USER },
      { idStory: storyE, idUser: SEED_USER },
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
    if (otherUserId) await db.delete(tables.user).where(eq(tables.user.id, otherUserId));

    // Otherwise the process lingers until the pool's idle timeout.
    await db.$client.end();
  });

  it("lists the seed user's stories newest-updated first, ten at a time", async () => {
    // Half the seed stories are inactive, so ask for all of them here.
    const first = await actions.sa_listMyStories(0, true);
    const second = await actions.sa_listMyStories(10, true);

    expect(first).toHaveLength(10);
    expect(second.length).toBeGreaterThanOrEqual(4);
    expect(first.map((s) => s.idStory)).not.toContain(second[0].idStory);
    expect(first[0]).toMatchObject({
      title: expect.any(String),
      lastPlayed: expect.any(Date),
    });
  });

  it("includes a story the user only plays in, and not one they neither own nor play", async () => {
    const all = [...(await actions.sa_listMyStories(0)), ...(await actions.sa_listMyStories(10))];
    const ids = all.map((s) => s.idStory);

    expect(ids).toContain(storyA);
    expect(ids).not.toContain(storyB);
    expect(ids).not.toContain(storyC);
  });

  it("joins the system onto each card", async () => {
    // The Devil's Spine is inactive in the seed, so include inactive stories.
    const all = [
      ...(await actions.sa_listMyStories(0, true)),
      ...(await actions.sa_listMyStories(10, true)),
    ];
    const numenera = all.find((s) => s.title === "The Devil's Spine");

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
    // What the seed calls story -1 is the seed's business and has changed
    // once already, so the title to expect is read from the row rather than
    // written down: the case is that the id fetches its own story.
    const [seeded] = await db
      .select({ title: tables.stories.title })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, -1));
    const story = await actions.sa_getStory(-1);
    expect(story?.title).toBe(seeded.title);
    expect(await actions.sa_getStory(999999)).toBeNull();
    // Beyond int4: Postgres would error on the comparison, so the id is
    // rejected before the query and the page's notFound() takes over.
    expect(await actions.sa_getStory(3000000000)).toBeNull();
  });

  it("lists a story's players by display name, in the order they joined", async () => {
    // Vampire (-15) seats PaulKhash and Pol in db/seeds/seed_story_players.sql,
    // with one joined_at between them, so the name breaks the tie. Pol is the
    // seed user, who has no nickname, so their name is used.
    const players = await actions.sa_listStoryPlayers(-15);

    expect(players).toEqual([
      { idUser: expect.any(String), name: "PaulKhash", image: null },
      { idUser: SEED_USER, name: "Pol", image: null },
    ]);
  });

  it("returns no players for a story without any, or with an unusable id", async () => {
    // Down in Adder's Hollow: a seed story nobody is seated on.
    expect(await actions.sa_listStoryPlayers(-2)).toEqual([]);
    expect(await actions.sa_listStoryPlayers(3000000000)).toEqual([]);
  });

  it("finds players by name, nickname or email, ten at most, case blind", async () => {
    // D is the seed user's own story, so they may search for players for it.
    const byNick = await actions.sa_searchPlayers(storyD, "HERMIONE");
    expect(byNick).toEqual([
      {
        idUser: "00000000-0000-7000-8000-000000000009",
        name: "Hermione",
        email: "hermione.granger@example.com",
        image: null,
      },
    ]);

    const byEmail = await actions.sa_searchPlayers(storyD, "fixture-other@");
    expect(byEmail.map((m) => m.idUser)).toEqual([otherUserId]);

    // "e" is in nearly every seed address, so this is where the cap bites.
    const many = await actions.sa_searchPlayers(storyD, "e");
    expect(many).toHaveLength(10);
  });

  it("searches nothing for a blank query and leaves out the caller and the seated", async () => {
    expect(await actions.sa_searchPlayers(storyD, "")).toEqual([]);
    expect(await actions.sa_searchPlayers(storyD, "   ")).toEqual([]);

    // The seed user is Pol, the storyteller of D: they cannot invite themselves.
    expect(await actions.sa_searchPlayers(storyD, "Pol")).toEqual([]);

    // PaulKhash already plays in Vampire (-15). D has nobody seated, so from
    // D they match; from Vampire they would not, but Vampire belongs to
    // PalmDave, so it is the fixture below that pins the exclusion.
    expect((await actions.sa_searchPlayers(storyD, "PaulKhash")).map((m) => m.name)).toEqual([
      "PaulKhash",
    ]);
  });

  it("refuses to search for, or add to, a story the caller did not create", async () => {
    await expect(actions.sa_searchPlayers(storyA, "her")).rejects.toThrow(/storyteller/);
    await expect(actions.sa_addStoryPlayers(storyA, [otherUserId])).rejects.toThrow(/storyteller/);
    // The popover is only ever shown to the owner of a story that exists,
    // so an id that is not a story is a throw rather than a soft empty.
    await expect(actions.sa_searchPlayers(2 ** 40, "her")).rejects.toThrow();
    await expect(actions.sa_searchPlayers(2147483647, "her")).rejects.toThrow(/not found/);
  });

  it("seats the chosen users, skips anyone already seated, and returns who was added", async () => {
    const added = await actions.sa_addStoryPlayers(storyD, [
      otherUserId,
      "00000000-0000-7000-8000-000000000009",
    ]);
    expect(added).toEqual([
      { idUser: "00000000-0000-7000-8000-000000000009", name: "Hermione", image: null },
      { idUser: otherUserId, name: "Other", image: null },
    ]);

    // Seated players no longer match a search, and adding them again seats
    // nobody twice.
    expect(await actions.sa_searchPlayers(storyD, "Hermione")).toEqual([]);
    expect(await actions.sa_addStoryPlayers(storyD, [otherUserId])).toEqual([]);

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
    expect(await actions.sa_addStoryPlayers(storyD, [SEED_USER])).toEqual([]);
    expect(
      await actions.sa_addStoryPlayers(storyD, ["00000000-0000-7000-8000-0000000000ff"]),
    ).toEqual([]);
    await expect(actions.sa_addStoryPlayers(storyD, ["not-a-uuid"])).rejects.toThrow();
    await expect(
      actions.sa_addStoryPlayers(
        storyD,
        Array.from(
          { length: 11 },
          (_, i) => `00000000-0000-7000-8000-0000000000${String(i).padStart(2, "0")}`,
        ),
      ),
    ).rejects.toThrow();
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
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: storyB })
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

    const sessions = await actions.sa_listStorySessions(storyB, 0);
    expect(sessions.find((s) => s.idStorySession === session.id)?.length).toBe(60);
  });

  it("returns no sessions for a story without any, or with an unusable id", async () => {
    expect(await actions.sa_listStorySessions(storyC, 0)).toEqual([]);
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
        idUsers: [otherUserId, SEED_USER],
      })
      .where(eq(tables.storySessions.idStorySession, openSessionId));
    // The sitting's picture is an attachments row now, not a column of its
    // own, so the fixture attaches one the way the uploader would.
    const [picture] = await db
      .insert(tables.attachments)
      .values({
        kind: "STORY_SESSION",
        idExternal: openSessionId,
        status: "READY",
        url: "https://x.test/hero.jpg",
        idCreatedByUser: otherUserId,
        idUpdatedByUser: otherUserId,
      })
      .returning({ id: tables.attachments.idAttachment });

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
        notes: null,
        lingeringQuestions: null,
      });
      expect(detail?.players.map((p) => p.idUser).sort()).toEqual([otherUserId, SEED_USER].sort());
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
    }
  });

  it("lists systems with a display label", async () => {
    const systems = await actions.sa_listSystems();
    expect(systems.length).toBeGreaterThan(100);
    expect(systems.find((s) => s.idSystem === -26)?.label).toBe(
      "Cypher System · Numenera (Revised)",
    );
  });

  it("rejects a negative offset", async () => {
    await expect(actions.sa_listMyStories(-1)).rejects.toThrow();
  });

  it("returns field errors for an invalid new story", async () => {
    const result = await actions.sa_createStory({
      title: "",
      idSystem: null,
      summary: "",
      attachmentIds: [],
      isLookingForPlayers: false,
      isActive: true,
      isArchived: false,
    });
    expect(result).toEqual({ ok: false, errors: { title: "Please give the story a title." } });
  });

  it("hands the storyteller their story's values for the edit form, and nobody else", async () => {
    // D is the seed user's own story; A is the other user's, though the seed
    // user plays in it, which is what pins the check to the creator.
    expect(await actions.sa_getStoryForEdit(storyD)).toEqual({
      title: TITLE_D,
      idSystem: null,
      summary: "",
      attachmentIds: [],
      isLookingForPlayers: false,
      isActive: false,
      isArchived: false,
    });
    expect(await actions.sa_getStoryForEdit(storyA)).toBeNull();
    expect(await actions.sa_getStoryForEdit(2 ** 40)).toBeNull();
  });

  it("saves the edit form over the caller's own story and refuses anyone else's", async () => {
    const values = {
      title: `${TITLE_D} (edited)`,
      idSystem: -26,
      summary: "Now with a summary.",
      attachmentIds: [],
      isLookingForPlayers: true,
      // D stays inactive: the fixture is what the "hides inactive" test below
      // relies on, and the edit tests only borrow it.
      isActive: false,
      isArchived: false,
    };

    // On success the action redirects, which Next implements by throwing.
    await expect(actions.sa_updateStory(storyD, values)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await actions.sa_getStoryForEdit(storyD)).toEqual(values);
    const [row] = await db
      .select({ idUpdatedByUser: tables.stories.idUpdatedByUser })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, storyD));
    expect(row.idUpdatedByUser).toBe(SEED_USER);

    // A is the other user's; the seed user plays in it, which is exactly
    // what must not be enough.
    await expect(actions.sa_updateStory(storyA, values)).rejects.toThrow(
      "Only the storyteller who created a story can edit it",
    );
    expect((await actions.sa_getStory(storyA))?.title).toBe(TITLE_A);
    await expect(actions.sa_updateStory(2 ** 30, values)).rejects.toThrow("Story not found");

    expect(await actions.sa_updateStory(storyD, { ...values, title: "" })).toEqual({
      ok: false,
      errors: { title: "Please give the story a title." },
    });
  });

  it("archives a story as inactive and not looking for players, stamped with the archiver, and undoes all of it", async () => {
    const values = {
      title: TITLE_D,
      idSystem: null,
      summary: "",
      attachmentIds: [],
      isLookingForPlayers: true,
      isActive: true,
      isArchived: true,
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
      idArchivedByUser: SEED_USER,
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

  it("marks each card with whether the caller has favorited it", async () => {
    const mine = [...(await actions.sa_listMyStories(0)), ...(await actions.sa_listMyStories(10))];
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

    // No current session at all.
    expect((await actions.sa_getStory(-1))?.hasOpenSession).toBe(false);

    // Resumed after a pause counts as open: the table is in play again.
    expect((await actions.sa_getStory(storyD))?.hasOpenSession).toBe(true);
  });

  it("counts each card's players", async () => {
    const all = [
      ...(await actions.sa_listMyStories(0, true)),
      ...(await actions.sa_listMyStories(10, true)),
    ];
    // Vampire seats two in db/seeds/seed_story_players.sql and Something
    // Wicked three; the seed user is fixture A's only player.
    expect(all.find((s) => s.idStory === -15)?.playerCount).toBe(2);
    expect(all.find((s) => s.idStory === -1)?.playerCount).toBe(3);
    expect(all.find((s) => s.idStory === storyA)?.playerCount).toBe(1);
  });

  it("hides the caller's inactive stories unless asked to show them", async () => {
    const all = async (showInactive: boolean) => [
      ...(await actions.sa_listMyStories(0, showInactive)),
      ...(await actions.sa_listMyStories(10, showInactive)),
    ];

    const hidden = (await all(false)).map((s) => s.idStory);
    expect(hidden).not.toContain(storyD);
    expect(hidden).toContain(storyA);

    const shown = await all(true);
    expect(shown.map((s) => s.idStory)).toContain(storyD);
    expect(shown.find((s) => s.idStory === storyD)?.isActive).toBe(false);
    expect(shown.find((s) => s.idStory === storyA)?.isActive).toBe(true);
  });

  it("leaves an archived story off My Stories, even with inactive shown, and off Favorites", async () => {
    const mine = [
      ...(await actions.sa_listMyStories(0, true)),
      ...(await actions.sa_listMyStories(10, true)),
    ];
    expect(mine.map((s) => s.idStory)).toContain(storyD);
    expect(mine.map((s) => s.idStory)).not.toContain(storyE);

    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.map((s) => s.idStory)).toContain(storyB);
    expect(favorites.map((s) => s.idStory)).not.toContain(storyE);

    // Still there for its storyteller to unarchive.
    expect((await actions.sa_getStoryForEdit(storyE))?.isArchived).toBe(true);
  });

  it("marks each card with whether the caller owns it", async () => {
    const mine = [...(await actions.sa_listMyStories(0)), ...(await actions.sa_listMyStories(10))];
    expect(mine.find((s) => s.idStory === -1)?.isOwner).toBe(true); // seed user created it
    expect(mine.find((s) => s.idStory === storyA)?.isOwner).toBe(false); // only plays in it
  });

  it("names each card's storyteller, preferring their nickname", async () => {
    const mine = [...(await actions.sa_listMyStories(0)), ...(await actions.sa_listMyStories(10))];
    expect(mine.find((s) => s.idStory === storyA)?.storytellerName).toBe("Other"); // nickname set
    expect(mine.find((s) => s.idStory === -1)?.storytellerName).toBe("Pol"); // seed user has none

    // The favorites list builds its joins separately, so it is checked too.
    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.find((s) => s.idStory === storyB)?.storytellerName).toBe("Other");
  });

  it("adds and removes a favorite for the caller only, idempotently", async () => {
    expect(await actions.sa_setFavorite(storyC, true)).toEqual({ isFavorite: true });
    // A second add must not trip the (id_story, id_user) unique constraint.
    expect(await actions.sa_setFavorite(storyC, true)).toEqual({ isFavorite: true });

    let ids = (await actions.sa_listFavoriteStories(0)).map((s) => s.idStory);
    expect(ids).toContain(storyC);

    expect(await actions.sa_setFavorite(storyC, false)).toEqual({ isFavorite: false });
    ids = (await actions.sa_listFavoriteStories(0)).map((s) => s.idStory);
    expect(ids).not.toContain(storyC);

    // The other user's favorite on A is untouched by any of the above.
    const otherRows = await db
      .select({ id: tables.storyFavorites.idStoryFavorite })
      .from(tables.storyFavorites)
      .where(eq(tables.storyFavorites.idUser, otherUserId));
    expect(otherRows).toHaveLength(1);
  });

  it("refuses to favorite a story that does not exist", async () => {
    await expect(actions.sa_setFavorite(999999, true)).rejects.toThrow("Story not found");
  });

  it("gives the storyteller the sitting's scenes, in the order they were played", async () => {
    // On storyD, which the seed user owns: scenes are the storyteller's, and
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

    // storyA belongs to the other user, so the seed user reading this session
    // is a visitor: the scenes are prep, like the notes, and stay behind.
    const detail = await actions.sa_getStorySession(openSessionId);
    expect(detail?.notes).toBeNull();
    expect(detail?.scenes).toEqual([]);

    await db.delete(tables.storyScenes).where(eq(tables.storyScenes.idStoryScene, scene.id));
  });

  it("takes a player off a story and their favorite of it with them", async () => {
    // storyD is the seed user's own, so they are its storyteller. Seat the
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
      { idStory: storyD, idUser: SEED_USER },
    ]);
    await db.insert(tables.storyFavorites).values([
      { idStory: storyD, idUser: SEED_USER },
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
          inArray(tables.storyPlayers.idUser, [otherUserId, SEED_USER]),
        ),
      );
    expect(seats).toEqual([{ idUser: SEED_USER }]);
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
    expect(await favorite(storyD, SEED_USER)).toBe(1);
    expect(await favorite(storyE, otherUserId)).toBe(1);
    expect(await favorite(storyD, otherUserId)).toBe(0);

    await db
      .delete(tables.storyPlayers)
      .where(
        and(
          eq(tables.storyPlayers.idStory, storyD),
          inArray(tables.storyPlayers.idUser, [otherUserId, SEED_USER]),
        ),
      );
    // Only the two this case added: storyE is favorited by the seed user in
    // `before`, and other cases rely on that.
    await db
      .delete(tables.storyFavorites)
      .where(
        or(
          and(
            eq(tables.storyFavorites.idStory, storyD),
            eq(tables.storyFavorites.idUser, SEED_USER),
          ),
          and(
            eq(tables.storyFavorites.idStory, storyE),
            eq(tables.storyFavorites.idUser, otherUserId),
          ),
        ),
      );
  });

  it("removing someone who is not seated is not an error", async () => {
    expect(await actions.sa_removeStoryPlayer(storyD, otherUserId)).toEqual({ ok: true });
  });

  it("refuses a story the caller did not create, and the storyteller themselves", async () => {
    // storyA belongs to the other user, and the seed user only plays in it.
    await expect(actions.sa_removeStoryPlayer(storyA, SEED_USER)).rejects.toThrow();

    // The storyteller has no story_players row to take away.
    const refusal = await actions.sa_removeStoryPlayer(storyD, SEED_USER);
    expect(refusal.ok).toBe(false);

    // And an id that is not a user at all.
    const bad = await actions.sa_removeStoryPlayer(storyD, "not-a-uuid");
    expect(bad.ok).toBe(false);
  });

  // The card's picture no longer comes from a column, so nothing about the
  // rule that picks it is visible in the schema any more: which statuses count,
  // and which of several attachments wins. Both live in the subquery
  // attachmentUrl() builds, which is what these cases pin.
  it("takes a story's cover from its READY attachments, lowest sort_order first", async () => {
    const attach = (values: {
      status: string;
      url: string | null;
      sortOrder?: number | null;
    }) => ({
      kind: "STORY",
      idExternal: storyD,
      idCreatedByUser: SEED_USER,
      idUpdatedByUser: SEED_USER,
      ...values,
    });
    const coverOf = async () => (await actions.sa_getStory(storyD))?.imageUrl;

    const rows = await db
      .insert(tables.attachments)
      .values([
        attach({ status: "READY", url: "https://x.test/second.jpg", sortOrder: 1 }),
        attach({ status: "READY", url: "https://x.test/first.jpg", sortOrder: 0 }),
        attach({ status: "UPLOADING", url: null, sortOrder: 0 }),
        // ERROR *with* a url, so what rules it out is the status and not the
        // missing url that an UPLOADING row also has.
        attach({ status: "ERROR", url: "https://x.test/failed.jpg", sortOrder: 0 }),
      ])
      .returning({ id: tables.attachments.idAttachment, url: tables.attachments.url });
    const idFor = (url: string) => rows.find((row) => row.url === url)!.id;
    const ids = rows.map((row) => row.id);

    try {
      // sort_order decides, not insertion order and not the id.
      expect(await coverOf()).toBe("https://x.test/first.jpg");

      // Take the winner away and the next READY row takes over, rather than
      // the story losing its cover or an unfinished upload standing in.
      await db
        .delete(tables.attachments)
        .where(eq(tables.attachments.idAttachment, idFor("https://x.test/first.jpg")));
      expect(await coverOf()).toBe("https://x.test/second.jpg");

      // With only the UPLOADING and ERROR rows left there is no picture to
      // show: a row that never finished uploading is not a cover.
      await db
        .delete(tables.attachments)
        .where(eq(tables.attachments.idAttachment, idFor("https://x.test/second.jpg")));
      expect(await coverOf()).toBeNull();
    } finally {
      await db.delete(tables.attachments).where(inArray(tables.attachments.idAttachment, ids));
    }
  });

  it("breaks a tie between attachments on the id, as sa_listAttachments does", async () => {
    // Both sort_order NULL, inserted in one statement, so only the id can
    // separate them -- the case the seed's own rows hit, since only the
    // backfill ever set a sort_order.
    const tied = await db
      .insert(tables.attachments)
      .values([
        {
          kind: "STORY",
          idExternal: storyD,
          status: "READY",
          url: "https://x.test/tie-a.jpg",
          idCreatedByUser: SEED_USER,
          idUpdatedByUser: SEED_USER,
        },
        {
          kind: "STORY",
          idExternal: storyD,
          status: "READY",
          url: "https://x.test/tie-b.jpg",
          idCreatedByUser: SEED_USER,
          idUpdatedByUser: SEED_USER,
        },
      ])
      .returning({ id: tables.attachments.idAttachment, url: tables.attachments.url });

    try {
      const lowest = tied.reduce((a, b) => (a.id < b.id ? a : b));
      expect((await actions.sa_getStory(storyD))?.imageUrl).toBe(lowest.url);
    } finally {
      await db
        .delete(tables.attachments)
        .where(
          inArray(
            tables.attachments.idAttachment,
            tied.map((row) => row.id),
          ),
        );
    }
  });

  it("claims the attachments a new story was created with, and covers its card", async () => {
    const title = "Fixture F — created with attachments";
    // Detached, as a create form's uploads are: there was no story to point
    // them at when they were made.
    const detached = await db
      .insert(tables.attachments)
      .values([
        {
          kind: "STORY",
          idExternal: null,
          status: "READY",
          url: "https://x.test/claimed-first.jpg",
          sortOrder: 0,
          idCreatedByUser: SEED_USER,
          idUpdatedByUser: SEED_USER,
        },
        {
          kind: "STORY",
          idExternal: null,
          status: "READY",
          url: "https://x.test/claimed-second.jpg",
          sortOrder: 1,
          idCreatedByUser: SEED_USER,
          idUpdatedByUser: SEED_USER,
        },
      ])
      .returning({ id: tables.attachments.idAttachment });
    const ids = detached.map((row) => row.id);

    try {
      // On success the action redirects, which Next implements by throwing.
      await expect(
        actions.sa_createStory({
          title,
          idSystem: null,
          summary: "",
          attachmentIds: ids,
          isLookingForPlayers: false,
          isActive: true,
          isArchived: false,
        }),
      ).rejects.toThrow(/NEXT_REDIRECT/);

      const [created] = await db
        .select({ idStory: tables.stories.idStory })
        .from(tables.stories)
        .where(eq(tables.stories.title, title));
      expect(created).toBeTruthy();

      const claimed = await db
        .select({ idExternal: tables.attachments.idExternal })
        .from(tables.attachments)
        .where(inArray(tables.attachments.idAttachment, ids));
      // Both, not just the first: the claim is one UPDATE over the whole set.
      expect(claimed.map((row) => row.idExternal)).toEqual([created.idStory, created.idStory]);

      // And the card sees them, which is the whole point of the claim.
      expect((await actions.sa_getStory(created.idStory))?.imageUrl).toBe(
        "https://x.test/claimed-first.jpg",
      );
    } finally {
      await db.delete(tables.attachments).where(inArray(tables.attachments.idAttachment, ids));
      // By title rather than by an id captured mid-test, so a failure before
      // the SELECT above still cleans the story up.
      await db.delete(tables.stories).where(eq(tables.stories.title, title));
    }
  });
});
