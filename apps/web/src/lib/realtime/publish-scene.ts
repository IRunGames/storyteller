import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sceneElements } from "@/db/schema";
import { currentScene, sceneItem } from "@/db/scene-items";
import { SCENE_ELEMENT_HIDDEN } from "@/lib/run";
import { toPublicElement, toPublicSceneElement, type StoryEvent } from "./events";
import { publishStoryEvent } from "./publish";

// What the storyteller's table tells the players' table after each change it
// writes. Each helper re-reads the rows as committed rather than taking what
// the action had in hand, so what goes out is what the database holds, and
// only for the scene the session is on: a change to any other scene is
// preparation, which the players are not told about.

const stamp = () => new Date().toISOString();

/** Whether the scene is the one the story's playing session is on. */
async function isCurrent(idStory: number, idStoryScene: number): Promise<boolean> {
  const current = await currentScene(idStory);
  return current !== null && current.idStoryScene === idStoryScene;
}

/**
 * An element's link to the current scene as the players may now see it: the
 * element and the link whole, or, for a link that is INVISIBLE or gone, a
 * `removed` with its ids alone, so nothing hidden ever goes over the topic.
 * Nothing when the scene is not the current one.
 */
export async function publishSceneElement(
  idStory: number,
  idStoryScene: number,
  idElement: number,
): Promise<void> {
  if (!(await isCurrent(idStory, idStoryScene))) return;
  const row = await sceneItem(idStory, idStoryScene, idElement);

  const event: StoryEvent =
    row === null || row.link === null || row.link.status === SCENE_ELEMENT_HIDDEN
      ? {
          v: 1,
          at: stamp(),
          idStory,
          type: "scene_element.removed",
          idStoryScene,
          idElement,
          idSceneElement: row?.link?.idSceneElement ?? null,
        }
      : {
          v: 1,
          at: stamp(),
          idStory,
          type: "scene_element.upserted",
          element: toPublicElement(row.element, row.imageUrl, row.link.showInfo),
          sceneElement: toPublicSceneElement(row.link),
        };
  await publishStoryEvent(idStory, event);
}

/**
 * A link's own pictures changed (the attachment actions, which know the
 * link only by its id): the link as the players may now see it, found
 * through its scene and element. Nothing for a link that is gone.
 */
export async function publishSceneElementPictures(
  idStory: number,
  idSceneElement: number,
): Promise<void> {
  const [link] = await db
    .select({ idStoryScene: sceneElements.idStoryScene, idElement: sceneElements.idElement })
    .from(sceneElements)
    .where(eq(sceneElements.idSceneElement, idSceneElement))
    .limit(1);
  if (link) await publishSceneElement(idStory, link.idStoryScene, link.idElement);
}

/**
 * An element changed in the story itself (its fields, status or picture),
 * which shows in the current scene only if it is linked there. Nothing when
 * it is not, or when no scene is being played.
 */
export async function publishElementChanged(idStory: number, idElement: number): Promise<void> {
  const current = await currentScene(idStory);
  if (current === null || current.idStoryScene === null) return;
  await publishSceneElement(idStory, current.idStoryScene, idElement);
}

/**
 * A link deleted from the current scene, said with the ids the deletion
 * returned, since the row is gone. Nothing when the scene is not the current
 * one.
 */
export async function publishSceneElementRemoved(
  idStory: number,
  idStoryScene: number,
  idElement: number,
  idSceneElement: number | null,
): Promise<void> {
  if (!(await isCurrent(idStory, idStoryScene))) return;
  await publishStoryEvent(idStory, {
    v: 1,
    at: stamp(),
    idStory,
    type: "scene_element.removed",
    idStoryScene,
    idElement,
    idSceneElement,
  });
}

/**
 * The table moved to another scene, or the scene's stacks or status changed,
 * or the session itself did: the players' table reloads the scene whole.
 * Said even when nothing is being played (idStoryScene null), so a table
 * open when the session ends hears that it has.
 */
export async function publishSceneChanged(idStory: number): Promise<void> {
  const current = await currentScene(idStory);
  await publishStoryEvent(idStory, {
    v: 1,
    at: stamp(),
    idStory,
    type: "scene.changed",
    idStoryScene: current?.idStoryScene ?? null,
  });
}

/** The session was renamed in the header. */
export async function publishSessionUpdated(
  idStory: number,
  idStorySession: number,
  title: string | null,
): Promise<void> {
  await publishStoryEvent(idStory, {
    v: 1,
    at: stamp(),
    idStory,
    type: "session.updated",
    idStorySession,
    title,
  });
}
