// Integration test for the Timeline's session controls in actions.ts, against
// the real database and skipped when DATABASE_URL is unset. Apart from
// actions.test.ts because it needs nothing from the seeds: `before` makes a
// story the test user owns, with two sessions and a scene, and a story of
// someone else's with a session; `after` deletes only those two stories,
// which takes their sessions and scenes with them. Fixture ids are positive
// and left to the database, so they never collide with the seed's.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "stories-session-actions@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let otherUserId = "";
let mine = 0;
let theirs = 0;
let open = 0;
let done = 0;
let theirSession = 0;
let scene = 0;

describe("session actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    actions = await import("./actions");

    // A rerun after a crash would trip the unique email.
    await db
      .delete(tables.user)
      .where(eq(tables.user.email, "session-actions-fixture@example.test"));
    const [otherUser] = await db
      .insert(tables.user)
      .values({ name: "Session Actions Fixture", email: "session-actions-fixture@example.test" })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

    [{ id: mine }, { id: theirs }] = await db
      .insert(tables.stories)
      .values([
        { title: "Session actions fixture — mine", idCreatedByUser: testUser },
        { title: "Session actions fixture — theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.stories.idStory });

    [{ id: open }, { id: done }, { id: theirSession }] = await db
      .insert(tables.storySessions)
      .values([
        {
          idStory: mine,
          status: "OPEN",
          title: "Fixture open",
          idCreatedByUser: testUser,
        },
        { idStory: mine, status: "DONE", idCreatedByUser: testUser },
        { idStory: theirs, status: "OPEN", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.storySessions.idStorySession });

    // Who came to the open session, as the live table records it: a
    // session_players row each, attached to the session and PRESENT, which
    // stamps present_at. They go with the story in after (ON DELETE CASCADE).
    await db.insert(tables.sessionPlayers).values(
      [testUser, otherUserId].map((idUser) => ({
        idStory: mine,
        idStorySession: open,
        status: "PRESENT",
        idCreatedByUser: idUser,
        idUpdatedByUser: idUser,
      })),
    );

    [{ id: scene }] = await db
      .insert(tables.storyScenes)
      .values({
        idStory: mine,
        sceneTitle: "Fixture scene in the open session",
        idStorySession: open,
        idCreatedByUser: testUser,
      })
      .returning({ id: tables.storyScenes.idStoryScene });
  });

  after(async () => {
    if (!db) return;
    if (mine || theirs) {
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, [mine, theirs]));
    }
    if (otherUserId) await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  it("counts who came to each session as the info panel lists them", async () => {
    const listed = await actions.sa_listStorySessions(mine, 0);
    const row = listed.find((session) => session.idStorySession === open);
    expect(row?.playerCount).toBe(2);
    const panel = await actions.sa_getStorySession(open);
    expect(panel?.players).toHaveLength(2);
    expect(listed.find((session) => session.idStorySession === done)?.playerCount).toBe(0);
  });

  it("makes a session with the given title, SUSPENDED, without moving the story", async () => {
    const result = await actions.sa_createStorySession(mine, "Oct 22, 2026 session");

    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.session).toMatchObject({
      title: "Oct 22, 2026 session",
      status: "SUSPENDED",
      length: null,
      playerCount: 0,
      number: 3,
    });
    const [story] = await db
      .select({ idStorySession: tables.stories.idStorySession })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, mine));
    expect(story.idStorySession).toBeNull();
    // Through the workflow, as a session paused at the table: opened, then
    // suspended, so resuming it counts the wait as paused.
    const [stamps] = await db
      .select({
        openAt: tables.storySessions.openAt,
        suspendedAt: tables.storySessions.suspendedAt,
      })
      .from(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, result.session.idStorySession));
    expect(stamps.openAt).not.toBeNull();
    expect(stamps.suspendedAt).not.toBeNull();

    await db
      .delete(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, result.session.idStorySession));
  });

  it("makes no session on someone else's story", async () => {
    expect(await actions.sa_createStorySession(theirs, "Taken")).toEqual({
      ok: false,
      error: "Only the storyteller can add sessions to this story.",
    });
  });

  it("reads a session for its edit panel with every scene of the story", async () => {
    const found = await actions.sa_getSessionForEdit(open);

    expect(found).toMatchObject({
      idStorySession: open,
      idStory: mine,
      status: "OPEN",
      values: { title: "Fixture open", summary: "", notes: "", lingeringQuestions: "" },
    });
    expect(found?.scenes).toEqual([
      {
        idStoryScene: scene,
        title: "Fixture scene in the open session",
        status: "PENDING",
        idStorySession: open,
      },
    ]);
    expect(await actions.sa_getSessionForEdit(theirSession)).toBeNull();
  });

  it("saves the edit panel, clearing what is left empty", async () => {
    expect(
      await actions.sa_updateStorySession(open, {
        title: "  The long night ",
        summary: "They crossed the river.",
        notes: "",
        lingeringQuestions: "Who sent the letter?",
      }),
    ).toEqual({ ok: true, title: "The long night" });

    const [row] = await db
      .select({
        title: tables.storySessions.title,
        summary: tables.storySessions.summary,
        notes: tables.storySessions.notes,
        lingeringQuestions: tables.storySessions.lingeringQuestions,
      })
      .from(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, open));
    expect(row).toEqual({
      title: "The long night",
      summary: "They crossed the river.",
      notes: null,
      lingeringQuestions: "Who sent the letter?",
    });

    expect(
      await actions.sa_updateStorySession(theirSession, {
        title: "Taken",
        summary: "",
        notes: "",
        lingeringQuestions: "",
      }),
    ).toEqual({ ok: false, errors: { root: "That session is not one of your story's." } });
  });

  it("keeps someone else's session", async () => {
    expect(await actions.sa_deleteStorySession(theirSession)).toEqual({
      ok: false,
      error: "That session is not one of your story's.",
    });
    const left = await db
      .select({ id: tables.storySessions.idStorySession })
      .from(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, theirSession));
    expect(left).toHaveLength(1);
  });

  it("deletes a DONE session of the caller's story", async () => {
    expect(await actions.sa_deleteStorySession(done)).toEqual({ ok: true });
    const gone = await db
      .select({ id: tables.storySessions.idStorySession })
      .from(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, done));
    expect(gone).toEqual([]);
  });

  it("deletes a session that is not DONE, leaving its scenes in the story in no session", async () => {
    expect(await actions.sa_deleteStorySession(open)).toEqual({ ok: true });

    const gone = await db
      .select({ id: tables.storySessions.idStorySession })
      .from(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, open));
    expect(gone).toEqual([]);
    const [kept] = await db
      .select({ idStorySession: tables.storyScenes.idStorySession })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStoryScene, scene));
    expect(kept).toEqual({ idStorySession: null });
  });
});
