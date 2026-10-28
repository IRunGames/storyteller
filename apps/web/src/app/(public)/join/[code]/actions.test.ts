// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a storyteller with
// a story and a join code, and a pool of joiners: test users of their own,
// some of them guests (is_anonymous), all under @example.test. Everything
// is removed again in `after`.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const OWNER_EMAIL = "join-actions-owner@example.test";
const joinerEmail = (n: number) => `join-actions-joiner-${n}@example.test`;
const JOINERS = 12;
const CODE = "joinActionsT";
const hasDb = Boolean(process.env.DATABASE_URL);

// Who is asking; "" is a visitor with no session at all.
let caller = "";
const getSession = mock.fn(async () => (caller ? { user: { id: caller } } : null));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let owner = "";
let joiners: string[] = [];
let story = 0;

describe("join actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    owner = await makeTestUser(db, tables, OWNER_EMAIL);
    joiners = [];
    for (let n = 0; n < JOINERS; n++) {
      joiners.push(await makeTestUser(db, tables, joinerEmail(n)));
    }
    // The first two are guests; the rest have accounts.
    await db
      .update(tables.user)
      .set({ isAnonymous: true })
      .where(inArray(tables.user.id, joiners.slice(0, 2)));

    // A crashed run leaves its story holding the code.
    await db
      .update(tables.stories)
      .set({ joinCode: null })
      .where(eq(tables.stories.joinCode, CODE));
    [{ id: story }] = await db
      .insert(tables.stories)
      .values({ title: "Join fixture", idCreatedByUser: owner, joinCode: CODE })
      .returning({ id: tables.stories.idStory });
  });

  beforeEach(async () => {
    caller = "";
    await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, story));
    await db.update(tables.user).set({ idUserType: -2 }).where(eq(tables.user.id, owner));
  });

  after(async () => {
    if (!db) return;
    if (story) await db.delete(tables.stories).where(eq(tables.stories.idStory, story));
    for (let n = 0; n < JOINERS; n++) await removeTestUser(db, tables, joinerEmail(n));
    await removeTestUser(db, tables, OWNER_EMAIL);
    await db.$client.end();
  });

  const seats = () =>
    db
      .select({ idUser: tables.storyPlayers.idUser, isFromLink: tables.storyPlayers.isFromLink })
      .from(tables.storyPlayers)
      .where(eq(tables.storyPlayers.idStory, story));

  describe("sa_getJoinStory", () => {
    it("shows the story to a visitor with no session", async () => {
      expect(await actions.sa_getJoinStory(CODE)).toMatchObject({
        idStory: story,
        title: "Join fixture",
        isFull: false,
        isAtTable: false,
      });
    });

    it("knows nothing of a code that is not a story's", async () => {
      expect(await actions.sa_getJoinStory("noSuchCode00")).toBeNull();
      expect(await actions.sa_getJoinStory("../../etc")).toBeNull();
    });

    it("tells the storyteller and a seated player they are already at the table", async () => {
      caller = owner;
      expect((await actions.sa_getJoinStory(CODE))?.isAtTable).toBe(true);
      await db.insert(tables.storyPlayers).values({ idStory: story, idUser: joiners[5] });
      caller = joiners[5];
      expect((await actions.sa_getJoinStory(CODE))?.isAtTable).toBe(true);
    });
  });

  describe("sa_joinByLink", () => {
    it("seats a guest from the link under the name they picked", async () => {
      caller = joiners[0];
      expect(await actions.sa_joinByLink(CODE, "  Sleepy Otter ")).toEqual({
        ok: true,
        idStory: story,
      });
      expect(await seats()).toEqual([{ idUser: joiners[0], isFromLink: true }]);
      const [row] = await db
        .select({ name: tables.user.name, nickName: tables.user.nickName })
        .from(tables.user)
        .where(eq(tables.user.id, joiners[0]));
      expect(row).toEqual({ name: "Sleepy Otter", nickName: "Sleepy Otter" });
    });

    it("refuses a guest with no name", async () => {
      caller = joiners[1];
      expect(await actions.sa_joinByLink(CODE, "   ")).toMatchObject({ ok: false });
      expect(await seats()).toEqual([]);
    });

    it("leaves the name of someone with an account alone", async () => {
      caller = joiners[2];
      expect(await actions.sa_joinByLink(CODE, "Ignored Name")).toMatchObject({ ok: true });
      const [row] = await db
        .select({ name: tables.user.name })
        .from(tables.user)
        .where(eq(tables.user.id, joiners[2]));
      expect(row.name).toBe("Test User");
    });

    it("lets the storyteller and someone already seated through without a new seat", async () => {
      await db.insert(tables.storyPlayers).values({ idStory: story, idUser: joiners[3] });
      caller = joiners[3];
      expect(await actions.sa_joinByLink(CODE, "x")).toEqual({ ok: true, idStory: story });
      caller = owner;
      expect(await actions.sa_joinByLink(CODE, "x")).toEqual({ ok: true, idStory: story });
      expect(await seats()).toEqual([{ idUser: joiners[3], isFromLink: false }]);
    });

    it("seats three from the link for an unpaid storyteller, then says the table is full", async () => {
      for (const joiner of joiners.slice(2, 5)) {
        caller = joiner;
        expect(await actions.sa_joinByLink(CODE, "x")).toMatchObject({ ok: true });
      }
      caller = joiners[5];
      expect(await actions.sa_joinByLink(CODE, "x")).toEqual({
        ok: false,
        error: "This table is full.",
      });
      expect((await actions.sa_getJoinStory(CODE))?.isFull).toBe(true);
    });

    it("does not count invited players against the cap", async () => {
      await db
        .insert(tables.storyPlayers)
        .values(joiners.slice(8, 12).map((idUser) => ({ idStory: story, idUser })));
      for (const joiner of joiners.slice(2, 5)) {
        caller = joiner;
        expect(await actions.sa_joinByLink(CODE, "x")).toMatchObject({ ok: true });
      }
    });

    it("seats ten from the link for a paid storyteller", async () => {
      await db.update(tables.user).set({ idUserType: -3 }).where(eq(tables.user.id, owner));
      for (const joiner of joiners.slice(0, 10)) {
        caller = joiner;
        expect(await actions.sa_joinByLink(CODE, "Brave Yak")).toMatchObject({ ok: true });
      }
      caller = joiners[10];
      expect(await actions.sa_joinByLink(CODE, "x")).toMatchObject({ ok: false });
      expect(await seats()).toHaveLength(10);
    });

    it("turns away a code that is not a story's", async () => {
      caller = joiners[2];
      expect(await actions.sa_joinByLink("noSuchCode00", "x")).toMatchObject({ ok: false });
    });
  });
});
