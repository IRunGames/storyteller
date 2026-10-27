// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story a second
// user tells and the test user plays in, with one element linked to seven
// scenes played at different times, one of the links hidden, and a
// stranger's story with a scene of its own.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "components-elements-actions@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

let caller = "";
const getSession = mock.fn(async () => ({ user: { id: caller } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let tellerId = "";
let playsIn = 0;
let strangers = 0;
let zed = 0;
let strangersZed = 0;
const sceneIds: number[] = [];

describe("element history actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    caller = testUser;
    actions = await import("./actions");

    await db
      .delete(tables.user)
      .where(eq(tables.user.email, "element-history-fixture@example.test"));
    const [teller] = await db
      .insert(tables.user)
      .values({ name: "Element History Fixture", email: "element-history-fixture@example.test" })
      .returning({ id: tables.user.id });
    tellerId = teller.id;

    [{ id: playsIn }, { id: strangers }] = await db
      .insert(tables.stories)
      .values([
        { title: "Element history fixture — plays in", idCreatedByUser: tellerId },
        { title: "Element history fixture — strangers", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.stories.idStory });
    await db.insert(tables.storyPlayers).values({ idStory: playsIn, idUser: testUser });

    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: playsIn, status: "DONE", title: "Kildealg", idCreatedByUser: tellerId })
      .returning({ id: tables.storySessions.idStorySession });

    // Seven scenes, played a day apart, the first most recently; the
    // seventh never played. Inserted one at a time so the order of ids is
    // not the order of play.
    for (let n = 1; n <= 7; n += 1) {
      const [row] = await db
        .insert(tables.storyScenes)
        .values({
          idStory: playsIn,
          idStorySession: n === 7 ? null : session.id,
          sceneTitle: `Fixture scene ${n}`,
          status: n === 7 ? "PENDING" : "COMPLETE",
          activeAt: n === 7 ? null : new Date(Date.UTC(2026, 9, 20 - n)),
          idCreatedByUser: tellerId,
        })
        .returning({ id: tables.storyScenes.idStoryScene });
      sceneIds.push(row.id);
    }
    const [theirs] = await db
      .insert(tables.storyScenes)
      .values({ idStory: strangers, sceneTitle: "Fixture elsewhere", idCreatedByUser: tellerId })
      .returning({ id: tables.storyScenes.idStoryScene });

    [{ id: zed }, { id: strangersZed }] = await db
      .insert(tables.elements)
      .values([
        { idStory: playsIn, kind: "PERSON", name: "Fixture Zed", idCreatedByUser: tellerId },
        { idStory: strangers, kind: "PERSON", name: "Fixture Zed too", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.elements.idElement });
    await db.insert(tables.sceneElements).values([
      ...sceneIds.map((idStoryScene, index) => ({
        idStoryScene,
        idElement: zed,
        // Hidden in the third scene.
        ...(index === 2 ? { status: "INVISIBLE" } : {}),
        idCreatedByUser: tellerId,
      })),
      { idStoryScene: theirs.id, idElement: strangersZed, idCreatedByUser: tellerId },
    ]);
  });

  beforeEach(() => {
    caller = testUser;
  });

  after(async () => {
    if (!db) return;
    if (playsIn || strangers) {
      await db
        .delete(tables.storyPlayers)
        .where(inArray(tables.storyPlayers.idStory, [playsIn, strangers]));
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, [playsIn, strangers]));
    }
    if (tellerId) await db.delete(tables.user).where(eq(tables.user.id, tellerId));
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  const titles = (page: { rows: { title: string }[] } | null) => page?.rows.map((row) => row.title);

  it("lists the storyteller every other scene the element is in, most recently played first, five at a time", async () => {
    caller = tellerId;
    const first = await actions.sa_listElementHistory(playsIn, zed, sceneIds[0], 0);
    expect(titles(first)).toEqual([
      "Fixture scene 2",
      "Fixture scene 3",
      "Fixture scene 4",
      "Fixture scene 5",
      "Fixture scene 6",
    ]);
    expect(first?.hasMore).toBe(true);
    expect(first?.rows[0]).toMatchObject({
      idStoryScene: sceneIds[1],
      status: "COMPLETE",
      sessionHeading: "1. Kildealg",
      at: "2026-10-18T00:00:00.000Z",
    });

    // The never-played scene last, with no date and no session.
    const second = await actions.sa_listElementHistory(playsIn, zed, sceneIds[0], 5);
    expect(titles(second)).toEqual(["Fixture scene 7"]);
    expect(second?.hasMore).toBe(false);
    expect(second?.rows[0]).toMatchObject({ sessionHeading: null, at: null });
  });

  it("lists a player the same, less the scenes the element is hidden in", async () => {
    const page = await actions.sa_listElementHistory(playsIn, zed, sceneIds[0], 0);
    expect(titles(page)).toEqual([
      "Fixture scene 2",
      "Fixture scene 4",
      "Fixture scene 5",
      "Fixture scene 6",
      "Fixture scene 7",
    ]);
    expect(page?.hasMore).toBe(false);
  });

  it("lists every scene with none to leave out", async () => {
    caller = tellerId;
    const page = await actions.sa_listElementHistory(playsIn, zed, null, 0);
    expect(page?.rows).toHaveLength(5);
    expect(titles(page)?.[0]).toBe("Fixture scene 1");
  });

  it("finds nothing for a stranger, an element of another story, or ids out of range", async () => {
    expect(await actions.sa_listElementHistory(strangers, strangersZed, null, 0)).toBeNull();
    expect(await actions.sa_listElementHistory(playsIn, strangersZed, null, 0)).toBeNull();
    expect(await actions.sa_listElementHistory(2 ** 40, zed, null, 0)).toBeNull();
  });
});
