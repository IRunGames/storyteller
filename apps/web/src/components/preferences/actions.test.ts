// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Writes the preferences row of a
// fixture user it makes in `before` and deletes, with the user, in `after`.
// It must never be the seed user: that is a real person's account in the
// dev database, and deleting its row wiped their theme, profile colour and
// picture on every run.
import { after, before, beforeEach, it } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";

const FIXTURE_EMAIL = "preferences-fixture@example.test";

let fixtureUser = "";

let actions: typeof import("./actions");

let db: Db;
let tables: Tables;

async function fixtureRow() {
  const rows = await db
    .select()
    .from(tables.userPreferences)
    .where(eq(tables.userPreferences.idUser, fixtureUser));
  return rows;
}

// The fixture user's row, and the user, as a crashed run may have left them.
async function removeFixture() {
  const users = await db
    .select({ id: tables.user.id })
    .from(tables.user)
    .where(eq(tables.user.email, FIXTURE_EMAIL));
  const ids = users.map((user) => user.id);
  if (ids.length === 0) return;
  await db.delete(tables.userPreferences).where(inArray(tables.userPreferences.idUser, ids));
  await db.delete(tables.user).where(inArray(tables.user.id, ids));
}

describeWithDb("preferences actions", {}, (suite) => {
  before(async () => {
    ({ db, tables } = suite);
    actions = await import("./actions");
    await removeFixture();
    fixtureUser = await suite.makeUser(FIXTURE_EMAIL, { name: "Preferences Fixture" });
    suite.caller = fixtureUser;
  });

  // Every case starts from "no row yet", which is also what a run that died
  // before `after` needs.
  beforeEach(async () => {
    await db.delete(tables.userPreferences).where(eq(tables.userPreferences.idUser, fixtureUser));
  });

  after(async () => {
    if (!db) return;
    await removeFixture();
  });

  it("reads an empty map for a user with no row yet", async () => {
    expect(await actions.sa_getUserPreferences()).toEqual({});
  });

  it("creates the user's row on the first set, stamped with the caller", async () => {
    const result = await actions.sa_setUserPreference({ key: "sidebar", value: { open: true } });
    expect(result).toEqual({ ok: true });

    const rows = await fixtureRow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      idUser: fixtureUser,
      preferences: { sidebar: { open: true } },
      idCreatedByUser: fixtureUser,
      idUpdatedByUser: fixtureUser,
    });
  });

  it("merges a second key into the same row and reads both back", async () => {
    await actions.sa_setUserPreference({ key: "sidebar", value: { open: true } });
    await actions.sa_setUserPreference({ key: "dice", value: "d20" });

    expect(await fixtureRow()).toHaveLength(1);
    expect(await actions.sa_getUserPreferences()).toEqual({
      sidebar: { open: true },
      dice: "d20",
    });
  });

  it("overwrites a key that is set again", async () => {
    await actions.sa_setUserPreference({ key: "dice", value: "d20" });
    await actions.sa_setUserPreference({ key: "dice", value: "d6" });

    expect(await actions.sa_getUserPreferences()).toEqual({ dice: "d6" });
  });

  it("returns field errors for a bad key and writes nothing", async () => {
    const result = await actions.sa_setUserPreference({ key: "", value: 1 });

    expect(result).toEqual({ ok: false, errors: { key: "A preference needs a key." } });
    expect(await fixtureRow()).toHaveLength(0);
  });
});
