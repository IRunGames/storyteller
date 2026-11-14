// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. A system of this file's own
// with a definition, a story of the test user's run in it, one of another
// storyteller's in it, and one of the test user's with no system, all
// removed in `after`.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

import type { StatBlockDefinition } from "@/lib/stat-blocks";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const TEST_USER_EMAIL = "story-stat-blocks@example.test";
const OTHER_EMAIL = "story-stat-blocks-other@example.test";
const SYSTEM_NAME = "Fixture Story Stat Blocks";
let testUser = "";
let otherUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let idSystem = 0;
let myStory = 0;
let theirStory = 0;
let noSystemStory = 0;

const stat = {
  name: "str",
  label: "Strength",
  type: "display" as const,
  rack: [],
  computedAs: "",
  visible: true,
  format: "" as const,
  description: "",
  sticky: false,
  static: false,
  roll: "",
  global: false,
  upDown: false,
  leftRight: false,
  initialRoll: "",
  initialFrom: "",
};

const definition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [stat],
    },
  ],
  updatedAt: "2026-10-01T12:00:00.000Z",
};

/** A definition as the column holds it, the stamp aside. */
const groupsOf = (found: StatBlockDefinition | null | undefined) => found?.groups;

describe("story stat block actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    otherUser = await makeTestUser(db, tables, OTHER_EMAIL);
    actions = await import("./actions");

    await db.delete(tables.systems).where(eq(tables.systems.systemName, SYSTEM_NAME));
    const [system] = await db
      .insert(tables.systems)
      .values({ systemName: SYSTEM_NAME, systemVersion: "1e", statBlockDefinition: definition })
      .returning({ idSystem: tables.systems.idSystem });
    idSystem = system.idSystem;

    const stories = await db
      .insert(tables.stories)
      .values([
        { title: "Fixture story stat blocks — mine", idSystem, idCreatedByUser: testUser },
        { title: "Fixture story stat blocks — theirs", idSystem, idCreatedByUser: otherUser },
        { title: "Fixture story stat blocks — no system", idCreatedByUser: testUser },
      ])
      .returning({ idStory: tables.stories.idStory, title: tables.stories.title });
    const idFor = (end: string) => stories.find((row) => row.title.endsWith(end))!.idStory;
    myStory = idFor("mine");
    theirStory = idFor("theirs");
    noSystemStory = idFor("no system");
  });

  after(async () => {
    if (!db) return;
    await db
      .delete(tables.stories)
      .where(inArray(tables.stories.idStory, [myStory, theirStory, noSystemStory]));
    await db.delete(tables.systems).where(eq(tables.systems.idSystem, idSystem));
    await removeTestUser(db, tables, OTHER_EMAIL);
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  it("shows anyone signed in a story's system's definition, and whether they tell the story", async () => {
    expect(await actions.sa_getStoryStatBlockDefinition(myStory)).toEqual({
      isStoryteller: true,
      system: { idSystem, label: `${SYSTEM_NAME} (1e)`, definition },
      copy: null,
    });
    expect(await actions.sa_getStoryStatBlockDefinition(theirStory)).toMatchObject({
      isStoryteller: false,
      copy: null,
    });
    expect(await actions.sa_getStoryStatBlockDefinition(noSystemStory)).toEqual({
      isStoryteller: true,
      system: null,
      copy: null,
    });
    expect(await actions.sa_getStoryStatBlockDefinition(2 ** 31)).toBeNull();
    expect(await actions.sa_getStoryStatBlockDefinition(2 ** 30)).toBeNull();
  });

  it("copies the system's definition onto the storyteller's own story, stamped with when", async () => {
    const before = Date.now();
    const copied = await actions.sa_copySystemStatBlockDefinition(myStory);
    expect(copied).toEqual({
      ok: true,
      copy: { groups: definition.groups, updatedAt: expect.any(String) },
    });
    const found = await actions.sa_getStoryStatBlockDefinition(myStory);
    expect(groupsOf(found?.copy)).toEqual(definition.groups);
    expect(Date.parse(found!.copy!.updatedAt!)).toBeGreaterThanOrEqual(before);
    // The system's own definition, and its stamp, are as they were.
    expect(found?.system?.definition).toEqual(definition);
  });

  it("refuses a copy to anyone but the storyteller, and to a story with no system", async () => {
    expect(await actions.sa_copySystemStatBlockDefinition(theirStory)).toEqual({
      ok: false,
      error: "That story is not yours to change.",
    });
    expect(await actions.sa_copySystemStatBlockDefinition(noSystemStory)).toEqual({
      ok: false,
      error: "This story has no game system to copy from.",
    });
    expect((await actions.sa_getStoryStatBlockDefinition(theirStory))?.copy).toBeNull();
    expect((await actions.sa_getStoryStatBlockDefinition(noSystemStory))?.copy).toBeNull();
  });

  it("saves the storyteller's changes to the copy, stamped, leaving the system's alone", async () => {
    const changed: StatBlockDefinition = {
      groups: [{ ...definition.groups[0], label: "Attributes" }],
    };
    const before = Date.now();
    expect(await actions.sa_setStoryStatBlockDefinition(myStory, changed)).toEqual({ ok: true });
    const found = await actions.sa_getStoryStatBlockDefinition(myStory);
    expect(groupsOf(found?.copy)).toEqual(changed.groups);
    expect(Date.parse(found!.copy!.updatedAt!)).toBeGreaterThanOrEqual(before);
    expect(found?.system?.definition).toEqual(definition);
  });

  it("refuses a copy the schema refuses, on the field it names, and anyone else's story", async () => {
    const broken = {
      groups: [
        {
          ...definition.groups[0],
          stats: [{ ...stat, type: "computed", computedAs: "stats.dex + 1" }],
        },
      ],
    };
    expect(await actions.sa_setStoryStatBlockDefinition(myStory, broken)).toEqual({
      ok: false,
      errors: { "groups.0.stats.0.computedAs": "There is no stat stats.dex." },
    });
    expect(await actions.sa_setStoryStatBlockDefinition(theirStory, definition)).toEqual({
      ok: false,
      errors: { root: "That story is not yours to change." },
    });
    expect(await actions.sa_setStoryStatBlockDefinition(noSystemStory, definition)).toEqual({
      ok: false,
      errors: { root: "This story has no game system for a stat block." },
    });
    expect((await actions.sa_getStoryStatBlockDefinition(theirStory))?.copy).toBeNull();
  });

  it("overwrites the storyteller's copy with the system's definition as it stands", async () => {
    expect(groupsOf((await actions.sa_getStoryStatBlockDefinition(myStory))?.copy)?.[0].label).toBe(
      "Attributes",
    );
    expect(await actions.sa_copySystemStatBlockDefinition(myStory)).toMatchObject({ ok: true });
    expect(groupsOf((await actions.sa_getStoryStatBlockDefinition(myStory))?.copy)).toEqual(
      definition.groups,
    );
  });
});
