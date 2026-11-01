// Integration test for the tables' session notes panel in actions.ts,
// against the real database and skipped when DATABASE_URL is unset. `before`
// makes a story the test user tells with one session, and a second user to
// seat at it and unseat; `after` deletes the story, which takes the session
// with it, and the second user.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "sessions-notes-actions@example.test";
const OTHER_EMAIL = "sessions-notes-fixture@example.test";
let testUser = "";
let otherUserId = "";
const hasDb = Boolean(process.env.DATABASE_URL);

// Which user is signed in: the storyteller by default, switched to the
// other user by the tests that read as a player or a stranger.
let caller = "";
const getSession = mock.fn(async () => ({ user: { id: caller } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let idStory = 0;
let idStorySession = 0;

describe("session notes actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    caller = testUser;
    actions = await import("./actions");

    // A rerun after a crash would trip the unique email.
    await db.delete(tables.user).where(eq(tables.user.email, OTHER_EMAIL));
    const [other] = await db
      .insert(tables.user)
      .values({ name: "Session Notes Fixture", email: OTHER_EMAIL })
      .returning({ id: tables.user.id });
    otherUserId = other.id;

    [{ id: idStory }] = await db
      .insert(tables.stories)
      .values({ title: "Session notes fixture", idCreatedByUser: testUser })
      .returning({ id: tables.stories.idStory });
    [{ id: idStorySession }] = await db
      .insert(tables.storySessions)
      .values({ idStory, status: "OPEN", notes: "Kept so far.", idCreatedByUser: testUser })
      .returning({ id: tables.storySessions.idStorySession });
  });

  after(async () => {
    if (!db) return;
    if (idStory) await db.delete(tables.stories).where(eq(tables.stories.idStory, idStory));
    if (otherUserId) await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  const theirSeat = () =>
    and(eq(tables.storyPlayers.idStory, idStory), eq(tables.storyPlayers.idUser, otherUserId));

  it("hands the storyteller the session's notes, and saves what they write, empty as null", async () => {
    expect(await actions.sa_getSessionNotes(idStorySession)).toEqual({
      notes: "Kept so far.",
      lingeringQuestions: null,
    });

    expect(
      await actions.sa_setSessionNotes(idStorySession, {
        notes: "  Written at the table.  ",
        lingeringQuestions: "",
      }),
    ).toEqual({
      ok: true,
      notes: { notes: "Written at the table.", lingeringQuestions: null },
    });
    const [row] = await db
      .select({
        notes: tables.storySessions.notes,
        lingeringQuestions: tables.storySessions.lingeringQuestions,
        idUpdatedByUser: tables.storySessions.idUpdatedByUser,
      })
      .from(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, idStorySession));
    expect(row).toEqual({
      notes: "Written at the table.",
      lingeringQuestions: null,
      idUpdatedByUser: testUser,
    });
  });

  it("lets a seated player read and write them too, and nobody without a seat", async () => {
    caller = otherUserId;
    try {
      expect(await actions.sa_getSessionNotes(idStorySession)).toBeNull();
      expect(
        await actions.sa_setSessionNotes(idStorySession, { notes: "x", lingeringQuestions: "" }),
      ).toEqual({ ok: false, errors: { root: "This session is not at a table of yours." } });

      await db.insert(tables.storyPlayers).values({ idStory, idUser: otherUserId });
      expect(await actions.sa_getSessionNotes(idStorySession)).toEqual({
        notes: "Written at the table.",
        lingeringQuestions: null,
      });
      expect(
        await actions.sa_setSessionNotes(idStorySession, {
          notes: "Written at the table.",
          lingeringQuestions: "Who sent them?",
        }),
      ).toEqual({
        ok: true,
        notes: { notes: "Written at the table.", lingeringQuestions: "Who sent them?" },
      });
    } finally {
      caller = testUser;
      await db.delete(tables.storyPlayers).where(theirSeat());
    }
  });

  it("refuses text past the schema's limit, and answers nothing for an unusable id", async () => {
    const result = await actions.sa_setSessionNotes(idStorySession, {
      notes: "x".repeat(8001),
      lingeringQuestions: "",
    });
    expect(result).toEqual({
      ok: false,
      errors: { notes: "Keep the notes under 8000 characters." },
    });

    expect(await actions.sa_getSessionNotes(2 ** 40)).toBeNull();
    expect(await actions.sa_getSessionNotes(2 ** 30)).toBeNull();
  });
});
