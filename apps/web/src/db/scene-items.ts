import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "./index";
import {
  playerSceneElementImageUrl,
  sceneElementFogActive,
  sceneElementFogCovered,
} from "./attachment-url";
import { elements, sceneElements, stories, storySessions } from "./schema";
import { ELEMENT_KINDS } from "@/lib/elements";
import { SESSION_PLAYING_STATUSES } from "@/lib/status";

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
    .where(
      and(eq(stories.idStory, idStory), inArray(storySessions.status, SESSION_PLAYING_STATUSES)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * An element with its link to one scene, and the address of the picture its
 * pill shows the players there: the link's own cover, else the element's,
 * and for an annotated picture the players' copy in place of the raw
 * picture (playerSceneElementImageUrl). This is the players' read model:
 * everything a player is given about a scene's elements comes through here,
 * so the storyteller's own reads take their pictures elsewhere.
 */
export type SceneItemRow = {
  element: typeof elements.$inferSelect;
  link: typeof sceneElements.$inferSelect;
  imageUrl: string | null;
  /** Whether that picture is a players' copy covered in fog (sceneElementFogCovered). */
  fogCovered: boolean;
  /**
   * Whether that picture is a players' copy with fog on it anywhere
   * (sceneElementFogActive). Only sceneItems called with `fogActive` works it
   * out, for the storyteller's reads; the players' are never told, so it is
   * false for them.
   */
  fogActive: boolean;
};

/**
 * One link of a scene with its element, by the link's id, or null when the
 * link is gone or its element is not the story's. The two halves are held to
 * the one story here, since nothing in the database does.
 */
export async function sceneLink(
  idStory: number,
  idSceneElement: number,
): Promise<SceneItemRow | null> {
  const [row] = await db
    .select({
      element: elements,
      link: sceneElements,
      imageUrl: playerSceneElementImageUrl("scene_elements", "elements"),
      fogCovered: sceneElementFogCovered("scene_elements", "elements"),
    })
    .from(sceneElements)
    .innerJoin(elements, eq(elements.idElement, sceneElements.idElement))
    .where(and(eq(sceneElements.idSceneElement, idSceneElement), eq(elements.idStory, idStory)))
    .limit(1);
  return row ? { ...row, fogActive: false } : null;
}

/** The ids of an element's links to a scene, an element being in a scene any number of times. */
export async function sceneLinksOf(idStoryScene: number, idElement: number): Promise<number[]> {
  const rows = await db
    .select({ idSceneElement: sceneElements.idSceneElement })
    .from(sceneElements)
    .where(
      and(eq(sceneElements.idStoryScene, idStoryScene), eq(sceneElements.idElement, idElement)),
    )
    .orderBy(asc(sceneElements.idSceneElement));
  return rows.map((row) => row.idSceneElement);
}

/**
 * The links of a scene whose pill may show a picture: those whose own cover
 * is the file, and those whose element's cover is. A link whose own cover
 * stands in front of its element's is among them too, which says nothing new
 * to the players' table but costs nothing.
 */
export async function sceneLinksShowing(
  idStoryScene: number,
  idAttachment: number,
): Promise<number[]> {
  const rows = await db
    .select({ idSceneElement: sceneElements.idSceneElement })
    .from(sceneElements)
    .where(
      and(
        eq(sceneElements.idStoryScene, idStoryScene),
        sql`exists (
          select 1 from attachment_uses u
          where u.id_attachment = ${idAttachment}
            and u.tags @> array['cover']::text[]
            and ((u.kind = 'SCENE_ELEMENT' and u.external_id = scene_elements.id_scene_element)
              or (u.kind = 'ELEMENT' and u.external_id = scene_elements.id_element))
        )`,
      ),
    )
    .orderBy(asc(sceneElements.idSceneElement));
  return rows.map((row) => row.idSceneElement);
}

/**
 * Every element linked to a scene of the story, in the order the
 * storyteller's play space shows them: by kind, People to Ephemera, then by
 * name. Links in the statuses given are left out; the players' table leaves
 * out INVISIBLE ones. `fogActive` also works out whether each picture has
 * fog on it (SceneItemRow.fogActive), which only the storyteller's reads ask
 * for: the players' read leaves it false and does not pay for it.
 */
export async function sceneItems(
  idStory: number,
  idStoryScene: number,
  excludeStatuses: string[] = [],
  { fogActive = false }: { fogActive?: boolean } = {},
): Promise<SceneItemRow[]> {
  const rows = await db
    .select({
      element: elements,
      link: sceneElements,
      imageUrl: playerSceneElementImageUrl("scene_elements", "elements"),
      fogCovered: sceneElementFogCovered("scene_elements", "elements"),
      fogActive: fogActive
        ? sceneElementFogActive("scene_elements", "elements")
        : sql<boolean>`false`,
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
