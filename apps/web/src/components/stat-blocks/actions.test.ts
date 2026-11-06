// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The table's reads and changes
// of an element's stat blocks: a system of this file's own with every stat
// type, a story run in it, an element with no block yet, and a story of
// someone else's, all removed in `after`.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

import type { StatBlockDefinition, StatBlocks, StatRow } from "@/lib/stat-blocks";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const TEST_USER_EMAIL = "stat-blocks-actions@example.test";
const OTHER_EMAIL = "stat-blocks-actions-other@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));

let actions: typeof import("./actions");
type ElementStatBlock = import("./actions").ElementStatBlock;

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let otherUserId = "";
let myStory = 0;
let theirStory = 0;
let idSystem = 0;
let idElement = 0;
let theirElement = 0;

const definition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      keyedBy: "",
      stats: [
        {
          name: "str",
          label: "Strength",
          type: "display",
          rack: [],
          connectedTo: "",
          computedAs: "",
        },
        {
          name: "mod",
          label: "",
          type: "computed",
          rack: [],
          connectedTo: "",
          computedAs: "stats.str - 10",
        },
      ],
    },
    {
      name: "combat",
      label: "Combat",
      keyedBy: "",
      stats: [
        {
          name: "hp",
          label: "HP",
          type: "pool",
          rack: [],
          connectedTo: "stats.str",
          computedAs: "",
        },
        { name: "mana", label: "", type: "pool", rack: [], connectedTo: "", computedAs: "" },
        { name: "rage", label: "", type: "stack", rack: [], connectedTo: "", computedAs: "" },
        {
          name: "die",
          label: "",
          type: "rack",
          rack: ["d4", "d6", "d8"],
          connectedTo: "",
          computedAs: "",
        },
      ],
    },
    // Repeats by weapon, with a pool fed from its own row's strike.
    {
      name: "attack",
      label: "Attack",
      keyedBy: "weapon",
      stats: [
        {
          name: "weapon",
          label: "Weapon",
          type: "display",
          rack: [],
          connectedTo: "",
          computedAs: "",
        },
        { name: "strike", label: "", type: "display", rack: [], connectedTo: "", computedAs: "" },
        { name: "uses", label: "", type: "pool", rack: [], connectedTo: "strike", computedAs: "" },
      ],
    },
  ],
};

async function stored(): Promise<unknown> {
  const [row] = await db
    .select({ statBlocks: tables.elements.statBlocks })
    .from(tables.elements)
    .where(eq(tables.elements.idElement, idElement));
  return row.statBlocks;
}

const statOf = (block: ElementStatBlock, group: string, name: string) =>
  block.groups.find((g) => g.name === group)!.stats.find((s) => s.name === name)!;
const rowsOf = (block: ElementStatBlock, group: string) =>
  block.groups.find((g) => g.name === group)!.rows;
const rowStatOf = (block: ElementStatBlock, group: string, key: string, name: string) =>
  rowsOf(block, group)
    .find((row) => row.key === key)!
    .stats.find((s) => s.name === name)!;

describe("stat block actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    otherUserId = await makeTestUser(db, tables, OTHER_EMAIL);
    actions = await import("./actions");

    const [system] = await db
      .insert(tables.systems)
      .values({ systemName: "Fixture Stat Block Actions", statBlockDefinition: definition })
      .returning({ idSystem: tables.systems.idSystem });
    idSystem = system.idSystem;

    const stories = await db
      .insert(tables.stories)
      .values([
        { title: "Fixture stat block actions — mine", idSystem, idCreatedByUser: testUser },
        { title: "Fixture stat block actions — theirs", idSystem, idCreatedByUser: otherUserId },
      ])
      .returning({ idStory: tables.stories.idStory, owner: tables.stories.idCreatedByUser });
    myStory = stories.find((row) => row.owner === testUser)!.idStory;
    theirStory = stories.find((row) => row.owner === otherUserId)!.idStory;

    const elements = await db
      .insert(tables.elements)
      .values([
        { idStory: myStory, kind: "PERSON", name: "Fixture Orc", idCreatedByUser: testUser },
        {
          idStory: theirStory,
          kind: "PERSON",
          name: "Fixture Theirs",
          idCreatedByUser: otherUserId,
        },
      ])
      .returning({ idElement: tables.elements.idElement, idStory: tables.elements.idStory });
    idElement = elements.find((row) => row.idStory === myStory)!.idElement;
    theirElement = elements.find((row) => row.idStory === theirStory)!.idElement;
  });

  after(async () => {
    if (!db) return;
    await db.delete(tables.elements).where(inArray(tables.elements.idStory, [myStory, theirStory]));
    await db.delete(tables.stories).where(inArray(tables.stories.idStory, [myStory, theirStory]));
    await db.delete(tables.systems).where(eq(tables.systems.idSystem, idSystem));
    await removeTestUser(db, tables, OTHER_EMAIL);
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  it("shows the story's system's empty block for an element with none yet", async () => {
    const blocks = await actions.sa_getElementStatBlocks(myStory, idElement);
    expect(blocks).toHaveLength(1);
    expect(blocks![0]).toMatchObject({ idSystem, stored: false });
    expect(statOf(blocks![0], "combat", "rage")).toMatchObject({ value: 0, max: null });
    expect(statOf(blocks![0], "combat", "hp")).toMatchObject({
      value: 0,
      max: 0,
      maxFrom: "Strength",
    });
    expect(statOf(blocks![0], "combat", "die")).toMatchObject({ value: "d4" });
  });

  it("answers null for a story that is not the caller's, and an element that is not the story's", async () => {
    expect(await actions.sa_getElementStatBlocks(theirStory, theirElement)).toBeNull();
    expect(await actions.sa_getElementStatBlocks(myStory, theirElement)).toBeNull();
    expect(
      await actions.sa_setElementStat(myStory, theirElement, idSystem, "stats", "str", {
        value: 1,
      }),
    ).toEqual({
      ok: false,
      error: "That element is not one of your story's.",
    });
  });

  it("makes the block on the first change, and keeps every other stat on the next", async () => {
    const first = await actions.sa_setElementStat(myStory, idElement, idSystem, "stats", "str", {
      value: 12,
    });
    expect(first.ok).toBe(true);
    expect(await stored()).toEqual({ [idSystem]: { stats: { str: { value: 12 } } } });

    const second = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "hp", {
      value: 5,
    });
    expect(second.ok && second.block.stored).toBe(true);
    expect(await stored()).toEqual({
      [idSystem]: { stats: { str: { value: 12 } }, combat: { hp: { value: 5, min: 0 } } },
    });
    expect(second.ok && statOf(second.block, "stats", "mod").value).toBe(2);
  });

  it("clamps a pool to the max that feeds it and to its min, and a stack to 0 and its max", async () => {
    // hp's max is Strength, 12.
    let result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "hp", {
      value: 20,
    });
    expect(result.ok && statOf(result.block, "combat", "hp")).toMatchObject({ value: 12, max: 12 });
    result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "hp", {
      value: -3,
    });
    expect(result.ok && statOf(result.block, "combat", "hp")).toMatchObject({ value: 0, min: 0 });

    result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "mana", {
      value: 7,
      min: 2,
      max: 5,
    });
    expect(result.ok && statOf(result.block, "combat", "mana")).toMatchObject({
      value: 5,
      min: 2,
      max: 5,
    });
    result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "mana", {
      value: 1,
    });
    expect(result.ok && statOf(result.block, "combat", "mana")).toMatchObject({
      value: 2,
      min: 2,
      max: 5,
    });

    result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "rage", {
      value: -1,
    });
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({
      value: 0,
      max: null,
    });
    result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "rage", {
      value: 9,
      max: 3,
    });
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({ value: 3, max: 3 });
    result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "rage", {
      value: 9,
    });
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({ value: 3, max: 3 });
  });

  it("moves a rack only onto one of its entries", async () => {
    let result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "die", {
      value: "d8",
    });
    expect(result.ok && statOf(result.block, "combat", "die")).toMatchObject({
      value: "d8",
      rackIndex: 2,
    });
    result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "die", {
      value: "d20",
    });
    expect(result.ok && statOf(result.block, "combat", "die")).toMatchObject({ value: "d8" });
  });

  it("refuses a computed stat, and a system with no stats", async () => {
    expect(
      await actions.sa_setElementStat(myStory, idElement, idSystem, "stats", "mod", { value: 1 }),
    ).toEqual({
      ok: false,
      error: "That stat is not one that can be set.",
    });
    expect(
      await actions.sa_setElementStat(myStory, idElement, 2147483647, "stats", "str", { value: 1 }),
    ).toEqual({
      ok: false,
      error: "That system has no stats to fill in.",
    });
  });

  it("changes one row's stat by its key and leaves the other rows and groups alone", async () => {
    const current = (await stored()) as StatBlocks;
    await db
      .update(tables.elements)
      .set({
        statBlocks: {
          ...current,
          [idSystem]: {
            ...current[idSystem],
            attack: [
              { weapon: { value: "Sword" }, strike: { value: 4 }, uses: { value: 2, min: 0 } },
              { weapon: { value: "Fist" }, strike: { value: 1 }, uses: { value: 0, min: 0 } },
            ],
          },
        },
      })
      .where(eq(tables.elements.idElement, idElement));

    const result = await actions.sa_setElementStat(
      myStory,
      idElement,
      idSystem,
      "attack",
      "uses",
      { value: 9 },
      "Sword",
    );
    expect(result.ok).toBe(true);
    const block = (result as { ok: true; block: ElementStatBlock }).block;
    expect(rowsOf(block, "attack").map((row) => row.key)).toEqual(["Sword", "Fist"]);
    // Clamped to the row's own strike.
    expect(rowStatOf(block, "attack", "Sword", "uses")).toMatchObject({ value: 4, max: 4 });
    expect(rowStatOf(block, "attack", "Fist", "uses").value).toBe(0);
    expect(statOf(block, "stats", "str").value).toBe(12);
    const rows = ((await stored()) as StatBlocks)[idSystem].attack as StatRow[];
    expect(rows[1]).toEqual({
      weapon: { value: "Fist" },
      strike: { value: 1 },
      uses: { value: 0, min: 0 },
    });
    expect(((await stored()) as StatBlocks)[idSystem].stats).toEqual({ str: { value: 12 } });
  });

  it("refuses a change to a row that is no longer there, changing nothing", async () => {
    const before = await stored();
    expect(
      await actions.sa_setElementStat(
        myStory,
        idElement,
        idSystem,
        "attack",
        "uses",
        { value: 1 },
        "Axe",
      ),
    ).toEqual({ ok: false, error: "That Attack is no longer there." });
    expect(await stored()).toEqual(before);
  });

  it("replaces a row array left under a plain group rather than appending to it", async () => {
    // The group was made plain again after rows were stored on this element.
    const current = (await stored()) as StatBlocks;
    await db
      .update(tables.elements)
      .set({
        statBlocks: {
          ...current,
          [idSystem]: { ...current[idSystem], combat: [{ mana: { value: 1, min: 0, max: 5 } }] },
        },
      })
      .where(eq(tables.elements.idElement, idElement));

    const result = await actions.sa_setElementStat(myStory, idElement, idSystem, "combat", "mana", {
      value: 2,
      max: 5,
    });
    expect(result.ok && statOf(result.block, "combat", "mana")).toMatchObject({ value: 2, max: 5 });
    expect(((await stored()) as StatBlocks)[idSystem].combat).toEqual({
      mana: { value: 2, min: 0, max: 5 },
    });
  });

  it("refuses a change to the key stat, and a row key on a plain group", async () => {
    const refused = { ok: false, error: "That stat is not one that can be set." };
    expect(
      await actions.sa_setElementStat(
        myStory,
        idElement,
        idSystem,
        "attack",
        "weapon",
        { value: "Axe" },
        "Sword",
      ),
    ).toEqual(refused);
    expect(
      await actions.sa_setElementStat(myStory, idElement, idSystem, "attack", "uses", { value: 1 }),
    ).toEqual(refused);
    expect(
      await actions.sa_setElementStat(
        myStory,
        idElement,
        idSystem,
        "stats",
        "str",
        { value: 1 },
        "Sword",
      ),
    ).toEqual(refused);
  });
});
