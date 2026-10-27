// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The caller is a fixture user made
// here, never the seed user, because these actions rewrite the caller's own
// name and bio; the systems it likes are seed rows, which it only reads.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { asc, eq, inArray, lt } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const hasDb = Boolean(process.env.DATABASE_URL);
const ME_EMAIL = "profile-fixture-me@example.test";
const OTHER_EMAIL = "profile-fixture-other@example.test";

let me = "";
let other = "";
const getSession = mock.fn(async () => ({ user: { id: me } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let seedSystems: { idSystem: number; systemName: string }[] = [];
let mine = 0;
let mineArchived = 0;
let theirs = 0;
let theirsArchived = 0;

async function removeFixtures() {
  const fixtureUsers = await db
    .select({ id: tables.user.id })
    .from(tables.user)
    .where(inArray(tables.user.email, [ME_EMAIL, OTHER_EMAIL]));
  const ids = fixtureUsers.map((row) => row.id);
  if (ids.length === 0) return;

  const fixtureStories = await db
    .select({ id: tables.stories.idStory })
    .from(tables.stories)
    .where(inArray(tables.stories.idCreatedByUser, ids));
  const storyIds = fixtureStories.map((row) => row.id);

  await db.delete(tables.userSystems).where(inArray(tables.userSystems.idUser, ids));
  if (storyIds.length > 0) {
    await db.delete(tables.storyPlayers).where(inArray(tables.storyPlayers.idStory, storyIds));
    await db.delete(tables.stories).where(inArray(tables.stories.idStory, storyIds));
  }
  await db.delete(tables.user).where(inArray(tables.user.id, ids));
}

describe("profile actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    await removeFixtures();
    [{ id: me }, { id: other }] = await db
      .insert(tables.user)
      .values([
        { name: "Profile Fixture", email: ME_EMAIL, nickName: "Fixture" },
        { name: "Profile Other", email: OTHER_EMAIL },
      ])
      .returning({ id: tables.user.id });

    seedSystems = await db
      .select({ idSystem: tables.systems.idSystem, systemName: tables.systems.systemName })
      .from(tables.systems)
      .where(lt(tables.systems.idSystem, 0))
      .orderBy(asc(tables.systems.idSystem))
      .limit(25);

    [{ id: mine }, { id: mineArchived }, { id: theirs }, { id: theirsArchived }] = await db
      .insert(tables.stories)
      .values([
        { title: "Profile fixture — mine", idCreatedByUser: me },
        { title: "Profile fixture — mine, archived", idCreatedByUser: me, isArchived: true },
        { title: "Profile fixture — theirs", idCreatedByUser: other },
        { title: "Profile fixture — theirs, archived", idCreatedByUser: other, isArchived: true },
      ])
      .returning({ id: tables.stories.idStory });

    await db.insert(tables.storyPlayers).values([
      { idStory: theirs, idUser: me },
      { idStory: theirsArchived, idUser: me },
      // A seat at their own table must not put the story under Playing too.
      { idStory: mine, idUser: me },
    ]);
  });

  beforeEach(async () => {
    if (db) await db.delete(tables.userSystems).where(eq(tables.userSystems.idUser, me));
  });

  after(async () => {
    if (!db) return;
    await removeFixtures();
    await db.$client.end();
  });

  it("reads the caller's profile", async () => {
    const profile = await actions.sa_getProfile();

    expect(profile).toMatchObject({
      name: "Profile Fixture",
      email: ME_EMAIL,
      nickName: "Fixture",
      bio: null,
      image: null,
      systems: [],
    });
    expect(profile.createdAt).toBeInstanceOf(Date);
  });

  it("saves the name, nickname and bio, trimmed", async () => {
    const result = await actions.sa_updateProfileDetails({
      name: " Fixture Renamed ",
      nickName: "",
      bio: "  Plays a bard.  ",
    });
    expect(result).toEqual({ ok: true });

    const [row] = await db
      .select({ name: tables.user.name, nickName: tables.user.nickName, bio: tables.user.bio })
      .from(tables.user)
      .where(eq(tables.user.id, me));
    expect(row).toEqual({ name: "Fixture Renamed", nickName: "", bio: "Plays a bard." });

    await actions.sa_updateProfileDetails({ name: "Fixture Renamed", nickName: "", bio: "" });
    const [cleared] = await db
      .select({ bio: tables.user.bio })
      .from(tables.user)
      .where(eq(tables.user.id, me));
    expect(cleared.bio).toBeNull();
  });

  it("refuses an empty name and changes nothing", async () => {
    const result = await actions.sa_updateProfileDetails({ name: " ", nickName: "", bio: "" });
    expect(result).toEqual({ ok: false, errors: { name: "Your name cannot be empty." } });

    const [row] = await db
      .select({ name: tables.user.name })
      .from(tables.user)
      .where(eq(tables.user.id, me));
    expect(row.name).not.toBe("");
  });

  it("adds and removes liked systems, handing back the list", async () => {
    const [first, second] = seedSystems;

    const added = await actions.sa_addLikedSystem(first.idSystem);
    expect(added.ok && added.systems.map((s) => s.idSystem)).toEqual([first.idSystem]);

    // Liking it again is a no-op rather than an error.
    await actions.sa_addLikedSystem(first.idSystem);
    const both = await actions.sa_addLikedSystem(second.idSystem);
    expect(both.ok && both.systems).toHaveLength(2);

    const removed = await actions.sa_removeLikedSystem(first.idSystem);
    expect(removed.ok && removed.systems.map((s) => s.idSystem)).toEqual([second.idSystem]);

    expect((await actions.sa_getProfile()).systems.map((s) => s.idSystem)).toEqual([
      second.idSystem,
    ]);
  });

  it("refuses a system that does not exist", async () => {
    expect(await actions.sa_addLikedSystem(2_000_000_000)).toEqual({
      ok: false,
      errors: { root: "That system is not on the list any more." },
    });
  });

  it("stops at twenty systems", async () => {
    for (const system of seedSystems.slice(0, 20)) {
      await actions.sa_addLikedSystem(system.idSystem);
    }

    expect(await actions.sa_addLikedSystem(seedSystems[20].idSystem)).toEqual({
      ok: false,
      errors: { root: "Keep it to 20 systems." },
    });
  });

  it("searches systems by name and leaves out the ones already liked", async () => {
    const [first] = seedSystems;
    const before = await actions.sa_searchSystems(first.systemName);
    expect(before.map((s) => s.idSystem)).toContain(first.idSystem);

    await actions.sa_addLikedSystem(first.idSystem);
    const after = await actions.sa_searchSystems(first.systemName);
    expect(after.map((s) => s.idSystem)).not.toContain(first.idSystem);

    expect(await actions.sa_searchSystems("no system is called this")).toEqual([]);
    expect((await actions.sa_searchSystems("")).length).toBeGreaterThan(0);
  });

  it("lists the stories the caller tells, archived ones left out", async () => {
    const owned = await actions.sa_listOwnedStories();
    expect(owned.map((s) => s.idStory)).toEqual([mine]);
    expect(owned[0].isOwner).toBe(true);
  });

  it("lists the stories the caller plays in, archived and their own left out", async () => {
    const playing = await actions.sa_listPlayingStories();
    expect(playing.map((s) => s.idStory)).toEqual([theirs]);
    expect(playing[0].isOwner).toBe(false);
  });

  it("never lists another user's stories as the caller's", async () => {
    const owned = await actions.sa_listOwnedStories();
    expect(owned.map((s) => s.idStory)).not.toContain(theirs);
    expect(owned.map((s) => s.idStory)).not.toContain(mineArchived);
  });
});
