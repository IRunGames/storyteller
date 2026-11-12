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
let idStoryScene = 0;
let idSceneElement = 0;

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
          label: "Strength",
          type: "display",
          rack: [],
          connectedTo: "",
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
        },
        {
          name: "mod",
          label: "",
          type: "computed",
          rack: [],
          connectedTo: "",
          computedAs: "stats.str - 10",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
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
          connectedTo: "stats.str",
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
        },
        {
          name: "mana",
          label: "",
          type: "pool",
          rack: [],
          connectedTo: "",
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "1d6",
          global: true,
          upDown: true,
        },
        {
          name: "rage",
          label: "",
          type: "stack",
          rack: [],
          connectedTo: "",
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
        },
        {
          name: "die",
          label: "",
          type: "rack",
          rack: ["d4", "d6", "d8"],
          connectedTo: "",
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
        },
      ],
    },
    // Repeats by weapon, with a pool fed from its own row's strike.
    {
      name: "attack",
      label: "Attack",
      keyedBy: "weapon",
      rollAll: true,
      canHaveMultiples: true,
      stats: [
        {
          name: "weapon",
          label: "Weapon",
          type: "display",
          rack: [],
          connectedTo: "",
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
        },
        {
          name: "strike",
          label: "",
          type: "display",
          rack: [],
          connectedTo: "",
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
        },
        {
          name: "uses",
          label: "",
          type: "pool",
          rack: [],
          connectedTo: "strike",
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "1d6",
          global: true,
          upDown: true,
        },
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

async function storedOnLink(): Promise<unknown> {
  const [row] = await db
    .select({ statBlocks: tables.sceneElements.statBlocks })
    .from(tables.sceneElements)
    .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
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

    // A scene of mine with the orc linked as a link made before links held
    // blocks: its stat_blocks is the column's default.
    const [scene] = await db
      .insert(tables.storyScenes)
      .values({
        idStory: myStory,
        sceneTitle: "Fixture stat block scene",
        idCreatedByUser: testUser,
      })
      .returning({ idStoryScene: tables.storyScenes.idStoryScene });
    idStoryScene = scene.idStoryScene;
    const [link] = await db
      .insert(tables.sceneElements)
      .values({ idStoryScene, idElement, idCreatedByUser: testUser })
      .returning({ idSceneElement: tables.sceneElements.idSceneElement });
    idSceneElement = link.idSceneElement;
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

  it("shows the story's system with nothing stored for an element with no block yet", async () => {
    const blocks = await actions.sa_getStatBlocks({ idStory: myStory, idElement });
    expect(blocks).toHaveLength(1);
    expect(blocks![0]).toMatchObject({ idSystem, stored: false });
    // Every template group is worked out, none with a value: the panel
    // draws only the carried ones and offers the rest.
    expect(blocks![0].groups.map((g) => g.name)).toEqual(["stats", "combat", "attack"]);
    expect(statOf(blocks![0], "combat", "rage")).toMatchObject({ stored: null });
    expect(statOf(blocks![0], "combat", "die")).toMatchObject({ stored: null });
  });

  it("reads a scene element linked before links held blocks as one with none, not as its element", async () => {
    await db
      .update(tables.elements)
      .set({ statBlocks: { [idSystem]: { stats: { str: { value: 14 } } } } })
      .where(eq(tables.elements.idElement, idElement));
    const blocks = await actions.sa_getStatBlocks({ idStory: myStory, idSceneElement });
    expect(blocks).toHaveLength(1);
    expect(blocks![0]).toMatchObject({ idSystem, stored: false });
    expect(statOf(blocks![0], "stats", "str")).toMatchObject({ value: null });
    await db
      .update(tables.elements)
      .set({ statBlocks: {} })
      .where(eq(tables.elements.idElement, idElement));
  });

  it("changes a scene element's copy and not its element, and tells the scene", async () => {
    const holder = { idStory: myStory, idSceneElement };
    const result = await actions.sa_setStat(holder, idSystem, "stats", "str", { value: 11 });
    expect(result.ok).toBe(true);
    expect(await storedOnLink()).toEqual({ [idSystem]: { stats: { str: { value: 11 } } } });
    expect(await stored()).toEqual({});
    // A row change goes the same way, through the link's own lock.
    await db
      .update(tables.sceneElements)
      .set({
        statBlocks: {
          [idSystem]: {
            attack: [
              { weapon: { value: "Axe" }, strike: { value: 3 }, uses: { value: 1, min: 0 } },
            ],
          },
        },
      })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    const row = await actions.sa_setStat(holder, idSystem, "attack", "uses", { value: 3 }, "Axe");
    expect(row.ok && rowStatOf(row.block, "attack", "Axe", "uses")).toMatchObject({ value: 3 });
    expect(await stored()).toEqual({});
  });

  it("rolls the first die of every row of a group marked Roll all, under the row's key", async () => {
    const holder = { idStory: myStory, idSceneElement };
    await db
      .update(tables.sceneElements)
      .set({
        statBlocks: {
          [idSystem]: {
            attack: [
              { weapon: { value: "Sword" }, strike: { value: 4 }, uses: { value: 1, min: 0 } },
              { weapon: { value: "Fist" }, strike: { value: 5 }, uses: { value: 3, min: 0 } },
            ],
          },
        },
      })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));

    // uses is the first stat in each row with a die: its 1d6 with the row's
    // value added. No session is being played, so nothing is said.
    const rolled = await actions.sa_rollGroupRows(holder, idSystem, "attack", {
      title: "A hooded figure",
      quiet: false,
    });
    expect(
      rolled.ok && rolled.rolls.map((r) => [r.title, r.roll.notation, r.roll.label, r.posted]),
    ).toEqual([
      ["A hooded figure (Sword)", "1d6+1", "for A hooded figure (Sword): uses", false],
      ["A hooded figure (Fist)", "1d6+3", "for A hooded figure (Fist): uses", false],
    ]);

    // With two of the group, each row is rolled twice, numbered.
    await db
      .update(tables.sceneElements)
      .set({
        statBlocks: {
          [idSystem]: {
            attack: [
              { weapon: { value: "Sword" }, strike: { value: 4 }, uses: { value: 1, min: 0 } },
            ],
            $multiples: { attack: { value: 2 } },
          },
        },
      })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    const twice = await actions.sa_rollGroupRows(holder, idSystem, "attack", {
      title: "A hooded figure",
      quiet: false,
    });
    expect(twice.ok && twice.rolls.map((r) => r.title)).toEqual([
      "A hooded figure (Sword) 1/2",
      "A hooded figure (Sword) 2/2",
    ]);
    // Only a repeating group marked for it is rolled this way.
    expect(
      await actions.sa_rollGroupRows(holder, idSystem, "combat", { title: "", quiet: true }),
    ).toEqual({ ok: false, error: "That group is not rolled all at once." });
  });

  it("rolls a stat's die with its value added, into the chat as the pill shows the element, or back to the storyteller", async () => {
    const holder = { idStory: myStory, idSceneElement };
    await db
      .update(tables.sceneElements)
      .set({ statBlocks: { [idSystem]: { combat: { mana: { value: 3, min: 0, max: 9 } } } } })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    const chatsOf = () =>
      db
        .select({ text: tables.chats.chatText })
        .from(tables.chats)
        .where(eq(tables.chats.idStory, myStory));

    // No session is being played, so there is no table to say it at: the
    // roll comes back for the storyteller alone.
    const unsaid = await actions.sa_rollStat(holder, idSystem, "combat", "mana", {
      title: "A hooded figure",
      quiet: false,
    });
    expect(unsaid.ok && unsaid.posted).toBe(false);
    expect(unsaid.ok && unsaid.roll).toMatchObject({
      notation: "1d6+3",
      label: "for A hooded figure: mana",
    });
    expect(unsaid.ok && unsaid.roll.total).toBeGreaterThanOrEqual(4);
    expect(unsaid.ok && unsaid.roll.total).toBeLessThanOrEqual(9);
    expect(await chatsOf()).toEqual([]);

    // A session at the table: the roll is said in its chat, a quiet one not.
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: myStory, status: "OPEN", idStoryScene, idCreatedByUser: testUser })
      .returning({ idStorySession: tables.storySessions.idStorySession });
    await db
      .update(tables.stories)
      .set({ idStorySession: session.idStorySession })
      .where(eq(tables.stories.idStory, myStory));
    try {
      const said = await actions.sa_rollStat(holder, idSystem, "combat", "mana", {
        title: "A hooded figure",
        quiet: false,
      });
      expect(said.ok && said.posted).toBe(true);
      const lines = await chatsOf();
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toMatch(/^\d+ for A hooded figure: mana$/);
      const quiet = await actions.sa_rollStat(holder, idSystem, "combat", "mana", {
        title: "A hooded figure",
        quiet: true,
      });
      expect(quiet.ok && quiet.posted).toBe(false);
      expect(await chatsOf()).toHaveLength(1);
      // A stat with no die has nothing to roll; another's story is not rolled at all.
      expect(
        await actions.sa_rollStat(holder, idSystem, "stats", "str", { title: "", quiet: true }),
      ).toEqual({ ok: false, error: "There is nothing to roll." });
      expect(
        (
          await actions.sa_rollStat(
            { idStory: theirStory, idSceneElement },
            idSystem,
            "combat",
            "mana",
            {
              title: "",
              quiet: true,
            },
          )
        ).ok,
      ).toBe(false);
    } finally {
      await db.delete(tables.chats).where(eq(tables.chats.idStory, myStory));
      await db
        .update(tables.stories)
        .set({ idStorySession: null })
        .where(eq(tables.stories.idStory, myStory));
      await db
        .delete(tables.storySessions)
        .where(eq(tables.storySessions.idStorySession, session.idStorySession));
      await db
        .update(tables.sceneElements)
        .set({ statBlocks: {} })
        .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    }
  });

  it("lists the scene's elements with blocks for the stats pane, and rolls a global stat for all of them", async () => {
    // A second person in the scene, invisible, with more mana; the orc's
    // link has the same block. Both are the pane's rows, by name.
    const [hooded] = await db
      .insert(tables.elements)
      .values({
        idStory: myStory,
        kind: "PERSON",
        name: "Fixture Hooded",
        title: "A hooded figure",
        idCreatedByUser: testUser,
      })
      .returning({ idElement: tables.elements.idElement });
    const [hiddenLink] = await db
      .insert(tables.sceneElements)
      .values({
        idStoryScene,
        idElement: hooded.idElement,
        status: "INVISIBLE",
        elementShowing: "title",
        statBlocks: { [idSystem]: { combat: { mana: { value: 5, min: 0, max: 9 } } } },
        idCreatedByUser: testUser,
      })
      .returning({ idSceneElement: tables.sceneElements.idSceneElement });
    await db
      .update(tables.sceneElements)
      .set({ statBlocks: { [idSystem]: { combat: { mana: { value: 3, min: 0, max: 9 } } } } })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    const chatsOf = () =>
      db
        .select({ text: tables.chats.chatText })
        .from(tables.chats)
        .where(eq(tables.chats.idStory, myStory));

    try {
      const listed = await actions.sa_getSceneStatBlocks(myStory, idStoryScene);
      expect(listed).toHaveLength(2);
      expect(listed![0]).toMatchObject({
        idSceneElement: hiddenLink.idSceneElement,
        idElement: hooded.idElement,
        title: "A hooded figure",
        hidden: true,
      });
      expect(listed![1]).toMatchObject({
        idSceneElement,
        idElement,
        title: "Fixture Orc",
        hidden: false,
      });
      expect(statOf(listed![1].blocks[0], "combat", "mana")).toMatchObject({
        value: 3,
        global: true,
        upDown: true,
      });
      // Another's story, or a scene that is not the story's, lists nothing.
      expect(await actions.sa_getSceneStatBlocks(theirStory, idStoryScene)).toBeNull();
      expect(await actions.sa_getSceneStatBlocks(myStory, -1)).toBeNull();

      // No session is being played: both rolls come back, neither said.
      const unsaid = await actions.sa_rollStatForAll(
        myStory,
        idStoryScene,
        idSystem,
        "combat",
        "mana",
      );
      expect(unsaid.ok && unsaid.rolls.map((r) => [r.title, r.roll.notation, r.posted])).toEqual([
        ["A hooded figure", "1d6+5", false],
        ["Fixture Orc", "1d6+3", false],
      ]);
      expect(await chatsOf()).toEqual([]);

      // A session at the table: the orc's roll is said, the invisible figure's is not.
      const [session] = await db
        .insert(tables.storySessions)
        .values({ idStory: myStory, status: "OPEN", idStoryScene, idCreatedByUser: testUser })
        .returning({ idStorySession: tables.storySessions.idStorySession });
      await db
        .update(tables.stories)
        .set({ idStorySession: session.idStorySession })
        .where(eq(tables.stories.idStory, myStory));
      try {
        const said = await actions.sa_rollStatForAll(
          myStory,
          idStoryScene,
          idSystem,
          "combat",
          "mana",
        );
        expect(said.ok && said.rolls.map((r) => r.posted)).toEqual([false, true]);
        const lines = await chatsOf();
        expect(lines).toHaveLength(1);
        expect(lines[0].text).toMatch(/^\d+ for Fixture Orc: mana$/);
      } finally {
        await db.delete(tables.chats).where(eq(tables.chats.idStory, myStory));
        await db
          .update(tables.stories)
          .set({ idStorySession: null })
          .where(eq(tables.stories.idStory, myStory));
        await db
          .delete(tables.storySessions)
          .where(eq(tables.storySessions.idStorySession, session.idStorySession));
      }

      // Only a global stat is rolled for all; another's story is not rolled.
      expect(
        await actions.sa_rollStatForAll(myStory, idStoryScene, idSystem, "combat", "rage"),
      ).toEqual({
        ok: false,
        error: "That stat is not rolled for all.",
      });
      expect(
        (await actions.sa_rollStatForAll(theirStory, idStoryScene, idSystem, "combat", "mana")).ok,
      ).toBe(false);
    } finally {
      await db
        .delete(tables.sceneElements)
        .where(eq(tables.sceneElements.idSceneElement, hiddenLink.idSceneElement));
      await db.delete(tables.elements).where(eq(tables.elements.idElement, hooded.idElement));
      await db
        .update(tables.sceneElements)
        .set({ statBlocks: {} })
        .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    }
  });

  it("copies a scene element's block back over the element's own, one system at a time", async () => {
    const holder = { idStory: myStory, idSceneElement };
    const played = { [idSystem]: { combat: { mana: { value: 1, min: 0, max: 9 } } } };
    // The element has a block of another system too, which the copy leaves.
    const other = { "-999": { stats: { str: { value: 3 } } } };
    await db
      .update(tables.sceneElements)
      .set({ statBlocks: played })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    await db
      .update(tables.elements)
      .set({ statBlocks: { [idSystem]: { stats: { str: { value: 14 } } }, ...other } })
      .where(eq(tables.elements.idElement, idElement));
    try {
      expect(await actions.sa_copyStatBlocksToElement(holder, idSystem)).toEqual({ ok: true });
      expect(await stored()).toEqual({ ...played, ...other });
      // An element holder has nothing to copy back; another's story is refused.
      expect(
        (await actions.sa_copyStatBlocksToElement({ idStory: myStory, idElement }, idSystem)).ok,
      ).toBe(false);
      expect(
        (
          await actions.sa_copyStatBlocksToElement(
            { idStory: theirStory, idSceneElement },
            idSystem,
          )
        ).ok,
      ).toBe(false);
    } finally {
      await db
        .update(tables.sceneElements)
        .set({ statBlocks: {} })
        .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
      await db
        .update(tables.elements)
        .set({ statBlocks: {} })
        .where(eq(tables.elements.idElement, idElement));
    }
  });

  it("copies the element's blocks over a scene element's, whole", async () => {
    const holder = { idStory: myStory, idSceneElement };
    const baseline = { [idSystem]: { combat: { mana: { value: 9, min: 0, max: 9 } } } };
    await db
      .update(tables.elements)
      .set({ statBlocks: baseline })
      .where(eq(tables.elements.idElement, idElement));
    await db
      .update(tables.sceneElements)
      .set({ statBlocks: { [idSystem]: { combat: { mana: { value: 2, min: 0, max: 9 } } } } })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    try {
      const copied = await actions.sa_copyStatBlocksFromElement(holder);
      expect(copied.ok).toBe(true);
      expect(copied.ok && statOf(copied.blocks[0], "combat", "mana")).toMatchObject({ value: 9 });
      expect(await storedOnLink()).toEqual(baseline);
      // An element holder has no copy to overwrite; another's story is refused.
      expect((await actions.sa_copyStatBlocksFromElement({ idStory: myStory, idElement })).ok).toBe(
        false,
      );
      expect(
        (await actions.sa_copyStatBlocksFromElement({ idStory: theirStory, idSceneElement })).ok,
      ).toBe(false);
    } finally {
      await db
        .update(tables.sceneElements)
        .set({ statBlocks: {} })
        .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
      await db
        .update(tables.elements)
        .set({ statBlocks: {} })
        .where(eq(tables.elements.idElement, idElement));
    }
  });

  it("makes a row the default by moving it first, which Roll for all rolls alone", async () => {
    const holder = { idStory: myStory, idSceneElement };
    await db
      .update(tables.sceneElements)
      .set({
        statBlocks: {
          [idSystem]: {
            attack: [
              { weapon: { value: "Axe" }, strike: { value: 3 }, uses: { value: 1, min: 0 } },
              { weapon: { value: "Bow" }, strike: { value: 5 }, uses: { value: 2, min: 0 } },
            ],
          },
        },
      })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    try {
      const moved = await actions.sa_setDefaultRow(holder, idSystem, "attack", "Bow");
      expect(moved.ok && rowsOf(moved.block, "attack").map((row) => row.key)).toEqual([
        "Bow",
        "Axe",
      ]);
      expect(
        (await storedOnLink()) as { [k: string]: { attack: { weapon: { value: string } }[] } },
      ).toMatchObject({
        [idSystem]: { attack: [{ weapon: { value: "Bow" } }, { weapon: { value: "Axe" } }] },
      });
      // Only the default row is rolled for all, named with its key.
      const rolled = await actions.sa_rollStatForAll(
        myStory,
        idStoryScene,
        idSystem,
        "attack",
        "uses",
      );
      expect(rolled.ok && rolled.rolls.map((r) => [r.title, r.roll.notation])).toEqual([
        ["Fixture Orc (Bow)", "1d6+2"],
      ]);
      // A row that is gone, and a group that does not repeat, are refused.
      expect(await actions.sa_setDefaultRow(holder, idSystem, "attack", "Club")).toEqual({
        ok: false,
        error: "That Attack is no longer there.",
      });
      expect((await actions.sa_setDefaultRow(holder, idSystem, "combat", "Axe")).ok).toBe(false);
    } finally {
      await db
        .update(tables.sceneElements)
        .set({ statBlocks: {} })
        .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    }
  });

  it("picks a stat block for a holder and takes it off again, leaving the others", async () => {
    const holder = { idStory: myStory, idSceneElement };
    await db
      .update(tables.sceneElements)
      .set({ statBlocks: {} })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));

    let result = await actions.sa_addStatBlock(holder, idSystem, "combat");
    expect(result.ok && result.block.stored).toBe(true);
    expect(await storedOnLink()).toEqual({
      [idSystem]: {
        combat: {
          hp: { value: 0, min: 0 },
          mana: { value: 0, min: 0, max: 0 },
          rage: { value: 0 },
          die: { value: "d4" },
        },
      },
    });
    result = await actions.sa_addStatBlock(holder, idSystem, "attack");
    expect(result.ok).toBe(true);
    // Picking a block again changes nothing it holds.
    await actions.sa_setStat(holder, idSystem, "combat", "rage", { value: 2 });
    result = await actions.sa_addStatBlock(holder, idSystem, "combat");
    expect(result.ok && statOf(result.block, "combat", "rage").value).toBe(2);
    // jsonb keeps keys in its own order, so compared sorted.
    expect(Object.keys(((await storedOnLink()) as StatBlocks)[idSystem]).sort()).toEqual([
      "attack",
      "combat",
    ]);

    result = await actions.sa_removeStatBlock(holder, idSystem, "combat");
    expect(result.ok).toBe(true);
    expect(await storedOnLink()).toEqual({ [idSystem]: { attack: [] } });
    expect(await actions.sa_addStatBlock(holder, idSystem, "nothing")).toEqual({
      ok: false,
      error: "That stat block is not in the template.",
    });
    // The element's own, through the other holder.
    const own = { idStory: myStory, idElement };
    result = await actions.sa_addStatBlock(own, idSystem, "stats");
    expect(result.ok).toBe(true);
    expect(await stored()).toEqual({ [idSystem]: { stats: { str: { value: 0 } } } });
    result = await actions.sa_removeStatBlock(own, idSystem, "stats");
    expect(await stored()).toEqual({ [idSystem]: {} });
    await db
      .update(tables.elements)
      .set({ statBlocks: {} })
      .where(eq(tables.elements.idElement, idElement));
  });

  it("sets a holder's blocks whole from the panel's form, refusing what the definition refuses", async () => {
    const holder = { idStory: myStory, idSceneElement };
    const refused = await actions.sa_setStatBlocks(holder, {
      [idSystem]: {
        stats: { str: { value: "strong" } },
        combat: {
          // hp's max is fed by stats.str, so a word there is dropped; mana's is its own.
          hp: { value: "9", min: "", max: "x" },
          mana: { value: 1, min: 0, max: "x" },
          rage: { value: 0 },
          die: { value: "d6" },
        },
      },
    });
    expect(refused).toEqual({
      ok: false,
      errors: { [`statBlocks.${idSystem}.combat.mana.max`]: "Enter a number." },
    });
    const ok = await actions.sa_setStatBlocks(holder, {
      [idSystem]: { stats: { str: { value: "14" } } },
    });
    expect(ok.ok).toBe(true);
    expect(ok.ok && statOf(ok.blocks[0], "stats", "str").value).toBe(14);
    expect(ok.ok && ok.blocks[0].carried).toEqual(["stats"]);
    expect(await storedOnLink()).toEqual({ [idSystem]: { stats: { str: { value: 14 } } } });
    expect(await actions.sa_setStatBlocks({ idStory: theirStory, idSceneElement }, {})).toEqual({
      ok: false,
      errors: { root: "That element is not one of your story's." },
    });
    expect(
      await actions.sa_setStatBlocks({ idStory: myStory, idSceneElement: 2 ** 30 }, {}),
    ).toEqual({
      ok: false,
      errors: { root: "That element is not one of your story's." },
    });
  });

  it("answers null for a story that is not the caller's, and an element that is not the story's", async () => {
    expect(
      await actions.sa_getStatBlocks({ idStory: theirStory, idElement: theirElement }),
    ).toBeNull();
    expect(
      await actions.sa_getStatBlocks({ idStory: myStory, idElement: theirElement }),
    ).toBeNull();
    expect(await actions.sa_getStatBlocks({ idStory: theirStory, idSceneElement })).toBeNull();
    expect(
      await actions.sa_setStat({ idStory: theirStory, idSceneElement }, idSystem, "stats", "str", {
        value: 1,
      }),
    ).toEqual({ ok: false, error: "That element is not one of your story's." });
    expect(
      await actions.sa_setStat(
        { idStory: myStory, idElement: theirElement },
        idSystem,
        "stats",
        "str",
        {
          value: 1,
        },
      ),
    ).toEqual({
      ok: false,
      error: "That element is not one of your story's.",
    });
  });

  it("makes the block on the first change, and keeps every other stat on the next", async () => {
    const first = await actions.sa_setStat(
      { idStory: myStory, idElement },
      idSystem,
      "stats",
      "str",
      {
        value: 12,
      },
    );
    expect(first.ok).toBe(true);
    expect(await stored()).toEqual({ [idSystem]: { stats: { str: { value: 12 } } } });

    const second = await actions.sa_setStat(
      { idStory: myStory, idElement },
      idSystem,
      "combat",
      "hp",
      {
        value: 5,
      },
    );
    expect(second.ok && second.block.stored).toBe(true);
    expect(await stored()).toEqual({
      [idSystem]: { stats: { str: { value: 12 } }, combat: { hp: { value: 5, min: 0 } } },
    });
    expect(second.ok && statOf(second.block, "stats", "mod").value).toBe(2);
  });

  it("clamps a pool to the max that feeds it and to its min, and a stack to 0 and its max", async () => {
    // hp's max is Strength, 12.
    let result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      idSystem,
      "combat",
      "hp",
      {
        value: 20,
      },
    );
    expect(result.ok && statOf(result.block, "combat", "hp")).toMatchObject({ value: 12, max: 12 });
    result = await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "combat", "hp", {
      value: -3,
    });
    expect(result.ok && statOf(result.block, "combat", "hp")).toMatchObject({ value: 0, min: 0 });

    result = await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "combat", "mana", {
      value: 7,
      min: 2,
      max: 5,
    });
    expect(result.ok && statOf(result.block, "combat", "mana")).toMatchObject({
      value: 5,
      min: 2,
      max: 5,
    });
    result = await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "combat", "mana", {
      value: 1,
    });
    expect(result.ok && statOf(result.block, "combat", "mana")).toMatchObject({
      value: 2,
      min: 2,
      max: 5,
    });

    result = await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "combat", "rage", {
      value: -1,
    });
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({
      value: 0,
      max: null,
    });
    result = await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "combat", "rage", {
      value: 9,
      max: 3,
    });
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({ value: 3, max: 3 });
    result = await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "combat", "rage", {
      value: 9,
    });
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({ value: 3, max: 3 });
  });

  it("moves a rack only onto one of its entries", async () => {
    let result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      idSystem,
      "combat",
      "die",
      {
        value: "d8",
      },
    );
    expect(result.ok && statOf(result.block, "combat", "die")).toMatchObject({
      value: "d8",
      rackIndex: 2,
    });
    result = await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "combat", "die", {
      value: "d20",
    });
    expect(result.ok && statOf(result.block, "combat", "die")).toMatchObject({ value: "d8" });
  });

  it("refuses a computed stat, and a system with no stats", async () => {
    expect(
      await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "stats", "mod", {
        value: 1,
      }),
    ).toEqual({
      ok: false,
      error: "That stat is not one that can be set.",
    });
    expect(
      await actions.sa_setStat({ idStory: myStory, idElement }, 2147483647, "stats", "str", {
        value: 1,
      }),
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

    const result = await actions.sa_setStat(
      { idStory: myStory, idElement },
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
      await actions.sa_setStat(
        { idStory: myStory, idElement },
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

    const result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      idSystem,
      "combat",
      "mana",
      {
        value: 2,
        max: 5,
      },
    );
    expect(result.ok && statOf(result.block, "combat", "mana")).toMatchObject({ value: 2, max: 5 });
    expect(((await stored()) as StatBlocks)[idSystem].combat).toEqual({
      mana: { value: 2, min: 0, max: 5 },
    });
  });

  it("refuses a change to the key stat, and a row key on a plain group", async () => {
    const refused = { ok: false, error: "That stat is not one that can be set." };
    expect(
      await actions.sa_setStat(
        { idStory: myStory, idElement },
        idSystem,
        "attack",
        "weapon",
        { value: "Axe" },
        "Sword",
      ),
    ).toEqual(refused);
    expect(
      await actions.sa_setStat({ idStory: myStory, idElement }, idSystem, "attack", "uses", {
        value: 1,
      }),
    ).toEqual(refused);
    expect(
      await actions.sa_setStat(
        { idStory: myStory, idElement },
        idSystem,
        "stats",
        "str",
        { value: 1 },
        "Sword",
      ),
    ).toEqual(refused);
  });
});
