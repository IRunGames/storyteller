// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Writes the seed user's one
// preferences row and removes it again in `after`; the negative-id seed data
// is never touched.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

// `@/db` opens its pool at import time, so it has to be pulled in from inside
// `before` — a static import is evaluated before loadEnvConfig() above runs,
// and the pool would be built without a connection string.
type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

async function seedUserRow() {
  const rows = await db
    .select()
    .from(tables.userPreferences)
    .where(eq(tables.userPreferences.idUser, SEED_USER));
  return rows;
}

describe("preferences actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");
  });

  // Every case starts from "no row yet", which is also what a run that died
  // before `after` needs.
  beforeEach(async () => {
    await db.delete(tables.userPreferences).where(eq(tables.userPreferences.idUser, SEED_USER));
  });

  after(async () => {
    if (!db) return;
    await db.delete(tables.userPreferences).where(eq(tables.userPreferences.idUser, SEED_USER));
    // Otherwise the process lingers until the pool's idle timeout.
    await db.$client.end();
  });

  it("reads an empty map for a user with no row yet", async () => {
    expect(await actions.sa_getUserPreferences()).toEqual({});
  });

  it("creates the user's row on the first set, stamped with the caller", async () => {
    const result = await actions.sa_setUserPreference({ key: "sidebar", value: { open: true } });
    expect(result).toEqual({ ok: true });

    const rows = await seedUserRow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      idUser: SEED_USER,
      preferences: { sidebar: { open: true } },
      idCreatedByUser: SEED_USER,
      idUpdatedByUser: SEED_USER,
    });
  });

  it("merges a second key into the same row and reads both back", async () => {
    await actions.sa_setUserPreference({ key: "sidebar", value: { open: true } });
    await actions.sa_setUserPreference({ key: "dice", value: "d20" });

    expect(await seedUserRow()).toHaveLength(1);
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
    expect(await seedUserRow()).toHaveLength(0);
  });
});
