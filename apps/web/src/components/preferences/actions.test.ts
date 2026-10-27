// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Writes the preferences row of a
// fixture user it makes in `before` and deletes, with the user, in `after`.
// It must never be the seed user: that is a real person's account in the
// dev database, and deleting its row wiped their theme, profile colour and
// picture on every run.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const FIXTURE_EMAIL = "preferences-fixture@example.test";
const hasDb = Boolean(process.env.DATABASE_URL);

let fixtureUser = "";
const getSession = mock.fn(async () => ({ user: { id: fixtureUser } }));

let actions: typeof import("./actions");

// `@/db` opens its pool at import time, so it has to be pulled in from inside
// `before` — a static import is evaluated before loadEnvConfig() above runs,
// and the pool would be built without a connection string.
type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

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

describe("preferences actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");
    await removeFixture();
    const [created] = await db
      .insert(tables.user)
      .values({ name: "Preferences Fixture", email: FIXTURE_EMAIL })
      .returning({ id: tables.user.id });
    fixtureUser = created.id;
  });

  // Every case starts from "no row yet", which is also what a run that died
  // before `after` needs.
  beforeEach(async () => {
    await db.delete(tables.userPreferences).where(eq(tables.userPreferences.idUser, fixtureUser));
  });

  after(async () => {
    if (!db) return;
    await removeFixture();
    // Otherwise the process lingers until the pool's idle timeout.
    await db.$client.end();
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
