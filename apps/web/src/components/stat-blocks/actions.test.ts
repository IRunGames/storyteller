// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The table's reads and changes
// of an element's stat blocks: a system of this file's own with every stat
// type, a story run in it, an element with no block yet, and a story of
// someone else's, all removed in `after`.
import { after, before, it, mock } from "node:test";
import { expect } from "expect";
import { SCENE_LOCKED_STATUS } from "@/lib/status";
import { eq, inArray } from "drizzle-orm";

import type { StatBlockDefinition, StatBlocks, StatRow } from "@/lib/stat-blocks";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";

const TEST_USER_EMAIL = "stat-blocks-actions@example.test";
const OTHER_EMAIL = "stat-blocks-actions-other@example.test";
let testUser = "";

// What the actions tell the players' table, by which helper they reached
// for; what the helpers send is their own test's business. Mocked so a test
// can see a change announced by the right ids.
const published = {
  publishElementChanged: mock.fn(async (..._args: unknown[]) => {}),
  publishSceneElement: mock.fn(async (..._args: unknown[]) => {}),
};

let actions: typeof import("./actions");
type ElementStatBlock = import("./actions").ElementStatBlock;

let db: Db;
let tables: Tables;

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
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
          leftRight: false,
          initialRoll: "",
          initialFrom: "",
        },
        {
          name: "mod",
          label: "",
          type: "computed",
          rack: [],
          computedAs: "stats.str - 10",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
          leftRight: false,
          initialRoll: "",
          initialFrom: "",
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
          leftRight: false,
          initialRoll: "",
          initialFrom: "",
        },
        {
          name: "mana",
          label: "",
          type: "pool",
          rack: [],
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "1d6",
          global: true,
          upDown: true,
          leftRight: false,
          initialRoll: "",
          initialFrom: "",
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
          leftRight: false,
          initialRoll: "",
          initialFrom: "",
        },
        {
          name: "die",
          label: "",
          type: "rack",
          rack: ["d4", "d6", "d8"],
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
          leftRight: true,
          initialRoll: "",
          initialFrom: "",
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
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
          leftRight: false,
          initialRoll: "",
          initialFrom: "",
        },
        {
          name: "strike",
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
          leftRight: false,
          initialRoll: "",
          initialFrom: "",
        },
        {
          name: "uses",
          label: "",
          type: "pool",
          rack: [],
          computedAs: "",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "1d6",
          global: true,
          upDown: true,
          leftRight: false,
          initialRoll: "",
          initialFrom: "",
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

/** Empties the stat blocks of this file's own element and link, and of no other row. */
async function clearFixtureBlocks(): Promise<void> {
  await db
    .update(tables.elements)
    .set({ statBlocks: {} })
    .where(eq(tables.elements.idElement, idElement));
  await db
    .update(tables.sceneElements)
    .set({ statBlocks: {} })
    .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
}

const statOf = (block: ElementStatBlock, group: string, name: string) =>
  block.groups.find((g) => g.name === group)!.stats.find((s) => s.name === name)!;
const rowsOf = (block: ElementStatBlock, group: string) =>
  block.groups.find((g) => g.name === group)!.rows;
const rowStatOf = (block: ElementStatBlock, group: string, key: string, name: string) =>
  rowsOf(block, group)
    .find((row) => row.key === key)!
    .stats.find((s) => s.name === name)!;

describeWithDb("stat block actions", { email: TEST_USER_EMAIL }, (suite) => {
  before(async () => {
    mock.module("@/lib/realtime/publish-scene", { namedExports: published });
    ({ db, tables } = suite);
    testUser = suite.testUser;
    otherUserId = await suite.makeUser(OTHER_EMAIL);
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

  it("reads and checks a story's own copy of its system's definition in the system's place", async () => {
    // The copy keeps only the stats group, under a new label and with a
    // stat the system's definition does not have.
    const stats = definition.groups[0];
    const copy: StatBlockDefinition = {
      groups: [
        {
          ...stats,
          label: "Attributes",
          stats: [...stats.stats, { ...stats.stats[0], name: "luck", label: "Luck" }],
        },
      ],
    };
    await db
      .update(tables.stories)
      .set({ statBlockDefinition: copy })
      .where(eq(tables.stories.idStory, myStory));
    try {
      const blocks = await actions.sa_getStatBlocks({ idStory: myStory, idElement });
      expect(blocks![0].groups.map((g) => [g.name, g.label])).toEqual([["stats", "Attributes"]]);
      // A stat only the copy has can be set; a group only the system has cannot.
      const set = await actions.sa_setStat(
        { idStory: myStory, idElement },
        { idSystem, group: "stats", stat: "luck", patch: { value: 3 } },
      );
      expect(set.ok && statOf(set.block, "stats", "luck")).toMatchObject({ value: 3 });
      expect(
        await actions.sa_setStat(
          { idStory: myStory, idElement },
          {
            idSystem,
            group: "combat",
            stat: "rage",
            patch: {
              value: 1,
            },
          },
        ),
      ).toMatchObject({ ok: false });
      // Another story of the same system still reads the system's.
      suite.getSession.mock.mockImplementation(async () => ({ user: { id: otherUserId } }));
      const theirs = await actions.sa_getStatBlocks({
        idStory: theirStory,
        idElement: theirElement,
      });
      expect(theirs![0].groups.map((g) => g.name)).toEqual(["stats", "combat", "attack"]);
    } finally {
      suite.getSession.mock.restore();
      await db
        .update(tables.stories)
        .set({ statBlockDefinition: null })
        .where(eq(tables.stories.idStory, myStory));
      await db
        .update(tables.elements)
        .set({ statBlocks: {} })
        .where(eq(tables.elements.idElement, idElement));
    }
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
    published.publishSceneElement.mock.resetCalls();
    const result = await actions.sa_setStat(holder, {
      idSystem,
      group: "stats",
      stat: "str",
      patch: { value: 11 },
    });
    expect(result.ok).toBe(true);
    expect(await storedOnLink()).toEqual({ [idSystem]: { stats: { str: { value: 11 } } } });
    expect(await stored()).toEqual({});
    // Sent by the link's own id, which is what the players' table draws a
    // pill by; an element may be in the scene more than once.
    expect(published.publishSceneElement.mock.calls.map((call) => call.arguments)).toEqual([
      [myStory, idStoryScene, idSceneElement],
    ]);
    // A row change goes the same way, through the link's own lock.
    await db
      .update(tables.sceneElements)
      .set({
        statBlocks: {
          [idSystem]: {
            attack: [
              {
                weapon: { value: "Axe" },
                strike: { value: 3 },
                uses: { value: 1, min: 0, max: 5 },
              },
            ],
          },
        },
      })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    const row = await actions.sa_setStat(holder, {
      idSystem,
      group: "attack",
      stat: "uses",
      patch: { value: 3 },
      rowKey: "Axe",
    });
    expect(row.ok && rowStatOf(row.block, "attack", "Axe", "uses")).toMatchObject({ value: 3 });
    expect(await stored()).toEqual({});
  });

  it("changes a scene element's stats in a complete scene too", async () => {
    // The storyteller keeps the stats of a finished scene's creatures up to
    // date after the fact, so this write sets the scene's lock aside where
    // the status pill and the pictures refuse it.
    const holder = { idStory: myStory, idSceneElement };
    await db
      .update(tables.sceneElements)
      .set({ statBlocks: {} })
      .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    await db
      .update(tables.storyScenes)
      .set({ status: SCENE_LOCKED_STATUS })
      .where(eq(tables.storyScenes.idStoryScene, idStoryScene));
    try {
      const result = await actions.sa_setStat(holder, {
        idSystem,
        group: "stats",
        stat: "str",
        patch: { value: 12 },
      });
      expect(result.ok).toBe(true);
      expect(await storedOnLink()).toEqual({ [idSystem]: { stats: { str: { value: 12 } } } });
    } finally {
      await db
        .update(tables.storyScenes)
        .set({ status: "PENDING" })
        .where(eq(tables.storyScenes.idStoryScene, idStoryScene));
      await db
        .update(tables.sceneElements)
        .set({ statBlocks: {} })
        .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
    }
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

    // A row the element has two of is rolled twice, numbered.
    await db
      .update(tables.sceneElements)
      .set({
        statBlocks: {
          [idSystem]: {
            attack: [
              {
                weapon: { value: "Sword" },
                strike: { value: 4 },
                uses: { value: 1, min: 0 },
                $multiple: { value: 2 },
              },
            ],
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
    const unsaid = await actions.sa_rollStat(holder, {
      idSystem,
      group: "combat",
      stat: "mana",
      as: {
        title: "A hooded figure",
        quiet: false,
      },
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
      const said = await actions.sa_rollStat(holder, {
        idSystem,
        group: "combat",
        stat: "mana",
        as: {
          title: "A hooded figure",
          quiet: false,
        },
      });
      expect(said.ok && said.posted).toBe(true);
      const lines = await chatsOf();
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toMatch(/^\d+ for A hooded figure: mana$/);
      const quiet = await actions.sa_rollStat(holder, {
        idSystem,
        group: "combat",
        stat: "mana",
        as: {
          title: "A hooded figure",
          quiet: true,
        },
      });
      expect(quiet.ok && quiet.posted).toBe(false);
      expect(await chatsOf()).toHaveLength(1);
      // A stat with no die has nothing to roll; another's story is not rolled at all.
      expect(
        await actions.sa_rollStat(holder, {
          idSystem,
          group: "stats",
          stat: "str",
          as: { title: "", quiet: true },
        }),
      ).toEqual({ ok: false, error: "There is nothing to roll." });
      expect(
        (
          await actions.sa_rollStat(
            { idStory: theirStory, idSceneElement },
            {
              idSystem,
              group: "combat",
              stat: "mana",
              as: {
                title: "",
                quiet: true,
              },
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
        leftRight: false,
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

  it("sets a holder's blocks whole from the panel's form, refusing what the definition refuses", async () => {
    const holder = { idStory: myStory, idSceneElement };
    const refused = await actions.sa_setStatBlocks(holder, {
      [idSystem]: {
        stats: { str: { value: "strong" } },
        combat: {
          hp: { value: "9", min: "", max: "20" },
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
    // The fixture element had none of its own, so the save gave it these
    // too; the tests after this one start from the fixture element and its
    // link with none. Only this file's own rows, named by id.
    await clearFixtureBlocks();
  });

  it("gives an element with no stat blocks the ones first saved on its scene element, and leaves one with its own alone", async () => {
    const holder = { idStory: myStory, idSceneElement };
    await clearFixtureBlocks();
    try {
      // The panel says the element has no block to lose before the save.
      const before = await actions.sa_getStatBlocks(holder);
      expect(before![0].onElement).toBe(false);

      const first = await actions.sa_setStatBlocks(holder, {
        [idSystem]: { stats: { str: { value: "14" } } },
      });
      expect(first).toMatchObject({ ok: true, copiedToElement: true });
      const seeded = { [idSystem]: { stats: { str: { value: 14 } } } };
      expect(await storedOnLink()).toEqual(seeded);
      expect(await stored()).toEqual(seeded);
      expect(first.ok && first.blocks[0].onElement).toBe(true);

      // The element has its own now, so the next save is the link's alone.
      const next = await actions.sa_setStatBlocks(holder, {
        [idSystem]: { stats: { str: { value: "9" } } },
      });
      expect(next).toMatchObject({ ok: true, copiedToElement: false });
      expect(await storedOnLink()).toEqual({ [idSystem]: { stats: { str: { value: 9 } } } });
      expect(await stored()).toEqual(seeded);

      // An element's own save has no element to give to.
      const own = await actions.sa_setStatBlocks(
        { idStory: myStory, idElement },
        { [idSystem]: { stats: { str: { value: "15" } } } },
      );
      expect(own).toMatchObject({ ok: true, copiedToElement: false });
      expect(own.ok && own.blocks[0].onElement).toBeUndefined();
    } finally {
      await clearFixtureBlocks();
    }
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
      await actions.sa_setStat(
        { idStory: theirStory, idSceneElement },
        {
          idSystem,
          group: "stats",
          stat: "str",
          patch: {
            value: 1,
          },
        },
      ),
    ).toEqual({ ok: false, error: "That element is not one of your story's." });
    expect(
      await actions.sa_setStat(
        { idStory: myStory, idElement: theirElement },
        {
          idSystem,
          group: "stats",
          stat: "str",
          patch: {
            value: 1,
          },
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
      {
        idSystem,
        group: "stats",
        stat: "str",
        patch: {
          value: 12,
        },
      },
    );
    expect(first.ok).toBe(true);
    expect(await stored()).toEqual({ [idSystem]: { stats: { str: { value: 12 } } } });

    const second = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "hp",
        patch: {
          value: 5,
          max: 10,
        },
      },
    );
    expect(second.ok && second.block.stored).toBe(true);
    expect(await stored()).toEqual({
      [idSystem]: { stats: { str: { value: 12 } }, combat: { hp: { value: 5, min: 0, max: 10 } } },
    });
    expect(second.ok && statOf(second.block, "stats", "mod").value).toBe(2);
  });

  it("clamps a pool to its max and its min, and a stack to 0 and its max", async () => {
    let result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "hp",
        patch: {
          value: 20,
          max: 12,
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "hp")).toMatchObject({ value: 12, max: 12 });
    result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "hp",
        patch: {
          value: -3,
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "hp")).toMatchObject({ value: 0, min: 0 });

    result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "mana",
        patch: {
          value: 7,
          min: 2,
          max: 5,
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "mana")).toMatchObject({
      value: 5,
      min: 2,
      max: 5,
    });
    result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "mana",
        patch: {
          value: 1,
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "mana")).toMatchObject({
      value: 2,
      min: 2,
      max: 5,
    });

    result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "rage",
        patch: {
          value: -1,
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({
      value: 0,
      max: null,
    });
    result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "rage",
        patch: {
          value: 9,
          max: 3,
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({ value: 3, max: 3 });
    result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "rage",
        patch: {
          value: 9,
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "rage")).toMatchObject({ value: 3, max: 3 });
  });

  it("moves a rack only onto one of its entries", async () => {
    let result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "die",
        patch: {
          value: "d8",
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "die")).toMatchObject({
      value: "d8",
      rackIndex: 2,
    });
    result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      {
        idSystem,
        group: "combat",
        stat: "die",
        patch: {
          value: "d20",
        },
      },
    );
    expect(result.ok && statOf(result.block, "combat", "die")).toMatchObject({ value: "d8" });
  });

  it("refuses a computed stat, and a system with no stats", async () => {
    expect(
      await actions.sa_setStat(
        { idStory: myStory, idElement },
        {
          idSystem,
          group: "stats",
          stat: "mod",
          patch: {
            value: 1,
          },
        },
      ),
    ).toEqual({
      ok: false,
      error: "That stat is not one that can be set.",
    });
    expect(
      await actions.sa_setStat(
        { idStory: myStory, idElement },
        {
          idSystem: 2147483647,
          group: "stats",
          stat: "str",
          patch: {
            value: 1,
          },
        },
      ),
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
              {
                weapon: { value: "Sword" },
                strike: { value: 4 },
                uses: { value: 2, min: 0, max: 4 },
              },
              { weapon: { value: "Fist" }, strike: { value: 1 }, uses: { value: 0, min: 0 } },
            ],
          },
        },
      })
      .where(eq(tables.elements.idElement, idElement));

    const result = await actions.sa_setStat(
      { idStory: myStory, idElement },
      { idSystem, group: "attack", stat: "uses", patch: { value: 9 }, rowKey: "Sword" },
    );
    expect(result.ok).toBe(true);
    const block = (result as { ok: true; block: ElementStatBlock }).block;
    expect(rowsOf(block, "attack").map((row) => row.key)).toEqual(["Sword", "Fist"]);
    // Clamped to the row's own max.
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
        { idSystem, group: "attack", stat: "uses", patch: { value: 1 }, rowKey: "Axe" },
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
      {
        idSystem,
        group: "combat",
        stat: "mana",
        patch: {
          value: 2,
          max: 5,
        },
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
        { idSystem, group: "attack", stat: "weapon", patch: { value: "Axe" }, rowKey: "Sword" },
      ),
    ).toEqual(refused);
    expect(
      await actions.sa_setStat(
        { idStory: myStory, idElement },
        {
          idSystem,
          group: "attack",
          stat: "uses",
          patch: {
            value: 1,
          },
        },
      ),
    ).toEqual(refused);
    expect(
      await actions.sa_setStat(
        { idStory: myStory, idElement },
        { idSystem, group: "stats", stat: "str", patch: { value: 1 }, rowKey: "Sword" },
      ),
    ).toEqual(refused);
  });
});
