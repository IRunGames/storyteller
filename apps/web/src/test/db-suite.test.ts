// The harness's own test, against the real database like the suites it
// carries. What it checks is what those suites lean on: the test user exists
// and is who getSession answers with, `caller` changes that answer and empties
// it, users made with makeUser are the suite's to find, and a story pair is
// two stories with a scene each, owned as named.
import { before, it } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { describeWithDb, makeStoryPair, removeStoryPair, type StoryPair } from "./db-suite";

const TEST_USER_EMAIL = "db-suite-harness@example.test";
const OTHER_EMAIL = "db-suite-harness-other@example.test";

describeWithDb("describeWithDb", { email: TEST_USER_EMAIL }, (suite) => {
  let pair: StoryPair;

  before(async () => {
    pair = await makeStoryPair(suite, {
      label: "Harness fixture",
      otherEmail: OTHER_EMAIL,
      other: { name: "Harness Other", nickName: "Harness" },
    });
  });

  it("makes the test user and signs the actions in as them", async () => {
    const { db, tables } = suite;
    const [row] = await db
      .select({ email: tables.user.email, name: tables.user.name })
      .from(tables.user)
      .where(eq(tables.user.id, suite.testUser));
    expect(row).toEqual({ email: TEST_USER_EMAIL, name: "Test User" });

    const { getSession } = await import("@/lib/require-session");
    expect(getSession).toBe(suite.getSession);
    expect(await getSession()).toEqual({ user: { id: suite.testUser } });
  });

  it("answers for whoever caller names, and with no session when it is empty", async () => {
    suite.caller = pair.otherUser;
    expect(await suite.getSession()).toEqual({ user: { id: pair.otherUser } });
    suite.caller = "";
    expect(await suite.getSession()).toBeNull();
    suite.caller = suite.testUser;
  });

  it("makes a story pair owned as named, a scene in each", async () => {
    const { db, tables } = suite;
    const stories = await db
      .select({
        id: tables.stories.idStory,
        title: tables.stories.title,
        owner: tables.stories.idCreatedByUser,
      })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, pair.mine));
    expect(stories).toEqual([
      { id: pair.mine, title: "Harness fixture — mine", owner: suite.testUser },
    ]);
    const [theirs] = await db
      .select({ title: tables.stories.title, owner: tables.stories.idCreatedByUser })
      .from(tables.stories)
      .where(eq(tables.stories.idStory, pair.theirs));
    expect(theirs).toEqual({ title: "Harness fixture — theirs", owner: pair.otherUser });

    const [scene] = await db
      .select({ idStory: tables.storyScenes.idStory, title: tables.storyScenes.sceneTitle })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStoryScene, pair.myScene));
    expect(scene).toEqual({ idStory: pair.mine, title: "Fixture scene at the docks" });
    const [theirScene] = await db
      .select({ idStory: tables.storyScenes.idStory })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStoryScene, pair.theirScene));
    expect(theirScene).toEqual({ idStory: pair.theirs });

    const [other] = await db
      .select({ name: tables.user.name, nickName: tables.user.nickName, email: tables.user.email })
      .from(tables.user)
      .where(eq(tables.user.id, pair.otherUser));
    expect(other).toEqual({ name: "Harness Other", nickName: "Harness", email: OTHER_EMAIL });
  });

  it("takes the pair's stories away with removeStoryPair", async () => {
    const { db, tables } = suite;
    await removeStoryPair(suite, pair);
    const left = await db
      .select({ id: tables.stories.idStory })
      .from(tables.stories)
      .where(eq(tables.stories.idCreatedByUser, suite.testUser));
    expect(left).toEqual([]);
    // Nothing to remove twice, and nothing to remove at all, both pass.
    await removeStoryPair(suite, pair);
    await removeStoryPair(suite, undefined);
  });
});
