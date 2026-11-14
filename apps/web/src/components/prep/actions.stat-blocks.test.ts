// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The element actions' stat
// blocks: which systems the form may draw, how a block is checked against
// its system's definition on create and update, and how an update writes
// per system. Kept apart from actions.test.ts, whose fixtures are the
// board's; these are two systems of this file's own, a story run in one of
// them, and a story of someone else's, all removed in `after`.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

import type { StatBlockDefinition } from "@/lib/stat-blocks";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const TEST_USER_EMAIL = "libraries-stat-blocks@example.test";
const OTHER_EMAIL = "libraries-stat-blocks-other@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let otherUserId = "";
let myStory = 0;
let theirStory = 0;
/** A system with stats, one with a group but no stats, and one with nothing. */
let withStats = 0;
let emptyGroup = 0;
let bare = 0;

const definition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [
        {
          name: "str",
          label: "",
          type: "display",
          rack: [],
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
          initialRoll: "",
        },
      ],
    },
    {
      name: "combat",
      label: "Combat",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [
        {
          name: "hp",
          label: "HP",
          type: "pool",
          rack: [],
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
          initialRoll: "",
        },
        {
          name: "rage",
          label: "",
          type: "stack",
          rack: [],
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
          initialRoll: "",
        },
      ],
    },
  ],
};

const baseValues = {
  kind: "PERSON" as const,
  name: "Fixture Orc",
  initialName: "",
  title: "",
  description: "",
  notes: "",
  url: "",
  urlText: "",
};

// Next implements redirect() by throwing; the target rides in the digest.
async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  const thrown = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  const digest = (thrown as { digest?: string } | null)?.digest ?? "";
  return digest.startsWith("NEXT_REDIRECT") ? digest.split(";")[2] : null;
}

async function storedBlocks(idElement: number): Promise<unknown> {
  const [row] = await db
    .select({ statBlocks: tables.elements.statBlocks })
    .from(tables.elements)
    .where(eq(tables.elements.idElement, idElement));
  return row.statBlocks;
}

describe("libraries stat block actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    otherUserId = await makeTestUser(db, tables, OTHER_EMAIL);
    actions = await import("./actions");

    const systems = await db
      .insert(tables.systems)
      .values([
        {
          systemName: "Fixture Stat Blocks",
          variant: "with stats",
          statBlockDefinition: definition,
        },
        {
          systemName: "Fixture Stat Blocks",
          variant: "empty group",
          statBlockDefinition: {
            groups: [
              {
                name: "saves",
                label: "",
                keyedBy: "",
                rollAll: false,
                canHaveMultiples: false,
                stats: [],
              },
            ],
          },
        },
        { systemName: "Fixture Stat Blocks", variant: "bare" },
      ])
      .returning({ idSystem: tables.systems.idSystem, variant: tables.systems.variant });
    withStats = systems.find((row) => row.variant === "with stats")!.idSystem;
    emptyGroup = systems.find((row) => row.variant === "empty group")!.idSystem;
    bare = systems.find((row) => row.variant === "bare")!.idSystem;

    const stories = await db
      .insert(tables.stories)
      .values([
        { title: "Fixture stat blocks — mine", idSystem: withStats, idCreatedByUser: testUser },
        {
          title: "Fixture stat blocks — theirs",
          idSystem: withStats,
          idCreatedByUser: otherUserId,
        },
      ])
      .returning({ idStory: tables.stories.idStory, owner: tables.stories.idCreatedByUser });
    myStory = stories.find((row) => row.owner === testUser)!.idStory;
    theirStory = stories.find((row) => row.owner === otherUserId)!.idStory;
  });

  after(async () => {
    if (!db) return;
    await db.delete(tables.elements).where(inArray(tables.elements.idStory, [myStory, theirStory]));
    await db.delete(tables.stories).where(inArray(tables.stories.idStory, [myStory, theirStory]));
    await db
      .delete(tables.systems)
      .where(inArray(tables.systems.idSystem, [withStats, emptyGroup, bare]));
    await removeTestUser(db, tables, OTHER_EMAIL);
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  it("lists the systems with stats to fill in, and the story's own system to its storyteller", async () => {
    const mine = await actions.sa_listStatBlockSystems(myStory);
    expect(mine.storySystem).toBe(withStats);
    const ids = mine.systems.map((system) => system.idSystem);
    expect(ids).toContain(withStats);
    expect(ids).not.toContain(emptyGroup);
    expect(ids).not.toContain(bare);
    expect(mine.systems.find((system) => system.idSystem === withStats)).toEqual({
      idSystem: withStats,
      label: "Fixture Stat Blocks · with stats",
      definition,
    });

    expect((await actions.sa_listStatBlockSystems(theirStory)).storySystem).toBeNull();
  });

  it("creates an element with its block checked against the definition", async () => {
    const key = String(withStats);
    const refused = await actions.sa_createElement(myStory, {
      ...baseValues,
      statBlocks: {
        [key]: {
          stats: { str: { value: 12 } },
          combat: { hp: { value: 20, max: 12 }, rage: { value: 0 } },
        },
        [String(bare)]: {},
      },
    });
    expect(refused).toEqual({
      ok: false,
      errors: {
        [`statBlocks.${key}.combat.hp.value`]: "That is above the max of 12.",
        [`statBlocks.${bare}`]: "That system has no stats to fill in.",
      },
    });

    const created = await actions.sa_createElement(myStory, {
      ...baseValues,
      statBlocks: {
        [key]: {
          stats: { str: { value: "12" } },
          combat: { hp: { value: "9", min: "" }, rage: { value: 1, max: "" } },
        },
      },
    });
    expect(created).toEqual({ ok: true });
    const [element] = await db
      .select({ idElement: tables.elements.idElement })
      .from(tables.elements)
      .where(eq(tables.elements.idStory, myStory));
    expect(await storedBlocks(element.idElement)).toEqual({
      [key]: {
        stats: { str: { value: 12 } },
        combat: { hp: { value: 9, min: 0 }, rage: { value: 1 } },
      },
    });
    expect((await actions.sa_getElementForEdit(element.idElement))?.values.statBlocks).toEqual({
      [key]: {
        stats: { str: { value: 12 } },
        combat: { hp: { value: 9, min: 0 }, rage: { value: 1 } },
      },
    });
  });

  it("writes per system on update: replaces what the form carries, drops what it removed, keeps the rest", async () => {
    const key = String(withStats);
    const [element] = await db
      .insert(tables.elements)
      .values({
        idStory: myStory,
        kind: "THING",
        name: "Fixture Ledger",
        // One block the form will carry, one it will remove, and one it
        // never shows, all stored however they were.
        statBlocks: {
          [key]: {
            stats: { str: { value: 3 } },
            combat: { hp: { value: 1, min: 0 }, rage: { value: 0 } },
          },
          "-999998": { old: { thing: { value: 1 } } },
          "-999999": { kept: { thing: { value: 2 } } },
        },
        idCreatedByUser: testUser,
      })
      .returning({ idElement: tables.elements.idElement });

    expect(
      await redirectOf(
        actions.sa_updateElement(element.idElement, {
          ...baseValues,
          name: "Fixture Ledger",
          statBlocks: {
            [key]: {
              stats: { str: { value: 15 } },
              combat: { hp: { value: 15 }, rage: { value: 2, max: 3 } },
            },
          },
          removedSystems: [-999998],
        }),
      ),
    ).toBe(`/stories/${myStory}/library`);

    expect(await storedBlocks(element.idElement)).toEqual({
      [key]: {
        stats: { str: { value: 15 } },
        combat: { hp: { value: 15, min: 0 }, rage: { value: 2, max: 3 } },
      },
      "-999999": { kept: { thing: { value: 2 } } },
    });

    // A form that posts no blocks at all leaves the column as it is.
    expect(
      await redirectOf(
        actions.sa_updateElement(element.idElement, { ...baseValues, name: "Fixture Ledger" }),
      ),
    ).toBe(`/stories/${myStory}/library`);
    expect(await storedBlocks(element.idElement)).toMatchObject({
      "-999999": { kept: { thing: { value: 2 } } },
    });
  });
});
