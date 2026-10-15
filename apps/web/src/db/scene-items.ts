import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "./index";
import { sceneElementImageUrl } from "./attachment-url";
import { elements, sceneElements, stories, storySessions } from "./schema";
import { ELEMENT_KINDS } from "@/lib/elements";

// Reads that both the storyteller's publishing and the players' table need,
// kept here for the reason attachment-url.ts gives: a "use server" module
// may only export server actions, so the two routes cannot lend each other a
// helper.

/** The session being played at a story, and the scene it is on. */
export type CurrentScene = { idStorySession: number; idStoryScene: number | null };

/**
 * The story's current session while it is being played (OPEN or RESUMED,
 * as hasOpenSession counts), with the scene it is on, or null when nothing
 * is being played. No owner check: the callers have made theirs, and the
 * players' table reads this for a story it has already been let into.
 */
export async function currentScene(idStory: number): Promise<CurrentScene | null> {
  const [row] = await db
    .select({
      idStorySession: storySessions.idStorySession,
      idStoryScene: storySessions.idStoryScene,
    })
    .from(stories)
    .innerJoin(storySessions, eq(storySessions.idStorySession, stories.idStorySession))
    .where(and(eq(stories.idStory, idStory), inArray(storySessions.status, ["OPEN", "RESUMED"])))
    .limit(1);
  return row ?? null;
}

/**
 * An element with its link to one scene, and the address of the picture its
 * pill shows there: the link's own cover, else the element's.
 */
export type SceneItemRow = {
  element: typeof elements.$inferSelect;
  link: typeof sceneElements.$inferSelect;
  imageUrl: string | null;
};

/**
 * One element of a story with its link to a scene, or null when the element
 * is not the story's; the link is null when it is not in the scene. The two
 * halves are held to the one story here, since nothing in the database does.
 */
export async function sceneItem(
  idStory: number,
  idStoryScene: number,
  idElement: number,
): Promise<(Omit<SceneItemRow, "link"> & { link: SceneItemRow["link"] | null }) | null> {
  const [row] = await db
    .select({
      element: elements,
      link: sceneElements,
      imageUrl: sceneElementImageUrl("scene_elements", "elements"),
    })
    .from(elements)
    .leftJoin(
      sceneElements,
      and(
        eq(sceneElements.idElement, elements.idElement),
        eq(sceneElements.idStoryScene, idStoryScene),
      ),
    )
    .where(and(eq(elements.idElement, idElement), eq(elements.idStory, idStory)))
    .limit(1);
  return row ?? null;
}

/**
 * Every element linked to a scene of the story, in the order the
 * storyteller's play space shows them: by kind, People to Ephemera, then by
 * name. Links in the statuses given are left out; the players' table leaves
 * out INVISIBLE ones.
 */
export async function sceneItems(
  idStory: number,
  idStoryScene: number,
  excludeStatuses: string[] = [],
): Promise<SceneItemRow[]> {
  const rows = await db
    .select({
      element: elements,
      link: sceneElements,
      imageUrl: sceneElementImageUrl("scene_elements", "elements"),
    })
    .from(sceneElements)
    .innerJoin(elements, eq(elements.idElement, sceneElements.idElement))
    .where(and(eq(sceneElements.idStoryScene, idStoryScene), eq(elements.idStory, idStory)))
    .orderBy(asc(elements.name), asc(elements.idElement));
  const order = (kind: string) => ELEMENT_KINDS.indexOf(kind as (typeof ELEMENT_KINDS)[number]);
  return rows
    .filter((row) => !excludeStatuses.includes(row.link.status))
    .sort((a, b) => order(a.element.kind) - order(b.element.kind));
}
