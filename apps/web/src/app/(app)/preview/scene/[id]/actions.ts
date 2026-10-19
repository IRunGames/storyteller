"use server";

import { and, eq, exists, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { sceneItems } from "@/db/scene-items";
import { requireUser } from "@/lib/authorize";
import type { PlayScene } from "@/lib/play-scene";
import { toPublicElement, toPublicSceneElement } from "@/lib/realtime/events";
import { SCENE_ELEMENT_HIDDEN } from "@/lib/run";

const { stories, storyPlayers, storyScenes } = schema;

// story_scenes.id_story_scene is int4; an id outside that range is a query
// error to Postgres rather than a missing row, so it is turned away first.
const idSchema = z.number().int().min(-2147483648).max(2147483647);

/** What /preview/scene/[id] shows: whose scene it is, and the scene as the players' table holds one. */
export type ScenePreview = { idStory: number; storyTitle: string; scene: PlayScene };

/**
 * One scene as the players' table would show it, for looking at without
 * being at a table: its text, its stacks and cover, and its elements with
 * hidden ones left out and each element's description kept back where the
 * link keeps it back, exactly as sa_getPlayScene reads the scene being
 * played. The session is left null: a preview is of the scene, not of a
 * sitting. Null when there is no such scene or the caller is neither the
 * story's storyteller nor one of its players, the two cases one answer for
 * the reason loadPlayStory gives.
 */
export async function sa_getScenePreview(idStoryScene: number): Promise<ScenePreview | null> {
  const user = await requireUser();
  const id = idSchema.safeParse(idStoryScene);
  if (!id.success) return null;

  const seated = exists(
    db
      .select({ one: storyPlayers.idStoryPlayer })
      .from(storyPlayers)
      .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, user.id))),
  );
  const [row] = await db
    .select({
      idStory: stories.idStory,
      storyTitle: stories.title,
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
      tags: storyScenes.tags,
      coverUrl: attachmentUrl("STORY_SCENE", "story_scenes", "id_story_scene"),
      description: storyScenes.sceneDescription,
      notes: storyScenes.notes,
    })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(
      and(eq(storyScenes.idStoryScene, id.data), or(eq(stories.idCreatedByUser, user.id), seated)),
    )
    .limit(1);
  if (!row) return null;

  const rows = await sceneItems(row.idStory, row.idStoryScene, [SCENE_ELEMENT_HIDDEN]);
  return {
    idStory: row.idStory,
    storyTitle: row.storyTitle,
    scene: {
      idStorySession: null,
      scene: {
        idStoryScene: row.idStoryScene,
        title: row.title,
        status: row.status,
        text: { description: row.description, notes: row.notes },
      },
      tags: row.tags,
      coverUrl: row.coverUrl,
      items: rows.map((item) => ({
        element: toPublicElement(item.element, item.imageUrl, item.link.showInfo),
        sceneElement: toPublicSceneElement(item.link),
      })),
    },
  };
}
