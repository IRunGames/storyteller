import { ELEMENT_KINDS } from "@/lib/elements";
import type { PublicElement, PublicSceneElement, StoryEvent } from "@/lib/realtime/events";
import type { SceneText } from "@/lib/scenes";
import {
  DEFAULT_ELEMENT_SHOWING,
  isElementShowing,
  pillLink,
  pillText,
  SCENE_ELEMENT_HIDDEN,
  type PlayItem,
} from "@/lib/run";

// The players' play space: what /play/[id] loads of the scene being played,
// and how each message on the story's state topic changes it. No React
// here; the hooks in components/play call applyStoryEvent and keep the
// result.

/** One element in the scene as the players see it: the element and its link, as published. */
export type PlaySceneItem = { element: PublicElement; sceneElement: PublicSceneElement };

/** The scene being played, as the players' table holds it. */
export type PlayScene = {
  /** The session being played, or null when none is. */
  idStorySession: number | null;
  /** The scene the session is on, with its description and notes, or null when it is on none. */
  scene: { idStoryScene: number; title: string; status: string; text: SceneText } | null;
  /** The scene's tags, one stack each. */
  tags: string[];
  coverUrl: string | null;
  /** The elements the players may see, in the storyteller's order. */
  items: PlaySceneItem[];
};

export const EMPTY_PLAY_SCENE: PlayScene = {
  idStorySession: null,
  scene: null,
  tags: [],
  coverUrl: null,
  items: [],
};

/**
 * An item as a pill shows it, keyed and labelled as the storyteller's
 * linkedItem keys and labels its own, so playStacks files it the same way.
 * The description goes on the pill as `info` only when the link's show_info
 * lets the players see it; the pill never looks at the element itself.
 */
export function toPlayItem({ element, sceneElement }: PlaySceneItem): PlayItem {
  const fields = {
    initial_name: element.initialName,
    name: element.name,
    title: element.title,
  };
  const showing = isElementShowing(sceneElement.elementShowing)
    ? sceneElement.elementShowing
    : DEFAULT_ELEMENT_SHOWING;
  const { label, detail } = pillText(fields, showing);
  return {
    key: `${element.kind}:${element.idElement}`,
    kind: element.kind as PlayItem["kind"],
    label,
    detail,
    imageUrl: element.imageUrl,
    sceneTags: sceneElement.tags,
    sceneStatus: sceneElement.status,
    showInfo: sceneElement.showInfo,
    info: sceneElement.showInfo ? element.description : null,
    link: pillLink(sceneElement, element),
    fields,
    showing,
  };
}

const kindOrder = (kind: string) => ELEMENT_KINDS.indexOf(kind as (typeof ELEMENT_KINDS)[number]);

/** The storyteller's order: by kind, People to Ephemera, then by name, then by id. */
export function sortPlaySceneItems(items: PlaySceneItem[]): PlaySceneItem[] {
  return [...items].sort(
    (a, b) =>
      kindOrder(a.element.kind) - kindOrder(b.element.kind) ||
      a.element.name.localeCompare(b.element.name) ||
      a.element.idElement - b.element.idElement,
  );
}

/** Whether an incoming row is older than the one held, by updated_at; a missing stamp counts as new. */
function staler(incoming: string | null, held: string | null): boolean {
  return incoming !== null && held !== null && incoming < held;
}

/**
 * The scene after one message from the topic. A `refetch` says the message
 * described more than the scene in hand can absorb, and the table should
 * load the scene afresh: a change of scene, or an element of a scene other
 * than the one held, which means a change of scene the table has not heard
 * of yet. An upsert older than what is held, on both its rows, is a message
 * that arrived late and is dropped.
 */
export function applyStoryEvent(
  scene: PlayScene,
  event: StoryEvent,
): { scene: PlayScene; refetch: boolean } {
  switch (event.type) {
    case "scene.changed":
      return { scene, refetch: true };
    case "session.updated":
      return { scene, refetch: false };
    case "scene_element.upserted": {
      if (scene.scene === null || event.sceneElement.idStoryScene !== scene.scene.idStoryScene) {
        return { scene, refetch: true };
      }
      // A hidden link is never published whole, but the check costs nothing
      // and keeps the table honest if one ever is.
      if (event.sceneElement.status === SCENE_ELEMENT_HIDDEN) {
        return { scene: without(scene, event.element.idElement), refetch: false };
      }
      const held = scene.items.find((item) => item.element.idElement === event.element.idElement);
      if (
        held &&
        staler(event.element.updatedAt, held.element.updatedAt) &&
        staler(event.sceneElement.updatedAt, held.sceneElement.updatedAt)
      ) {
        return { scene, refetch: false };
      }
      const item = { element: event.element, sceneElement: event.sceneElement };
      const rest = scene.items.filter((it) => it.element.idElement !== event.element.idElement);
      return { scene: { ...scene, items: sortPlaySceneItems([...rest, item]) }, refetch: false };
    }
    case "scene_element.removed": {
      if (scene.scene === null || event.idStoryScene !== scene.scene.idStoryScene) {
        return { scene, refetch: false };
      }
      return { scene: without(scene, event.idElement), refetch: false };
    }
  }
}

function without(scene: PlayScene, idElement: number): PlayScene {
  if (!scene.items.some((item) => item.element.idElement === idElement)) return scene;
  return { ...scene, items: scene.items.filter((item) => item.element.idElement !== idElement) };
}
