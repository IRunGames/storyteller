// The fixture the table's action suites share: a story the test user owns
// with a scene and three elements, two of them in the scene, and a story
// belonging to someone else (makeStoryPair), plus the publish mocks every
// write at the table reaches for. The run table's actions were one file with
// one fixture; split by concern (run, scene-elements, elements, sessions,
// join-links), each suite starts from the same material through this.
import { mock } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { makeStoryPair, removeStoryPair, type DbSuite, type StoryPair } from "./db-suite";

/** The empty play space, as sa_openRunPlaySpace answers it for nothing to show. */
export const EMPTY_SPACE = { scene: null, tags: [], coverUrl: null, inPlay: [] };

/**
 * The tags a new scene of a story with no standard tags and no system starts
 * with (db/functions/standard_tags_for_story.sql).
 */
export const DEFAULT_TAGS = ["elements", "scene"];

/**
 * What each write tells the players' table, mocked so the tests see which
 * helper an action reached for; what the helpers send is their own test's
 * business (lib/realtime/publish-scene.test.ts). The chat's divider and the
 * head count go out over the broker too; caught here, and publishLater runs
 * its work at once.
 */
export function publishMocks() {
  return {
    published: {
      publishSceneElement: mock.fn(async (..._args: unknown[]) => {}),
      publishSceneElementPulse: mock.fn(async (..._args: unknown[]) => {}),
      publishElementChanged: mock.fn(async (..._args: unknown[]) => {}),
      publishPictureChanged: mock.fn(async (..._args: unknown[]) => {}),
      publishSceneElementRemoved: mock.fn(async (..._args: unknown[]) => {}),
      publishSceneChanged: mock.fn(async (..._args: unknown[]) => {}),
      publishSessionUpdated: mock.fn(async (..._args: unknown[]) => {}),
    },
    publishChat: mock.fn(async (_idStory: number, _chat: unknown) => {}),
    publishTableCount: mock.fn(async (_idStory: number, _atTable: number) => {}),
    publishLater: (work: () => Promise<void>) => void work(),
  };
}

export type PublishMocks = ReturnType<typeof publishMocks>;

/** Registers the publish mocks; called in `before`, ahead of the import of the module under test. */
export function mockPublishing(mocks: PublishMocks): void {
  mock.module("@/lib/realtime/publish-scene", { namedExports: mocks.published });
  mock.module("@/lib/realtime/publish", {
    namedExports: {
      publishChat: mocks.publishChat,
      publishLater: mocks.publishLater,
      publishTableCount: mocks.publishTableCount,
    },
  });
}

/**
 * The run page's element form's fields, blank but for what a test sets, as
 * sa_createSceneElement and sa_updateSceneElement take them.
 */
export function elementForm(values: Record<string, string>) {
  return {
    kind: "PLACE",
    name: "",
    initialName: "",
    title: "",
    description: "",
    notes: "",
    url: "",
    urlText: "",
    status: "PENDING",
    sceneStatus: "READY",
    sceneUrl: "",
    sceneUrlText: "",
    sceneLabel: "",
    ...values,
  };
}

export type SceneFixture = StoryPair & {
  /** The test user's story and scene, under the names the suites use. */
  scene: number;
  /** A place, a person and a thing of the test user's; the lantern is left out of the scene. */
  abbey: number;
  zed: number;
  lantern: number;
  /** Opens a session of the story on a scene (or none) and makes it the story's current one. */
  openSession(idStory: number, idStoryScene: number | null, status?: string): Promise<number>;
  /** A scene of the test user's story in the given status; it goes with the story in `after`. */
  sceneIn(status: string, title?: string): Promise<number>;
  sceneRow(id: number): Promise<{ status: string; idStorySession: number | null }>;
  currentSceneOf(idStorySession: number): Promise<number | null>;
  /** The scene's links in id order, each with its element and tags. */
  linksOf(idStoryScene: number): Promise<{ idElement: number; tags: string[] }[]>;
  /**
   * An element's first link to a scene, by id: what the link actions name,
   * since an element may be in a scene more than once.
   */
  linkOf(idStoryScene: number, idElement: number): Promise<number>;
  /** Whether one link shows the players its element's description, or undefined for no link. */
  showInfoOf(idStoryScene: number, idElement: number): Promise<boolean | undefined>;
  /** Deletes both stories' sessions, which clears the stories' pointers (ON DELETE SET NULL). */
  clearSessions(): Promise<void>;
  /** Takes the fixture away; everything on the stories goes with them. */
  remove(): Promise<void>;
};

/**
 * Makes the fixture under the test user. A place named before the person,
 * so the order shown is the kinds' rather than the names'; and one element
 * left out of the scene. Fixture ids are positive and left to the database,
 * so they never collide with the seed's negative ids.
 */
export async function makeSceneFixture(suite: DbSuite, label: string): Promise<SceneFixture> {
  const { db, tables, testUser } = suite;
  const pair = await makeStoryPair(suite, {
    label,
    otherEmail: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-other@example.test`,
    other: { name: "Run Table Fixture" },
  });
  const { mine, myScene: scene } = pair;
  const [{ id: abbey }, { id: zed }, { id: lantern }] = await db
    .insert(tables.elements)
    .values([
      { idStory: mine, kind: "PLACE", name: "Fixture Abbey", idCreatedByUser: testUser },
      {
        idStory: mine,
        kind: "PERSON",
        name: "Fixture Zed",
        initialName: "Fixture hooded figure",
        title: "Harbourmaster",
        idCreatedByUser: testUser,
      },
      { idStory: mine, kind: "THING", name: "Fixture Lantern", idCreatedByUser: testUser },
    ])
    .returning({ id: tables.elements.idElement });
  await db.insert(tables.sceneElements).values([
    { idStoryScene: scene, idElement: abbey, idCreatedByUser: testUser },
    { idStoryScene: scene, idElement: zed, tags: ["scene"], idCreatedByUser: testUser },
  ]);

  return {
    ...pair,
    scene,
    abbey,
    zed,
    lantern,
    async openSession(idStory, idStoryScene, status = "OPEN") {
      const [session] = await db
        .insert(tables.storySessions)
        .values({ idStory, status, idStoryScene, idCreatedByUser: testUser })
        .returning({ id: tables.storySessions.idStorySession });
      await db
        .update(tables.stories)
        .set({ idStorySession: session.id })
        .where(eq(tables.stories.idStory, idStory));
      return session.id;
    },
    async sceneIn(status, title = `Fixture ${status.toLowerCase()} scene`) {
      const [row] = await db
        .insert(tables.storyScenes)
        .values({ idStory: mine, sceneTitle: title, status, idCreatedByUser: testUser })
        .returning({ id: tables.storyScenes.idStoryScene });
      return row.id;
    },
    async sceneRow(id) {
      const [row] = await db
        .select({
          status: tables.storyScenes.status,
          idStorySession: tables.storyScenes.idStorySession,
        })
        .from(tables.storyScenes)
        .where(eq(tables.storyScenes.idStoryScene, id));
      return row;
    },
    async currentSceneOf(idStorySession) {
      const [row] = await db
        .select({ idStoryScene: tables.storySessions.idStoryScene })
        .from(tables.storySessions)
        .where(eq(tables.storySessions.idStorySession, idStorySession));
      return row.idStoryScene;
    },
    async linksOf(idStoryScene) {
      return db
        .select({ idElement: tables.sceneElements.idElement, tags: tables.sceneElements.tags })
        .from(tables.sceneElements)
        .where(eq(tables.sceneElements.idStoryScene, idStoryScene))
        .orderBy(tables.sceneElements.idSceneElement);
    },
    async linkOf(idStoryScene, idElement) {
      const [row] = await db
        .select({ id: tables.sceneElements.idSceneElement })
        .from(tables.sceneElements)
        .where(
          and(
            eq(tables.sceneElements.idStoryScene, idStoryScene),
            eq(tables.sceneElements.idElement, idElement),
          ),
        )
        .orderBy(tables.sceneElements.idSceneElement);
      return row.id;
    },
    async showInfoOf(idStoryScene, idElement) {
      const [row] = await db
        .select({ showInfo: tables.sceneElements.showInfo })
        .from(tables.sceneElements)
        .where(
          and(
            eq(tables.sceneElements.idStoryScene, idStoryScene),
            eq(tables.sceneElements.idElement, idElement),
          ),
        );
      return row?.showInfo;
    },
    async clearSessions() {
      await db
        .delete(tables.storySessions)
        .where(inArray(tables.storySessions.idStory, [pair.mine, pair.theirs]));
    },
    async remove() {
      await removeStoryPair(suite, pair);
    },
  };
}
