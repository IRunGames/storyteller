import { db } from "./index";
import { storyScenes } from "./schema";

/** Anything that can run an insert: the pool, or the transaction a caller is already inside. */
export type Executor = Pick<typeof db, "insert">;

/** What a new scene is made from; everything but the story and the title has a default. */
export type NewScene = {
  idStory: number;
  title: string;
  description?: string | null;
  notes?: string | null;
  /** The sitting it is in, or null for none; a scene made at the table is in the session being played. */
  idStorySession?: number | null;
  /** Left to the column's default, the workflow's first, unless said: a duplicate is made PENDING outright. */
  status?: string;
  /**
   * Left out unless given: the standard-tags trigger fills an empty array
   * with the story's standard tags, which is what a new scene wants, while a
   * copy of a scene keeps its original's.
   */
  tags?: string[];
  userId: string;
};

/**
 * Writes one scene of a story and answers its id. Five places used to insert
 * a scene each in their own way (the board's New scene, the table's Create
 * new scene, the live page's, the builder's first scene, and Duplicate), and
 * what they had in common, the audit columns and the empty-string-to-null
 * rule for the text, is what this holds. The caller checks the story is
 * theirs; given its transaction, the insert runs inside it.
 */
export async function createScene(values: NewScene, executor: Executor = db): Promise<number> {
  const [created] = await executor
    .insert(storyScenes)
    .values({
      idStory: values.idStory,
      sceneTitle: values.title,
      sceneDescription: values.description || null,
      notes: values.notes || null,
      idStorySession: values.idStorySession ?? null,
      ...(values.status === undefined ? {} : { status: values.status }),
      ...(values.tags === undefined ? {} : { tags: values.tags }),
      idCreatedByUser: values.userId,
      idUpdatedByUser: values.userId,
    })
    .returning({ idStoryScene: storyScenes.idStoryScene });
  return created.idStoryScene;
}
