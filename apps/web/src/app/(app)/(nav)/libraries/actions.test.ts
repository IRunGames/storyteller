// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The Prep Work board's reads: a
// story's scenes, the search over story_scenes.search_text, and the count
// beside the column's heading.
//
// `before` makes its own story and scenes for the test user, plus a story
// belonging to someone else, and `after` deletes them. Fixture ids are
// positive and left to the database, so they cannot collide with the seed's
// negative ones. No status is written here by name: the scenes take the
// column default and any move is found in the workflow (src/test/workflow.ts).
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, inArray, sql } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

import { SCENE_LOCKED_STATUS, SCENES_PAGE_SIZE } from "@/lib/scenes";
import { transitionsFrom } from "@/lib/status";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "libraries-actions@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const MINE = "Fixture library — the test user's own story";
const THEIRS = "Fixture library — somebody else's story";

let otherUserId = "";
let myStory = 0;
let theirStory = 0;
let sceneIds: number[] = [];

// One more than a page, so paging has a short second page to end on.
const SCENE_COUNT = SCENES_PAGE_SIZE + 1;

// Next implements redirect() by throwing; the target rides in the digest.
async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  const thrown = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  const digest = (thrown as { digest?: string } | null)?.digest ?? "";
  return digest.startsWith("NEXT_REDIRECT") ? digest.split(";")[2] : null;
}

describe("libraries actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    actions = await import("./actions");

    const [otherUser] = await db
      .insert(tables.user)
      .values({
        name: "Fixture Library Other",
        nickName: "LibOther",
        email: "fixture-library-other@example.test",
      })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

    const stories = await db
      .insert(tables.stories)
      .values([
        { title: MINE, idCreatedByUser: testUser },
        { title: THEIRS, idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.stories.idStory, title: tables.stories.title });
    myStory = stories.find((row) => row.title === MINE)!.id;
    theirStory = stories.find((row) => row.title === THEIRS)!.id;

    // Numbered so the newest-first order is checkable, with one carrying a
    // word that appears nowhere else and one carrying it in its description
    // only, which is what shows the search reaching past the title.
    const scenes = await db
      .insert(tables.storyScenes)
      .values(
        Array.from({ length: SCENE_COUNT }, (_, index) => ({
          idStory: myStory,
          sceneTitle: `Fixture scene ${index + 1}`,
          sceneDescription:
            index === 0 ? "A brass orrery on the table." : `Nothing of note, ${index + 1}.`,
          idCreatedByUser: testUser,
        })),
      )
      .returning({ id: tables.storyScenes.idStoryScene });
    sceneIds = scenes.map((row) => row.id);

    // One on the other user's story, which must never come back.
    await db.insert(tables.storyScenes).values({
      idStory: theirStory,
      sceneTitle: "Fixture scene of theirs",
      idCreatedByUser: otherUserId,
    });

    // Elements: two people out of name order, a place, and one person on the
    // other user's story. Only the place carries the word "lantern", and only
    // in its notes, which the card never shows.
    await db.insert(tables.elements).values([
      { idStory: myStory, kind: "PERSON", name: "Fixture Zara", idCreatedByUser: testUser },
      {
        idStory: myStory,
        kind: "PERSON",
        name: "Fixture Aldric",
        title: "Magistrate",
        idCreatedByUser: testUser,
      },
      {
        idStory: myStory,
        kind: "PLACE",
        name: "Fixture vault",
        notes: "A lantern hangs by the door.",
        idCreatedByUser: testUser,
      },
      { idStory: theirStory, kind: "PERSON", name: "Fixture theirs", idCreatedByUser: otherUserId },
    ]);
  });

  after(async () => {
    if (!db) return;
    await db.delete(tables.elements).where(inArray(tables.elements.idStory, [myStory, theirStory]));
    await db
      .delete(tables.storyScenes)
      .where(inArray(tables.storyScenes.idStory, [myStory, theirStory]));
    await db.delete(tables.stories).where(inArray(tables.stories.idStory, [myStory, theirStory]));
    await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  it("lists a story's scenes newest first, ten at a time", async () => {
    const first = await actions.sa_listStoryScenes(myStory, 0);
    expect(first).toHaveLength(SCENES_PAGE_SIZE);
    // Inserted in one statement, so they share a created_at and the id breaks
    // the tie: the highest id, which is the last one inserted, comes first.
    expect(first[0].title).toBe(`Fixture scene ${SCENE_COUNT}`);
    expect(first.map((scene) => scene.idStoryScene)).toEqual(
      [...sceneIds].sort((a, b) => b - a).slice(0, SCENES_PAGE_SIZE),
    );

    const second = await actions.sa_listStoryScenes(myStory, SCENES_PAGE_SIZE);
    expect(second).toHaveLength(SCENE_COUNT - SCENES_PAGE_SIZE);
    expect(second[0].title).toBe("Fixture scene 1");
  });

  it("carries what the card shows, with the status the database gave the row", async () => {
    const [scene] = await actions.sa_listStoryScenes(myStory, 0);
    expect(Object.keys(scene).sort()).toEqual([
      "description",
      "idStoryScene",
      "idStorySession",
      "length",
      "sceneNumber",
      "sessionHeading",
      "sessionNumber",
      "status",
      "statusAt",
      "title",
    ]);
    // Not compared with a status by name: what matters is that the column
    // default is what a new scene holds, and that it is one of the workflow's.
    const workflow = await (
      await import("@/components/status/actions")
    ).sa_listStatusOptions("story_scenes");
    expect(workflow.map((option) => option.key)).toContain(scene.status);
    expect(scene.idStorySession).toBeNull();
    expect(scene.sessionHeading).toBeNull();
    expect(scene.sessionNumber).toBeNull();
    // A scene that has only just been made is not finished, so it has no
    // number among the finished scenes of its sitting.
    expect(scene.sceneNumber).toBeNull();
    // The workflow's trigger stamps the <status>_at column as a row is
    // created in that status, so a scene made a moment ago has a date.
    expect(scene.statusAt).toBeInstanceOf(Date);
  });

  it("searches the generated search_text, not the rows already loaded", async () => {
    // The word is in one description and no title, and that scene is the
    // oldest of the eleven, so a filter over the first page could not find it.
    const found = await actions.sa_listStoryScenes(myStory, 0, "orrery");
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe("Fixture scene 1");

    // Case blind, and a partial word matches.
    expect(await actions.sa_listStoryScenes(myStory, 0, "ORRE")).toHaveLength(1);
    // A blank query is every scene again.
    expect(await actions.sa_listStoryScenes(myStory, 0, "   ")).toHaveLength(SCENES_PAGE_SIZE);
    // And nothing matches nothing.
    expect(await actions.sa_listStoryScenes(myStory, 0, "kraken")).toEqual([]);
  });

  it("finds a scene by the status in its search text", async () => {
    const [scene] = await actions.sa_listStoryScenes(myStory, 0);
    // search_text is status, title and description joined by the database, so
    // the status the row holds is a search term like any other word in it.
    const found = await actions.sa_listStoryScenes(myStory, 0, scene.status);
    expect(found).toHaveLength(SCENES_PAGE_SIZE);
  });

  it("looks for what was typed when it looks like a pattern", async () => {
    // % and _ are ILIKE wildcards. Typed into the box they are characters,
    // and no scene holds either, so both find nothing rather than everything.
    expect(await actions.sa_listStoryScenes(myStory, 0, "%")).toEqual([]);
    expect(await actions.sa_listStoryScenes(myStory, 0, "_")).toEqual([]);
  });

  it("counts every scene the story has, whatever the search box holds", async () => {
    expect(await actions.sa_countStoryScenes(myStory)).toBe(SCENE_COUNT);
  });

  it("tells a visitor nothing about a story they do not own", async () => {
    expect(await actions.sa_listStoryScenes(theirStory, 0)).toEqual([]);
    expect(await actions.sa_countStoryScenes(theirStory)).toBe(0);
  });

  it("lists one kind of element at a time, by name", async () => {
    const people = await actions.sa_listStoryElements(myStory, "PERSON", 0);
    expect(people.map((element) => element.name)).toEqual(["Fixture Aldric", "Fixture Zara"]);
    expect(people[0].title).toBe("Magistrate");

    const places = await actions.sa_listStoryElements(myStory, "PLACE", 0);
    expect(places.map((element) => element.name)).toEqual(["Fixture vault"]);
    expect(await actions.sa_listStoryElements(myStory, "EPHEMERA", 0)).toEqual([]);

    // A new element takes the workflow's starting status, whatever it is called.
    const workflow = await (
      await import("@/components/status/actions")
    ).sa_listStatusOptions("elements");
    expect(people[0].status).toBe(workflow[0].key);
  });

  it("lists elements in whichever sort the run page's library asks for", async () => {
    const names = async (sort: Parameters<typeof actions.sa_listStoryElements>[5]) =>
      (await actions.sa_listStoryElements(myStory, "PERSON", 0, "", undefined, sort)).map(
        (element) => element.name,
      );
    const [zara] = await db
      .select({ id: tables.elements.idElement })
      .from(tables.elements)
      .where(and(eq(tables.elements.idStory, myStory), eq(tables.elements.name, "Fixture Zara")));
    // Zara gets a title before Aldric's and an initial name he has none of,
    // and is the one changed last.
    await db
      .update(tables.elements)
      .set({ title: "Baker", initialName: "Fixture veiled woman", updatedAt: new Date() })
      .where(eq(tables.elements.idElement, zara.id));
    try {
      expect(await names("name")).toEqual(["Fixture Aldric", "Fixture Zara"]);
      expect(await names("title")).toEqual(["Fixture Zara", "Fixture Aldric"]);
      // An element with no initial name goes last.
      expect(await names("initial_name")).toEqual(["Fixture Zara", "Fixture Aldric"]);
      expect(await names("updated")).toEqual(["Fixture Zara", "Fixture Aldric"]);
      // Both were made in one statement, so the later id counts as newer.
      expect(await names("created")).toEqual(["Fixture Aldric", "Fixture Zara"]);
      await expect(
        actions.sa_listStoryElements(myStory, "PERSON", 0, "", undefined, "colour" as never),
      ).rejects.toThrow();
    } finally {
      await db
        .update(tables.elements)
        .set({ title: null, initialName: null })
        .where(eq(tables.elements.idElement, zara.id));
    }
  });

  it("searches an element's search_text, including what the card does not show", async () => {
    const found = await actions.sa_listStoryElements(myStory, "PLACE", 0, "LANTERN");
    expect(found.map((element) => element.name)).toEqual(["Fixture vault"]);
    // The search stays inside the kind it was asked about.
    expect(await actions.sa_listStoryElements(myStory, "PERSON", 0, "lantern")).toEqual([]);
    // And the statuses still switched on narrow it; none switched on is nothing.
    expect(await actions.sa_listStoryElements(myStory, "PLACE", 0, "", [])).toEqual([]);
  });

  it("counts a story's elements by kind, zero for a kind it has none of", async () => {
    expect(await actions.sa_countStoryElements(myStory)).toEqual({
      PERSON: 2,
      PLACE: 1,
      THING: 0,
      OTHER: 0,
      EPHEMERA: 0,
    });
  });

  it("tells a visitor nothing about another storyteller's elements", async () => {
    expect(await actions.sa_listStoryElements(theirStory, "PERSON", 0)).toEqual([]);
    expect(await actions.sa_countStoryElements(theirStory)).toEqual({
      PERSON: 0,
      PLACE: 0,
      THING: 0,
      OTHER: 0,
      EPHEMERA: 0,
    });
  });

  it("treats an id Postgres cannot compare as no story at all", async () => {
    expect(await actions.sa_listStoryScenes(2147483648, 0)).toEqual([]);
    expect(await actions.sa_countStoryScenes(2147483648)).toBe(0);
  });

  it("gives one scene in full, with the sitting it was played in", async () => {
    const [newest] = await actions.sa_listStoryScenes(myStory, 0);
    const detail = await actions.sa_getStoryScene(newest.idStoryScene);

    expect(detail).toMatchObject({
      idStoryScene: newest.idStoryScene,
      title: newest.title,
      description: newest.description,
      imageLink: null,
      // Never played, so there is no sitting to name.
      idStorySession: null,
      sessionHeading: null,
    });
  });

  it("names the sitting the way the Timeline does once a scene has been played", async () => {
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: myStory, title: "Fixture sitting" })
      .returning({ id: tables.storySessions.idStorySession });
    const [scene] = await actions.sa_listStoryScenes(myStory, 0);
    await db
      .update(tables.storyScenes)
      .set({ idStorySession: session.id })
      .where(eq(tables.storyScenes.idStoryScene, scene.idStoryScene));

    const detail = await actions.sa_getStoryScene(scene.idStoryScene);
    // The story's only session, so it is the first: "1. Fixture sitting".
    expect(detail?.sessionHeading).toBe("1. Fixture sitting");

    await db
      .update(tables.storyScenes)
      .set({ idStorySession: null })
      .where(eq(tables.storyScenes.idStoryScene, scene.idStoryScene));
    await db
      .delete(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, session.id));
  });

  it("marks a scene the storyteller's own", async () => {
    const [scene] = await actions.sa_listStoryScenes(myStory, 0);
    expect((await actions.sa_getStoryScene(scene.idStoryScene))?.isStoryteller).toBe(true);
  });

  it("gives nobody outside the story a scene, and nothing for an unusable id", async () => {
    const [theirs] = await db
      .select({ id: tables.storyScenes.idStoryScene })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStory, theirStory));

    expect(await actions.sa_getStoryScene(theirs.id)).toBeNull();
    expect(await actions.sa_getStoryScene(2147483648)).toBeNull();
    expect(await actions.sa_getStoryScene(2147483647)).toBeNull();
  });

  it("gives a player of the story its scene, as someone who is not the storyteller", async () => {
    const [theirs] = await db
      .select({ id: tables.storyScenes.idStoryScene })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStory, theirStory));
    await db.insert(tables.storyPlayers).values({ idStory: theirStory, idUser: testUser });

    try {
      expect(await actions.sa_getStoryScene(theirs.id)).toMatchObject({
        idStoryScene: theirs.id,
        title: "Fixture scene of theirs",
        isStoryteller: false,
      });
    } finally {
      await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, theirStory));
    }
  });

  describe("a scene's elements", () => {
    // Three elements linked to a scene: one hidden from the players, one
    // whose description is held back, and one showing its first-meeting
    // name. Made on each story, so the storyteller's view and a player's can
    // both be read.
    async function linkThree(idStory: number, owner: string) {
      const [scene] = await db
        .insert(tables.storyScenes)
        .values({ idStory, sceneTitle: "Fixture scene with elements", idCreatedByUser: owner })
        .returning({ id: tables.storyScenes.idStoryScene });
      const [hidden, heldBack, stranger] = await db
        .insert(tables.elements)
        .values([
          {
            idStory,
            kind: "PERSON",
            name: "Fixture Assassin",
            description: "Waiting in the rafters.",
            idCreatedByUser: owner,
          },
          {
            idStory,
            kind: "THING",
            name: "Fixture Ledger",
            title: "The guild's accounts",
            description: "Two sets of books.",
            idCreatedByUser: owner,
          },
          {
            idStory,
            kind: "PERSON",
            initialName: "A hooded woman",
            name: "Fixture Morwen",
            title: "Queen in exile",
            description: "Grey cloak, silver ring.",
            idCreatedByUser: owner,
          },
        ])
        .returning({ id: tables.elements.idElement });
      await db.insert(tables.sceneElements).values([
        {
          idStoryScene: scene.id,
          idElement: hidden.id,
          status: "INVISIBLE",
          elementShowing: "name",
          idCreatedByUser: owner,
        },
        {
          idStoryScene: scene.id,
          idElement: heldBack.id,
          elementShowing: "name",
          showInfo: false,
          idCreatedByUser: owner,
        },
        {
          idStoryScene: scene.id,
          idElement: stranger.id,
          elementShowing: "initial_name",
          idCreatedByUser: owner,
        },
      ]);
      return { idScene: scene.id, idElements: [hidden.id, heldBack.id, stranger.id] };
    }

    // Everything linkThree made, so the element lists and counts the other
    // tests read are left as they were.
    async function unlink({ idScene, idElements }: Awaited<ReturnType<typeof linkThree>>) {
      await db.delete(tables.sceneElements).where(eq(tables.sceneElements.idStoryScene, idScene));
      await db.delete(tables.storyScenes).where(eq(tables.storyScenes.idStoryScene, idScene));
      await db.delete(tables.elements).where(inArray(tables.elements.idElement, idElements));
    }

    it("gives the storyteller every element in the scene, by kind, as written", async () => {
      const made = await linkThree(myStory, testUser);
      try {
        const detail = await actions.sa_getStoryScene(made.idScene);
        expect(detail?.elements).toEqual([
          expect.objectContaining({
            kind: "PERSON",
            label: "Fixture Assassin",
            detail: null,
            description: "Waiting in the rafters.",
            status: "INVISIBLE",
          }),
          expect.objectContaining({
            kind: "PERSON",
            label: "Fixture Morwen",
            detail: "Queen in exile",
            description: "Grey cloak, silver ring.",
            status: "READY",
          }),
          expect.objectContaining({
            kind: "THING",
            label: "Fixture Ledger",
            detail: "The guild's accounts",
            description: "Two sets of books.",
            status: "READY",
          }),
        ]);
      } finally {
        await unlink(made);
      }
    });

    it("gives a player only what the table shows them", async () => {
      const made = await linkThree(theirStory, otherUserId);
      await db.insert(tables.storyPlayers).values({ idStory: theirStory, idUser: testUser });
      try {
        const detail = await actions.sa_getStoryScene(made.idScene);
        // No hidden element, the name the table shows rather than the true
        // one, and no description the storyteller is keeping back.
        expect(detail?.elements).toEqual([
          expect.objectContaining({
            label: "A hooded woman",
            detail: "Queen in exile",
            description: "Grey cloak, silver ring.",
          }),
          expect.objectContaining({
            label: "Fixture Ledger",
            detail: "The guild's accounts",
            description: null,
          }),
        ]);
      } finally {
        await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, theirStory));
        await unlink(made);
      }
    });
  });

  it("orders by the sitting, then through the workflow, with unplayed scenes first", async () => {
    // Two sittings, the second touched more recently than the first.
    const sessions = await db
      .insert(tables.storySessions)
      .values([
        { idStory: myStory, title: "Older sitting" },
        { idStory: myStory, title: "Newer sitting" },
      ])
      .returning({ id: tables.storySessions.idStorySession, title: tables.storySessions.title });
    const older = sessions.find((row) => row.title === "Older sitting")!.id;
    const newer = sessions.find((row) => row.title === "Newer sitting")!.id;
    await db
      .update(tables.storySessions)
      .set({ updatedAt: sql`now() - interval '2 days'` })
      .where(eq(tables.storySessions.idStorySession, older));
    await db
      .update(tables.storySessions)
      .set({ updatedAt: sql`now() - interval '1 hour'` })
      .where(eq(tables.storySessions.idStorySession, newer));

    const workflow = await (
      await import("@/components/status/actions")
    ).sa_listStatusOptions("story_scenes");

    const rows = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: myStory, idStorySession: older, sceneTitle: "Older sitting, later status" },
        { idStory: myStory, idStorySession: newer, sceneTitle: "Newer sitting, later status" },
        { idStory: myStory, idStorySession: newer, sceneTitle: "Newer sitting, first status" },
        { idStory: myStory, sceneTitle: "No sitting at all" },
      ])
      .returning({
        id: tables.storyScenes.idStoryScene,
        title: tables.storyScenes.sceneTitle,
        status: tables.storyScenes.status,
      });
    const idOf = (title: string) => rows.find((row) => row.title === title)!.id;

    // Where a new row starts is the column default, whatever the workflow
    // calls it, and "later" is a status the workflow allows out of it that
    // sits further along. Every story_scenes status leads to every other, so
    // there is no status with nothing leading in or out to ask for instead.
    const first = rows[0].status;
    const startIndex = workflow.findIndex((option) => option.key === first);
    const later = transitionsFrom(first, workflow).find(
      (option) => workflow.findIndex((other) => other.key === option.key) > startIndex,
    )!;

    for (const title of ["Older sitting, later status", "Newer sitting, later status"]) {
      await db
        .update(tables.storyScenes)
        .set({ status: later.key })
        .where(eq(tables.storyScenes.idStoryScene, idOf(title)));
    }

    const listed = (await actions.sa_listStoryScenes(myStory, 0, "sitting")).map(
      (scene) => scene.title,
    );
    expect(listed).toEqual([
      // No sitting, so nothing to sort it under: it is the prep still to do.
      "No sitting at all",
      // Then the sitting touched most recently, its scenes in the workflow's
      // own order: the status a scene starts in before the one it ends in.
      "Newer sitting, first status",
      "Newer sitting, later status",
      // Then the older sitting.
      "Older sitting, later status",
    ]);
    // The card carries the sitting it belongs to, named as the Timeline does.
    const played = await actions.sa_listStoryScenes(myStory, 0, "Newer sitting, first");
    expect(played[0].sessionHeading).toBe("2. Newer sitting");
    // The card shows the number alone, with the heading behind it.
    expect(played[0].sessionNumber).toBe(2);
    expect(played[0].status).toBe(first);

    await db.delete(tables.storyScenes).where(
      inArray(
        tables.storyScenes.idStoryScene,
        rows.map((row) => row.id),
      ),
    );
    await db
      .delete(tables.storySessions)
      .where(inArray(tables.storySessions.idStorySession, [older, newer]));
  });

  it("dates a scene by the column belonging to the status it holds", async () => {
    const workflow = await (
      await import("@/components/status/actions")
    ).sa_listStatusOptions("story_scenes");
    const [row] = await db
      .insert(tables.storyScenes)
      .values({ idStory: myStory, sceneTitle: "Fixture dated scene" })
      .returning({ id: tables.storyScenes.idStoryScene, status: tables.storyScenes.status });

    const before = await actions.sa_getStoryScene(row.id);
    expect(before?.statusAt).toBeInstanceOf(Date);

    // Moved on, and the date follows: it is read from whichever <status>_at
    // column belongs to the status the row now holds, not from a fixed one.
    const move = transitionsFrom(row.status, workflow)[0];
    await db
      .update(tables.storyScenes)
      .set({ status: move.key })
      .where(eq(tables.storyScenes.idStoryScene, row.id));

    const after = await actions.sa_getStoryScene(row.id);
    expect(after?.status).toBe(move.key);
    expect(after!.statusAt!.getTime()).toBeGreaterThanOrEqual(before!.statusAt!.getTime());

    await db.delete(tables.storyScenes).where(eq(tables.storyScenes.idStoryScene, row.id));
  });

  it("numbers the finished scenes of a sitting in the order they were finished", async () => {
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: myStory, title: "Numbering" })
      .returning({ id: tables.storySessions.idStorySession });

    const workflow = await (
      await import("@/components/status/actions")
    ).sa_listStatusOptions("story_scenes");
    // The end of the workflow, whatever it is called: the last status the
    // seed lists, which is the one a finished scene holds.
    const finished = workflow[workflow.length - 1].key;

    const rows = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: myStory, idStorySession: session.id, sceneTitle: "Finished second" },
        { idStory: myStory, idStorySession: session.id, sceneTitle: "Finished first" },
        { idStory: myStory, idStorySession: session.id, sceneTitle: "Not finished" },
      ])
      .returning({ id: tables.storyScenes.idStoryScene, title: tables.storyScenes.sceneTitle });
    const idOf = (title: string) => rows.find((row) => row.title === title)!.id;

    // Finished out of the order they were written, and out of id order, so
    // the numbers can only come from when each one was finished. The column
    // is named after the status, lower-cased, as the workflow builds it.
    const column = `${finished.toLowerCase()}_at`;
    for (const [title, minutes] of [
      ["Finished first", 20],
      ["Finished second", 10],
    ] as const) {
      await db
        .update(tables.storyScenes)
        .set({ status: finished })
        .where(eq(tables.storyScenes.idStoryScene, idOf(title)));
      await db.execute(
        sql`update story_scenes
            set ${sql.identifier(column)} = now() - (${minutes} * interval '1 minute')
            where id_story_scene = ${idOf(title)}`,
      );
    }

    const listed = await actions.sa_listStoryScenes(myStory, 0, "Finish");
    const numbered = Object.fromEntries(listed.map((scene) => [scene.title, scene.sceneNumber]));
    // Numbered by when each was finished, and the one still to play carries
    // no number at all.
    expect(numbered).toEqual({
      "Finished first": 1,
      "Finished second": 2,
      "Not finished": null,
    });

    await db.delete(tables.storyScenes).where(
      inArray(
        tables.storyScenes.idStoryScene,
        rows.map((row) => row.id),
      ),
    );
    await db
      .delete(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, session.id));
  });

  it("times a scene by its stretches in play, and gives it a length once finished", async () => {
    const [scene] = await db
      .insert(tables.storyScenes)
      .values({ idStory: myStory, sceneTitle: "Fixture timed scene", idCreatedByUser: testUser })
      .returning({ id: tables.storyScenes.idStoryScene });
    const byId = eq(tables.storyScenes.idStoryScene, scene.id);
    // Each stretch is backdated after the move into ACTIVE, because the
    // workflow trigger stamps active_at with now() as the row arrives.
    async function playFor(minutes: number) {
      await db.update(tables.storyScenes).set({ status: "ACTIVE" }).where(byId);
      await db
        .update(tables.storyScenes)
        .set({ activeAt: sql`now() - make_interval(mins => ${minutes})` })
        .where(byId);
    }

    try {
      await playFor(10);
      await db.update(tables.storyScenes).set({ status: "PENDING" }).where(byId);
      // Set down part way: timed so far, but not finished, so no length yet.
      expect((await actions.sa_getStoryScene(scene.id))?.length).toBeNull();

      await playFor(5);
      await db.update(tables.storyScenes).set({ status: SCENE_LOCKED_STATUS }).where(byId);
      // Both stretches, and not the time it sat in between.
      expect((await actions.sa_getStoryScene(scene.id))?.length).toBe(15);
    } finally {
      await db.delete(tables.storyScenes).where(byId);
    }
  });

  describe("writing scenes", () => {
    const TITLE = "Fixture written scene";
    let mySession = 0;
    let theirSession = 0;

    async function written() {
      return db
        .select({
          id: tables.storyScenes.idStoryScene,
          title: tables.storyScenes.sceneTitle,
          description: tables.storyScenes.sceneDescription,
          idStorySession: tables.storyScenes.idStorySession,
          idCreatedByUser: tables.storyScenes.idCreatedByUser,
        })
        .from(tables.storyScenes)
        .where(eq(tables.storyScenes.sceneTitle, TITLE));
    }

    before(async () => {
      const rows = await db
        .insert(tables.storySessions)
        .values([
          { idStory: myStory, title: "Fixture sitting", idCreatedByUser: testUser },
          { idStory: theirStory, idCreatedByUser: otherUserId },
        ])
        .returning({
          id: tables.storySessions.idStorySession,
          idStory: tables.storySessions.idStory,
        });
      mySession = rows.find((row) => row.idStory === myStory)!.id;
      theirSession = rows.find((row) => row.idStory === theirStory)!.id;
    });

    after(async () => {
      await db.delete(tables.storyScenes).where(eq(tables.storyScenes.sceneTitle, TITLE));
      await db
        .delete(tables.storySessions)
        .where(inArray(tables.storySessions.idStorySession, [mySession, theirSession]));
    });

    it("offers the story's sittings to its storyteller, named as the Timeline names them", async () => {
      expect(await actions.sa_listSceneSessionOptions(myStory)).toEqual([
        { idStorySession: mySession, label: "1. Fixture sitting" },
      ]);
      expect(await actions.sa_listSceneSessionOptions(theirStory)).toEqual([]);
    });

    it("creates a scene on the caller's story, for the board's dialog to close on", async () => {
      expect(
        await actions.sa_createStoryScene(myStory, {
          title: `  ${TITLE}  `,
          description: "",
          idStorySession: String(mySession),
        }),
      ).toEqual({ ok: true });

      const [row] = await written();
      expect(row).toMatchObject({
        title: TITLE,
        description: null,
        idStorySession: mySession,
        idCreatedByUser: testUser,
      });
    });

    it("refuses a sitting from another story, and a story that is not the caller's", async () => {
      expect(
        await actions.sa_createStoryScene(myStory, {
          title: "Fixture never written",
          description: "",
          idStorySession: String(theirSession),
        }),
      ).toEqual({
        ok: false,
        errors: { idStorySession: "That session is not part of this story." },
      });
      await expect(
        actions.sa_createStoryScene(theirStory, {
          title: "Fixture never written",
          description: "",
          idStorySession: "",
        }),
      ).rejects.toThrow(/storyteller/);
    });

    it("loads a scene for editing, and saves it back to the board", async () => {
      const [{ id }] = await written();

      const loaded = await actions.sa_getStorySceneForEdit(id);
      expect(loaded).toMatchObject({
        idStory: myStory,
        // A new scene takes the workflow's default, whatever it is called.
        status: expect.any(String),
        locked: false,
        values: { title: TITLE, description: "", idStorySession: mySession },
      });

      const target = await redirectOf(
        actions.sa_updateStoryScene(id, {
          title: TITLE,
          description: "Two guards at the door.",
          idStorySession: "",
        }),
      );
      expect(target).toBe(`/libraries/${myStory}`);
      const [row] = await written();
      expect(row.description).toBe("Two guards at the door.");
      expect(row.idStorySession).toBeNull();
    });

    it("goes back where the form was opened from when told, and only to a path of this site", async () => {
      const [{ id }] = await written();
      const values = { title: TITLE, description: "Two guards at the door.", idStorySession: "" };
      expect(
        await redirectOf(actions.sa_updateStoryScene(id, values, `/preview/scene/${id}`)),
      ).toBe(`/preview/scene/${id}`);
      // Anywhere else is the board, as with nothing said.
      expect(
        await redirectOf(actions.sa_updateStoryScene(id, values, "https://evil.example")),
      ).toBe(`/libraries/${myStory}`);
      expect(await redirectOf(actions.sa_updateStoryScene(id, values, "//evil.example"))).toBe(
        `/libraries/${myStory}`,
      );
    });

    it("will not edit a completed scene", async () => {
      const [{ id }] = await written();
      await db
        .update(tables.storyScenes)
        .set({ status: SCENE_LOCKED_STATUS })
        .where(eq(tables.storyScenes.idStoryScene, id));

      expect((await actions.sa_getStorySceneForEdit(id))?.locked).toBe(true);
      expect(
        await actions.sa_updateStoryScene(id, {
          title: "Fixture rewritten",
          description: "",
          idStorySession: "",
        }),
      ).toEqual({ ok: false, errors: { "": "A completed scene can no longer be edited." } });
      expect((await written())[0].description).toBe("Two guards at the door.");
    });

    it("gives nobody but the storyteller a scene to edit", async () => {
      const [theirs] = await db
        .select({ id: tables.storyScenes.idStoryScene })
        .from(tables.storyScenes)
        .where(eq(tables.storyScenes.idStory, theirStory));
      expect(await actions.sa_getStorySceneForEdit(theirs.id)).toBeNull();
      await expect(
        actions.sa_updateStoryScene(theirs.id, {
          title: "Fixture never written",
          description: "",
          idStorySession: "",
        }),
      ).rejects.toThrow(/storyteller/);
    });
  });

  describe("writing elements", () => {
    const NAME = "Fixture written element";
    const blank = { initialName: "", title: "", description: "", notes: "", url: "", urlText: "" };

    async function written() {
      return db
        .select({
          id: tables.elements.idElement,
          kind: tables.elements.kind,
          name: tables.elements.name,
          initialName: tables.elements.initialName,
          title: tables.elements.title,
          idCreatedByUser: tables.elements.idCreatedByUser,
        })
        .from(tables.elements)
        .where(eq(tables.elements.name, NAME));
    }

    after(async () => {
      await db.delete(tables.elements).where(eq(tables.elements.name, NAME));
    });

    it("creates an element of the kind chosen on the caller's story", async () => {
      expect(
        await actions.sa_createElement(myStory, {
          ...blank,
          kind: "PLACE",
          name: `  ${NAME}  `,
          title: "Under the dun",
        }),
      ).toEqual({ ok: true });

      const [row] = await written();
      expect(row).toMatchObject({
        kind: "PLACE",
        name: NAME,
        initialName: null,
        title: "Under the dun",
        idCreatedByUser: testUser,
      });
    });

    it("refuses an element with no name, and a story that is not the caller's", async () => {
      expect(
        await actions.sa_createElement(myStory, { ...blank, kind: "PERSON", name: " " }),
      ).toEqual({ ok: false, errors: { name: "Please give the element a name." } });
      await expect(
        actions.sa_createElement(theirStory, { ...blank, kind: "PERSON", name: "Nobody" }),
      ).rejects.toThrow(/storyteller/);
    });

    it("loads an element for editing, and saves it back to the board, kind and all", async () => {
      const [{ id }] = await written();
      expect(await actions.sa_getElementForEdit(id)).toEqual({
        idStory: myStory,
        values: {
          ...blank,
          kind: "PLACE",
          name: NAME,
          title: "Under the dun",
        },
      });

      const target = await redirectOf(
        actions.sa_updateElement(id, {
          ...blank,
          kind: "THING",
          name: NAME,
          initialName: "The box",
        }),
      );
      expect(target).toBe(`/libraries/${myStory}`);
      const [row] = await written();
      expect(row).toMatchObject({ kind: "THING", initialName: "The box", title: null });
    });

    it("gives nobody but the storyteller an element to edit", async () => {
      const [theirs] = await db
        .insert(tables.elements)
        .values({ idStory: theirStory, kind: "PERSON", name: NAME, idCreatedByUser: otherUserId })
        .returning({ id: tables.elements.idElement });

      expect(await actions.sa_getElementForEdit(theirs.id)).toBeNull();
      await expect(
        actions.sa_updateElement(theirs.id, { ...blank, kind: "PERSON", name: NAME }),
      ).rejects.toThrow(/storyteller/);
    });

    it("deletes an element, taking its scene links and leaving its picture", async () => {
      const [picture] = await db
        .insert(tables.attachments)
        .values({ idStory: myStory, status: "READY", url: "https://x.test/p.png" })
        .returning({ id: tables.attachments.idAttachment });
      const [doomed] = await db
        .insert(tables.elements)
        .values({ idStory: myStory, kind: "THING", name: NAME, idCreatedByUser: testUser })
        .returning({ id: tables.elements.idElement });
      // Its picture: the element's use of the attachment, tagged cover.
      await db.insert(tables.attachmentUses).values({
        idAttachment: picture.id,
        kind: "ELEMENT",
        idExternal: doomed.id,
        tags: ["cover"],
        idCreatedByUser: testUser,
      });
      const [scene] = await db
        .insert(tables.storyScenes)
        .values({ idStory: myStory, sceneTitle: "Fixture scene to delete from" })
        .returning({ id: tables.storyScenes.idStoryScene });
      await db
        .insert(tables.sceneElements)
        .values({ idStoryScene: scene.id, idElement: doomed.id, idCreatedByUser: testUser });

      try {
        expect(await actions.sa_deleteElement(doomed.id)).toEqual({ ok: true, idStory: myStory });
        const links = await db
          .select({ id: tables.sceneElements.idSceneElement })
          .from(tables.sceneElements)
          .where(eq(tables.sceneElements.idElement, doomed.id));
        expect(links).toEqual([]);
        const pictures = await db
          .select({ id: tables.attachments.idAttachment })
          .from(tables.attachments)
          .where(eq(tables.attachments.idAttachment, picture.id));
        expect(pictures).toEqual([{ id: picture.id }]);
        // The file stays the story's; only the element's use of it went.
        const uses = await db
          .select({ id: tables.attachmentUses.idAttachmentUse })
          .from(tables.attachmentUses)
          .where(
            and(
              eq(tables.attachmentUses.kind, "ELEMENT"),
              eq(tables.attachmentUses.idExternal, doomed.id),
            ),
          );
        expect(uses).toEqual([]);
        expect(await actions.sa_getElementForEdit(doomed.id)).toBeNull();
        // Gone already.
        expect(await actions.sa_deleteElement(doomed.id)).toEqual({
          ok: false,
          error: "That element is not one of your story's.",
        });
      } finally {
        await db.delete(tables.storyScenes).where(eq(tables.storyScenes.idStoryScene, scene.id));
        await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, picture.id));
      }
    });

    it("deletes nobody else's element", async () => {
      const [theirs] = await db
        .insert(tables.elements)
        .values({ idStory: theirStory, kind: "PERSON", name: NAME, idCreatedByUser: otherUserId })
        .returning({ id: tables.elements.idElement });

      expect(await actions.sa_deleteElement(theirs.id)).toEqual({
        ok: false,
        error: "That element is not one of your story's.",
      });
      expect(await written()).toContainEqual(expect.objectContaining({ id: theirs.id }));
    });

    // What deleting leans on: an element's scene links go with it, and an
    // attachment's uses go with the attachment (an element's uses go by
    // trigger, not by key). Nothing else points at either table; a new key
    // that does should say here what it does.
    it("cascades an element's scene links, and an attachment's uses", async () => {
      const keys = await db.execute<{ from_table: string; col: string; on_delete: string }>(sql`
        select c.conrelid::regclass::text as from_table, a.attname as col,
               c.confdeltype as on_delete
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.contype = 'f'
          and c.confrelid in ('elements'::regclass, 'attachments'::regclass)
        order by 1, 2`);
      expect(keys.rows).toEqual([
        { from_table: "attachment_uses", col: "id_attachment", on_delete: "c" },
        { from_table: "scene_elements", col: "id_element", on_delete: "c" },
      ]);
    });
  });

  describe("deleting scenes", () => {
    const TITLE = "Fixture scene to delete";

    async function stillThere(id: number) {
      return db
        .select({ id: tables.storyScenes.idStoryScene })
        .from(tables.storyScenes)
        .where(eq(tables.storyScenes.idStoryScene, id));
    }

    after(async () => {
      await db.delete(tables.storyScenes).where(eq(tables.storyScenes.sceneTitle, TITLE));
    });

    it("deletes a completed scene, blanking the session that was on it and taking its links and picture uses", async () => {
      const [scene] = await db
        .insert(tables.storyScenes)
        .values({ idStory: myStory, sceneTitle: TITLE, idCreatedByUser: testUser })
        .returning({ id: tables.storyScenes.idStoryScene });
      await db
        .update(tables.storyScenes)
        .set({ status: SCENE_LOCKED_STATUS })
        .where(eq(tables.storyScenes.idStoryScene, scene.id));
      const [session] = await db
        .insert(tables.storySessions)
        .values({ idStory: myStory, idStoryScene: scene.id, idCreatedByUser: testUser })
        .returning({ id: tables.storySessions.idStorySession });
      const [element] = await db
        .insert(tables.elements)
        .values({ idStory: myStory, kind: "THING", name: TITLE, idCreatedByUser: testUser })
        .returning({ id: tables.elements.idElement });
      await db
        .insert(tables.sceneElements)
        .values({ idStoryScene: scene.id, idElement: element.id, idCreatedByUser: testUser });
      const [picture] = await db
        .insert(tables.attachments)
        .values({ idStory: myStory, status: "READY", url: "https://x.test/s.png" })
        .returning({ id: tables.attachments.idAttachment });
      await db.insert(tables.attachmentUses).values({
        idAttachment: picture.id,
        kind: "STORY_SCENE",
        idExternal: scene.id,
        idCreatedByUser: testUser,
      });

      try {
        expect(await actions.sa_deleteStoryScene(scene.id)).toEqual({ ok: true });
        expect(await stillThere(scene.id)).toEqual([]);

        // The session stays, with no scene.
        const [after] = await db
          .select({ idStoryScene: tables.storySessions.idStoryScene })
          .from(tables.storySessions)
          .where(eq(tables.storySessions.idStorySession, session.id));
        expect(after).toEqual({ idStoryScene: null });

        // The element stays the story's; only its link to the scene went.
        const links = await db
          .select({ id: tables.sceneElements.idSceneElement })
          .from(tables.sceneElements)
          .where(eq(tables.sceneElements.idElement, element.id));
        expect(links).toEqual([]);
        const elementsLeft = await db
          .select({ id: tables.elements.idElement })
          .from(tables.elements)
          .where(eq(tables.elements.idElement, element.id));
        expect(elementsLeft).toEqual([{ id: element.id }]);

        // The file stays the story's; only the scene's use of it went.
        const uses = await db
          .select({ id: tables.attachmentUses.idAttachmentUse })
          .from(tables.attachmentUses)
          .where(
            and(
              eq(tables.attachmentUses.kind, "STORY_SCENE"),
              eq(tables.attachmentUses.idExternal, scene.id),
            ),
          );
        expect(uses).toEqual([]);

        // Gone already.
        expect(await actions.sa_deleteStoryScene(scene.id)).toEqual({
          ok: false,
          error: "That scene is not one of your story's.",
        });
      } finally {
        await db
          .delete(tables.storySessions)
          .where(eq(tables.storySessions.idStorySession, session.id));
        await db.delete(tables.elements).where(eq(tables.elements.idElement, element.id));
        await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, picture.id));
      }
    });

    it("deletes nobody else's scene", async () => {
      const [theirs] = await db
        .insert(tables.storyScenes)
        .values({ idStory: theirStory, sceneTitle: TITLE, idCreatedByUser: otherUserId })
        .returning({ id: tables.storyScenes.idStoryScene });

      expect(await actions.sa_deleteStoryScene(theirs.id)).toEqual({
        ok: false,
        error: "That scene is not one of your story's.",
      });
      expect(await stillThere(theirs.id)).toEqual([{ id: theirs.id }]);
    });

    // What deleting leans on: a session's current scene goes blank, a
    // scene's element links go with it (its picture uses go by trigger, not
    // by key), and the table chat's lines said in it stay, with no scene.
    // Nothing else points at story_scenes; a new key that does should say
    // here what it does.
    it("blanks a session's scene and the chat's, and cascades a scene's element links", async () => {
      const keys = await db.execute<{ from_table: string; col: string; on_delete: string }>(sql`
        select c.conrelid::regclass::text as from_table, a.attname as col,
               c.confdeltype as on_delete
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.contype = 'f'
          and c.confrelid = 'story_scenes'::regclass
        order by 1, 2`);
      expect(keys.rows).toEqual([
        { from_table: "chats", col: "id_story_scene", on_delete: "n" },
        { from_table: "scene_elements", col: "id_story_scene", on_delete: "c" },
        { from_table: "story_sessions", col: "id_story_scene", on_delete: "n" },
      ]);
    });
  });
});
