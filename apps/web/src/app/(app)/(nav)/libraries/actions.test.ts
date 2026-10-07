// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The Prep Work board's reads: a
// story's scenes, the search over story_scenes.search_text, and the count
// beside the column's heading.
//
// `before` makes its own story and scenes for the seed user, plus a story
// belonging to someone else, and `after` deletes them. Fixture ids are
// positive and left to the database, so they cannot collide with the seed's
// negative ones. No status is written here by name: the scenes take the
// column default and any move is found in the workflow (src/test/workflow.ts).
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray, sql } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

import { SCENE_LOCKED_STATUS, SCENES_PAGE_SIZE } from "@/lib/scenes";
import { transitionsFrom } from "@/lib/status";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const MINE = "Fixture library — the seed user's own story";
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
        { title: MINE, idCreatedByUser: SEED_USER },
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
          idCreatedByUser: SEED_USER,
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
      { idStory: myStory, kind: "PERSON", name: "Fixture Zara", idCreatedByUser: SEED_USER },
      {
        idStory: myStory,
        kind: "PERSON",
        name: "Fixture Aldric",
        title: "Magistrate",
        idCreatedByUser: SEED_USER,
      },
      {
        idStory: myStory,
        kind: "PLACE",
        name: "Fixture vault",
        notes: "A lantern hangs by the door.",
        idCreatedByUser: SEED_USER,
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
    await db.insert(tables.storyPlayers).values({ idStory: theirStory, idUser: SEED_USER });

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
      .values({ idStory: myStory, sceneTitle: "Fixture timed scene", idCreatedByUser: SEED_USER })
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
          { idStory: myStory, title: "Fixture sitting", idCreatedByUser: SEED_USER },
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
        idCreatedByUser: SEED_USER,
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
    const blank = { initialName: "", title: "", description: "", notes: "" };

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
        idCreatedByUser: SEED_USER,
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
  });
});
