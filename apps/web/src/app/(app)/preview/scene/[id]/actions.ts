"use server";

import { and, eq, exists, or } from "drizzle-orm";
import { sessionHeadingOf } from "@/lib/stories";
import { idSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { sceneItems } from "@/db/scene-items";
import { requireAccount } from "@/lib/authorize";
import type { PlayScene } from "@/lib/play-scene";
import { toPublicElement, toPublicSceneElement } from "@/lib/realtime/events";
import { SCENE_ELEMENT_HIDDEN } from "@/lib/scene-elements";
import { SCENE_LOCKED_STATUS } from "@/lib/status";

const { stories, storyPlayers, storyScenes, vStoryScenes } = schema;

/** A scene of the story, for the chevrons round the title and the title's dropdown. */
export type SceneNeighbour = {
  idStoryScene: number;
  title: string;
  /** As the database has it, a story_scenes workflow key. */
  status: string;
  /** The sitting it was played in, "3. Kildealg", or null while it waits. */
  sessionHeading: string | null;
};

/**
 * What /preview/scene/[id] shows: whose scene it is, the scene as the
 * players' table holds one, every scene of the story for the title's
 * dropdown, and the scenes either side of it in that same list.
 */
export type ScenePreview = {
  idStory: number;
  storyTitle: string;
  /** Whether the caller tells the story, and so may edit the scene from here. */
  isOwner: boolean;
  scene: PlayScene;
  previous: SceneNeighbour | null;
  next: SceneNeighbour | null;
  scenes: SceneNeighbour[];
};

/**
 * One scene as the players' table would show it, for looking at without
 * being at a table: its text, its stacks and cover, and its elements with
 * hidden ones left out and each element's description kept back where the
 * link keeps it back, exactly as sa_getPlayScene reads the scene being
 * played. The session is left null: a preview is of the scene, not of a
 * sitting.
 *
 * With it, the story's scenes as the title's dropdown lists them: by
 * sitting, the newest first, and within a sitting by scene number, the
 * latest first, a scene not yet finished (no number) above the finished
 * ones of its sitting; scenes with no sitting last, the most recently
 * played first. The chevrons step through that one list, so `previous` is
 * the entry below the scene and `next` the entry above, and the list is
 * the whole of the order. A player's list holds only the scenes played to
 * completion, and a player asking for any other scene gets null: a scene
 * still waiting or in play is prep, the storyteller's alone, as the prep
 * board's reads keep it (components/prep/actions.ts), so neither the
 * dropdown nor the chevrons may name it. Null too when there is no such
 * scene or the caller is neither the story's storyteller nor one of its
 * players, the cases one answer for the reason loadPlayStory gives.
 */
export async function sa_getScenePreview(idStoryScene: number): Promise<ScenePreview | null> {
  const user = await requireAccount();
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
      isOwner: eq(stories.idCreatedByUser, user.id).mapWith(Boolean),
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
  if (!row.isOwner && row.status !== SCENE_LOCKED_STATUS) return null;

  const [rows, all] = await Promise.all([
    sceneItems(row.idStory, row.idStoryScene, [SCENE_ELEMENT_HIDDEN]),
    // Every scene of the story; a story has few enough that they are put in
    // order here, where the rule is easier to read than in SQL, and the
    // neighbours picked out of the one list.
    db
      .select({
        idStoryScene: vStoryScenes.idStoryScene,
        title: vStoryScenes.sceneTitle,
        status: vStoryScenes.status,
        sessionNumber: vStoryScenes.sessionNumber,
        sessionTitle: vStoryScenes.sessionTitle,
        sceneNumber: vStoryScenes.sceneNumber,
        activeAt: vStoryScenes.activeAt,
      })
      .from(vStoryScenes)
      .where(
        and(
          eq(vStoryScenes.idStory, row.idStory),
          row.isOwner ? undefined : eq(vStoryScenes.status, SCENE_LOCKED_STATUS),
        ),
      ),
  ]);
  const scenes = all
    .slice()
    .sort(
      (a, b) =>
        descNullsLast(a.sessionNumber, b.sessionNumber) ||
        descNullsFirst(a.sceneNumber, b.sceneNumber) ||
        descNullsLast(a.activeAt?.getTime() ?? null, b.activeAt?.getTime() ?? null) ||
        (b.idStoryScene ?? 0) - (a.idStoryScene ?? 0),
    )
    .map((scene) => ({
      idStoryScene: scene.idStoryScene!,
      title: scene.title ?? "",
      status: scene.status ?? "",
      sessionHeading: sessionHeadingOf(scene),
    }));
  const at = scenes.findIndex((scene) => scene.idStoryScene === row.idStoryScene);
  return {
    idStory: row.idStory,
    storyTitle: row.storyTitle,
    isOwner: row.isOwner,
    previous: at >= 0 ? (scenes[at + 1] ?? null) : null,
    next: at > 0 ? scenes[at - 1] : null,
    scenes,
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

/** Higher first; a null after every number. */
function descNullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/** Higher first; a null before every number. */
function descNullsFirst(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return b - a;
}
