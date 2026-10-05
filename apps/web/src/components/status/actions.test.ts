// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline.
//
// No status is written down here. The workflow is read from the database and
// every move is chosen from it: a status the workflow allows out of the row's
// current one, and a status it does not. That way these cases keep their
// meaning when the workflows are edited, which they will be.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray, sql } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

import { transitionsFrom, type StatusOption } from "@/lib/status";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const MINE = "Fixture status — the seed user's own story";
const THEIRS = "Fixture status — somebody else's story";

let otherUserId = "";
let myStory = 0;
let theirStory = 0;
let myScene = 0;
let theirScene = 0;
let myElement = 0;
let theirElement = 0;
let workflow: StatusOption[] = [];

describe("status actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    workflow = await actions.sa_listStatusOptions("story_scenes");

    const [otherUser] = await db
      .insert(tables.user)
      .values({
        name: "Fixture Status Other",
        nickName: "StatusOther",
        email: "fixture-status-other@example.test",
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

    const scenes = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: myStory, sceneTitle: "Mine", idCreatedByUser: SEED_USER },
        { idStory: theirStory, sceneTitle: "Theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.storyScenes.idStoryScene, title: tables.storyScenes.sceneTitle });
    myScene = scenes.find((row) => row.title === "Mine")!.id;
    theirScene = scenes.find((row) => row.title === "Theirs")!.id;

    const elements = await db
      .insert(tables.elements)
      .values([
        { idStory: myStory, kind: "THING", name: "Mine", idCreatedByUser: SEED_USER },
        { idStory: theirStory, kind: "THING", name: "Theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.elements.idElement, name: tables.elements.name });
    myElement = elements.find((row) => row.name === "Mine")!.id;
    theirElement = elements.find((row) => row.name === "Theirs")!.id;
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

  const statusOf = async (idStoryScene: number) => {
    const [row] = await db
      .select({ status: tables.storyScenes.status })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStoryScene, idStoryScene));
    return row.status;
  };

  it("reads a table's workflow out of the metatables, in order", async () => {
    expect(workflow.length).toBeGreaterThan(1);
    // Every key is stored upper case, which is the convention the seeds and
    // db/STATUS_WORKFLOWS.md set; the label is the readable form of it.
    for (const option of workflow) {
      expect(option.key).toBe(option.key.toUpperCase());
      expect(option.label.toUpperCase()).toBe(option.key.replace(/_/g, " "));
    }
    // The order is the workflow's own, which is what the pill's colour ramp
    // runs along, so the row a new scene starts in comes first.
    expect(workflow[0].from).toEqual(expect.any(Array));
  });

  it("refuses a table that has no business having a status", async () => {
    // The table name comes from the browser, so anything off the list is
    // rejected before it reaches a query.
    await expect(
      // @ts-expect-error the point of the case is a table the type forbids
      actions.sa_listStatusOptions("s_users"),
    ).rejects.toThrow();
  });

  it("moves a row to a status the workflow allows out of the one it holds", async () => {
    const from = await statusOf(myScene);
    const [move] = transitionsFrom(from, workflow);
    expect(move).toBeDefined();

    const result = await actions.sa_setRowStatus("story_scenes", myScene, move.key);
    expect(result).toEqual({ ok: true, status: move.key });
    expect(await statusOf(myScene)).toBe(move.key);

    // And the row records who moved it.
    const [row] = await db
      .select({ idUpdatedByUser: tables.storyScenes.idUpdatedByUser })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStoryScene, myScene));
    expect(row.idUpdatedByUser).toBe(SEED_USER);
  });

  it("stamps the timestamp column of the status it moved into", async () => {
    const from = await statusOf(myScene);
    const [move] = transitionsFrom(from, workflow);
    await actions.sa_setRowStatus("story_scenes", myScene, move.key);

    // The workflow builds one <status>_at column per status, named after the
    // key lower-cased, and a trigger stamps it as the row enters that status.
    // Read it by that name rather than through the schema, so the case holds
    // for whatever statuses the workflow is given.
    const column = `${move.key.toLowerCase()}_at`;
    const stamped = await db.execute(
      sql`select ${sql.identifier(column)} as stamped
          from story_scenes
          where id_story_scene = ${myScene}`,
    );
    expect(stamped.rows[0].stamped).not.toBeNull();
  });

  it("refuses a move the workflow does not list", async () => {
    const from = await statusOf(myScene);
    const allowed = new Set(transitionsFrom(from, workflow).map((option) => option.key));
    const blocked = workflow.find((option) => option.key !== from && !allowed.has(option.key));
    if (!blocked) {
      // Every status of this workflow leads to every other, so there is no
      // disallowed move to try. Nothing to assert rather than a false pass.
      return;
    }

    const result = await actions.sa_setRowStatus("story_scenes", myScene, blocked.key);
    expect(result.ok).toBe(false);
    expect(await statusOf(myScene)).toBe(from);
  });

  it("refuses a status the workflow has never heard of", async () => {
    const before = await statusOf(myScene);
    const result = await actions.sa_setRowStatus("story_scenes", myScene, "NOT_A_STATUS");
    expect(result.ok).toBe(false);
    expect(await statusOf(myScene)).toBe(before);
  });

  it("refuses to touch a row on someone else's story", async () => {
    const from = await statusOf(theirScene);
    const [move] = transitionsFrom(from, workflow);

    const result = await actions.sa_setRowStatus("story_scenes", theirScene, move.key);
    expect(result).toEqual({ ok: false, error: "That is not yours to change." });
    expect(await statusOf(theirScene)).toBe(from);
  });

  it("answers a row that is not there the same way as one that is not yours", async () => {
    const [move] = transitionsFrom(workflow[0].key, workflow);
    const result = await actions.sa_setRowStatus("story_scenes", 2147483647, move.key);
    expect(result).toEqual({ ok: false, error: "That is not yours to change." });
  });

  it("takes a move to the status the row already holds as nothing to do", async () => {
    const from = await statusOf(myScene);
    expect(await actions.sa_setRowStatus("story_scenes", myScene, from)).toEqual({
      ok: true,
      status: from,
    });
  });

  it("moves an element through the elements workflow, and only on the caller's own story", async () => {
    const elementWorkflow = await actions.sa_listStatusOptions("elements");
    const [row] = await db
      .select({ status: tables.elements.status })
      .from(tables.elements)
      .where(eq(tables.elements.idElement, myElement));
    const [move] = transitionsFrom(row.status, elementWorkflow);
    expect(move).toBeDefined();

    expect(await actions.sa_setRowStatus("elements", myElement, move.key)).toEqual({
      ok: true,
      status: move.key,
    });
    expect(await actions.sa_setRowStatus("elements", theirElement, move.key)).toEqual({
      ok: false,
      error: "That is not yours to change.",
    });
  });
});
