// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The tags a new scene starts
// with come from the database (tr_bi_story_scenes_standard_tags), not from
// any one action, so this inserts rows directly. Fixture rows are positive
// ids left to the database and are deleted in `after`.
import { after, before, describe, it } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let taggedSystem = 0;
let plainSystem = 0;
let storyIds: number[] = [];

describe("standard tags", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    ({ db, schema: tables } = await import("@/db"));

    [{ id: taggedSystem }, { id: plainSystem }] = await db
      .insert(tables.systems)
      .values([
        { systemName: "Fixture tagged system", standardTags: ["rules", "dice"] },
        { systemName: "Fixture plain system" },
      ])
      .returning({ id: tables.systems.idSystem });
  });

  after(async () => {
    if (!db) return;
    // Scenes go with their story.
    if (storyIds.length) {
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, storyIds));
    }
    await db
      .delete(tables.systems)
      .where(inArray(tables.systems.idSystem, [taggedSystem, plainSystem].filter(Boolean)));
    await db.$client.end();
  });

  async function newScene(
    story: {
      standardTags?: string[];
      idSystem?: number | null;
    },
    tags?: string[],
  ) {
    const [{ id }] = await db
      .insert(tables.stories)
      .values({ title: "Fixture standard tags story", idCreatedByUser: SEED_USER, ...story })
      .returning({ id: tables.stories.idStory });
    storyIds.push(id);
    const [scene] = await db
      .insert(tables.storyScenes)
      .values({ idStory: id, sceneTitle: "Fixture tagged scene", idCreatedByUser: SEED_USER, tags })
      .returning({ tags: tables.storyScenes.tags });
    return scene.tags;
  }

  it("gives systems, stories, scenes and scene elements an empty tag list by default", async () => {
    const [system] = await db
      .select({ standardTags: tables.systems.standardTags })
      .from(tables.systems)
      .where(eq(tables.systems.idSystem, plainSystem));
    expect(system.standardTags).toEqual([]);

    const [{ id }] = await db
      .insert(tables.stories)
      .values({ title: "Fixture untagged story", idCreatedByUser: SEED_USER })
      .returning({ id: tables.stories.idStory });
    storyIds.push(id);
    const [story] = await db
      .select({ standardTags: tables.stories.standardTags })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, id));
    expect(story.standardTags).toEqual([]);

    const [element] = await db
      .insert(tables.elements)
      .values({
        idStory: id,
        kind: "PERSON",
        name: "Fixture tag person",
        idCreatedByUser: SEED_USER,
      })
      .returning({ id: tables.elements.idElement });
    const [scene] = await db
      .insert(tables.storyScenes)
      .values({ idStory: id, sceneTitle: "Fixture scene for a link", idCreatedByUser: SEED_USER })
      .returning({ id: tables.storyScenes.idStoryScene });
    const [link] = await db
      .insert(tables.sceneElements)
      .values({ idStoryScene: scene.id, idElement: element.id, idCreatedByUser: SEED_USER })
      .returning({ tags: tables.sceneElements.tags });
    expect(link.tags).toEqual([]);
  });

  it("starts a new scene with its story's standard tags", async () => {
    expect(await newScene({ standardTags: ["assets", "scene"], idSystem: taggedSystem })).toEqual([
      "assets",
      "scene",
    ]);
  });

  it("falls back to the system's standard tags when the story has none", async () => {
    expect(await newScene({ idSystem: taggedSystem })).toEqual(["rules", "dice"]);
  });

  it("falls back to elements and scene when neither has any", async () => {
    expect(await newScene({ idSystem: plainSystem })).toEqual(["elements", "scene"]);
    expect(await newScene({ idSystem: null })).toEqual(["elements", "scene"]);
  });

  it("keeps tags a new scene was given", async () => {
    expect(await newScene({ standardTags: ["assets"] }, ["handout"])).toEqual(["handout"]);
  });
});
