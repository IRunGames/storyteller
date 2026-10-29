"use server";

import { and, desc, eq, exists, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAccount } from "@/lib/authorize";
import { ELEMENT_HISTORY_PAGE_SIZE } from "@/lib/elements";
import { SCENE_ELEMENT_HIDDEN } from "@/lib/run";
import { sessionHeading } from "@/lib/stories";

const { stories, storyPlayers, sceneElements, vStoryScenes } = schema;

// Ids are int4; one outside that range is a query error to Postgres rather
// than a missing row, so it is turned away before the query.
const idSchema = z.number().int().min(-2147483648).max(2147483647);
const offsetSchema = z.number().int().min(0).max(10_000);

/** One scene an element has been in, as the panel's History lists it. */
export type ElementHistoryRow = {
  idStoryScene: number;
  title: string;
  /** As the database has it, a story_scenes workflow key. */
  status: string;
  /** The sitting it was played in, "3. Kildealg", or null while it waits. */
  sessionHeading: string | null;
  /** When it was last played, as an ISO string, or null for a scene never played. */
  at: string | null;
};

export type ElementHistoryPage = { rows: ElementHistoryRow[]; hasMore: boolean };

/**
 * The scenes of the story an element is linked to, other than the one
 * given, most recently played first (active_at, which the scene workflow
 * restamps each time a scene goes into play) with scenes never played last,
 * ELEMENT_HISTORY_PAGE_SIZE at a time from `offset`. For the element panel's
 * History, at the storyteller's table and on a scene's preview. One more
 * row than the page is asked for, so `hasMore` is known without a count.
 *
 * The storyteller sees every link; a player only the scenes the element is
 * not hidden in, as their table shows it. Null when the story is not the
 * caller's to tell or play, or the element is not the story's, the two one
 * answer as loadPlayStory's are.
 */
export async function sa_listElementHistory(
  idStory: number,
  idElement: number,
  exceptIdStoryScene: number | null,
  offset: number,
): Promise<ElementHistoryPage | null> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  const except = idSchema.nullable().safeParse(exceptIdStoryScene);
  const skip = offsetSchema.safeParse(offset);
  if (!story.success || !element.success || !except.success || !skip.success) return null;

  const seated = exists(
    db
      .select({ one: storyPlayers.idStoryPlayer })
      .from(storyPlayers)
      .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, user.id))),
  );
  const [access] = await db
    .select({ isOwner: eq(stories.idCreatedByUser, user.id).mapWith(Boolean) })
    .from(stories)
    .where(and(eq(stories.idStory, story.data), or(eq(stories.idCreatedByUser, user.id), seated)))
    .limit(1);
  if (!access) return null;
  const [owned] = await db
    .select({ idElement: schema.elements.idElement })
    .from(schema.elements)
    .where(
      and(eq(schema.elements.idElement, element.data), eq(schema.elements.idStory, story.data)),
    )
    .limit(1);
  if (!owned) return null;

  const rows = await db
    .select({
      idStoryScene: vStoryScenes.idStoryScene,
      title: vStoryScenes.sceneTitle,
      status: vStoryScenes.status,
      sessionNumber: vStoryScenes.sessionNumber,
      sessionTitle: vStoryScenes.sessionTitle,
      activeAt: vStoryScenes.activeAt,
    })
    .from(sceneElements)
    .innerJoin(vStoryScenes, eq(vStoryScenes.idStoryScene, sceneElements.idStoryScene))
    .where(
      and(
        eq(sceneElements.idElement, element.data),
        eq(vStoryScenes.idStory, story.data),
        except.data === null ? undefined : ne(sceneElements.idStoryScene, except.data),
        access.isOwner ? undefined : ne(sceneElements.status, SCENE_ELEMENT_HIDDEN),
      ),
    )
    .orderBy(sql`${vStoryScenes.activeAt} desc nulls last`, desc(vStoryScenes.idStoryScene))
    .limit(ELEMENT_HISTORY_PAGE_SIZE + 1)
    .offset(skip.data);

  const page = rows.slice(0, ELEMENT_HISTORY_PAGE_SIZE);
  return {
    hasMore: rows.length > ELEMENT_HISTORY_PAGE_SIZE,
    rows: page.map((row) => ({
      idStoryScene: row.idStoryScene!,
      title: row.title ?? "",
      status: row.status ?? "",
      sessionHeading:
        row.sessionNumber === null
          ? null
          : sessionHeading({ number: row.sessionNumber, title: row.sessionTitle }),
      at: row.activeAt ? row.activeAt.toISOString() : null,
    })),
  };
}
