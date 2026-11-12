import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sceneElements } from "@/db/schema";
import { currentScene, sceneLink, sceneLinksOf } from "@/db/scene-items";
import { SCENE_ELEMENT_HIDDEN } from "@/lib/run";
import {
  toPublicElement,
  toPublicSceneElement,
  type ScenePulseCustom,
  type StoryEvent,
} from "./events";
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
 * A link of the current scene as the players may now see it: the element
 * and the link whole, or, for a link that is INVISIBLE, a `removed` with its
 * ids alone, so nothing hidden ever goes over the topic. Links are named by
 * their own id, since an element may be in a scene more than once. Nothing
 * when the scene is not the current one, or the link is gone (a deletion
 * says so itself, publishSceneElementRemoved).
 */
export async function publishSceneElement(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
): Promise<void> {
  if (!(await isCurrent(idStory, idStoryScene))) return;
  const row = await sceneLink(idStory, idSceneElement);
  if (row === null || row.link.idStoryScene !== idStoryScene) return;

  const event: StoryEvent =
    row.link.status === SCENE_ELEMENT_HIDDEN
      ? {
          v: 1,
          at: stamp(),
          idStory,
          type: "scene_element.removed",
          idStoryScene,
          idElement: row.element.idElement,
          idSceneElement,
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
 * A pulse about one link of the current scene (the storyteller's tack
 * opening its picture on the players' table, say): sent as given, since
 * nothing was written for it and there is no row to re-read. Whether the
 * action is one the players answer is the caller's to check. Nothing when
 * the scene is not the current one, or the link is not in it.
 */
export async function publishSceneElementPulse(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
  custom: ScenePulseCustom,
): Promise<void> {
  if (!(await isCurrent(idStory, idStoryScene))) return;
  const [link] = await db
    .select({ idElement: sceneElements.idElement })
    .from(sceneElements)
    .where(
      and(
        eq(sceneElements.idSceneElement, idSceneElement),
        eq(sceneElements.idStoryScene, idStoryScene),
      ),
    )
    .limit(1);
  if (!link) return;
  await publishStoryEvent(idStory, {
    v: 1,
    at: stamp(),
    idStory,
    type: "scene_element.custom",
    idStoryScene,
    idElement: link.idElement,
    idSceneElement,
    custom,
  });
}

/**
 * A link's own pictures changed (the attachment actions, which know the
 * link only by its id): the link as the players may now see it. Nothing for
 * a link that is gone.
 */
export async function publishSceneElementPictures(
  idStory: number,
  idSceneElement: number,
): Promise<void> {
  const [link] = await db
    .select({ idStoryScene: sceneElements.idStoryScene })
    .from(sceneElements)
    .where(eq(sceneElements.idSceneElement, idSceneElement))
    .limit(1);
  if (link) await publishSceneElement(idStory, link.idStoryScene, idSceneElement);
}

/**
 * An element changed in the story itself (its fields, status or picture),
 * which shows in the current scene through each of its links there. Nothing
 * when it has none, or when no scene is being played.
 */
export async function publishElementChanged(idStory: number, idElement: number): Promise<void> {
  const current = await currentScene(idStory);
  if (current === null || current.idStoryScene === null) return;
  for (const idSceneElement of await sceneLinksOf(current.idStoryScene, idElement)) {
    await publishSceneElement(idStory, current.idStoryScene, idSceneElement);
  }
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
