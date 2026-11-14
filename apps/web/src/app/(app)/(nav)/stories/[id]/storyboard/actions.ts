"use server";

import { and, asc, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentOrFirstUrl, attachmentUrl } from "@/db/attachment-url";
import { sceneItems } from "@/db/scene-items";
import { storyAccess } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import type { PlayScene } from "@/lib/play-scene";
import { toPublicElement, toPublicSceneElement } from "@/lib/realtime/events";
import { SCENE_ELEMENT_HIDDEN } from "@/lib/run";
import { SCENE_LOCKED_STATUS } from "@/lib/scenes";
import { SESSION_DONE_STATUS } from "@/lib/stories";
import {
  STORYBOARD_SESSIONS_PAGE,
  STORYBOARD_UNPLAYED_PAGE,
  type Storyboard,
  type StoryboardScene,
  type StoryboardScenesPage,
  type StoryboardSession,
  type StoryboardSessionCursor,
  type StoryboardSessionsPage,
} from "@/lib/storyboard";

const { stories, storyScenes, storySessions, vStoryScenes, vStorySessions } = schema;

const idSchema = z.int32();
const cursorSchema = z.object({ number: z.number().int(), idStorySession: idSchema });
const offsetSchema = z.number().int().min(0);

/**
 * The story and what the caller may see of it, or null when there is no
 * such story or the caller may not read it: the storyteller and the story's
 * players may, and anyone signed in when the story is public
 * (db/story-access.ts), the two failures one answer so a stranger learns
 * nothing from the difference. The three actions below open the board this
 * way before reading any of it.
 */
async function openBoard(userId: string, idStory: number) {
  const id = idSchema.safeParse(idStory);
  if (!id.success) return null;

  const [story] = await db
    .select({
      idStory: stories.idStory,
      title: stories.title,
      idCreatedByUser: stories.idCreatedByUser,
      isPublic: stories.isPublic,
      imageUrl: attachmentUrl("STORY", "stories", "id_story"),
    })
    .from(stories)
    .where(eq(stories.idStory, id.data))
    .limit(1);
  if (!story) return null;

  const access = await storyAccess(userId, story);
  if (access === null) return null;
  return {
    story,
    isStoryteller: access === "storyteller",
    // The notes and lingering questions are the table's, the storyteller's
    // and the players', and not a public reader's, as on the session page.
    atTheTable: access !== "public",
  };
}

type Board = NonNullable<Awaited<ReturnType<typeof openBoard>>>;

/**
 * The scenes of the board that match `where`, in play order: the finished
 * scenes by their number, then the ones started but not finished by when
 * they went into play, then the ones never run, which have neither. The id
 * last so the order is the same on every load. The storyteller sees every
 * scene; anyone else only the completed ones.
 */
function sceneRows(board: Board, where: SQL | undefined, offset = 0, limit?: number) {
  const query = db
    .select({
      idStoryScene: sql<number>`${vStoryScenes.idStoryScene}`,
      idStorySession: vStoryScenes.idStorySession,
      title: sql<string>`${vStoryScenes.sceneTitle}`,
      description: vStoryScenes.sceneDescription,
      notes: storyScenes.notes,
      status: sql<string>`${vStoryScenes.status}`,
      imageUrl: attachmentOrFirstUrl("STORY_SCENE", "v_story_scenes", "id_story_scene"),
      sceneNumber: vStoryScenes.sceneNumber,
      length: vStoryScenes.length,
    })
    .from(vStoryScenes)
    // The view was built from the scenes table before it had notes, so
    // they come from the table itself.
    .innerJoin(storyScenes, eq(storyScenes.idStoryScene, vStoryScenes.idStoryScene))
    .where(
      and(
        eq(vStoryScenes.idStory, board.story.idStory),
        board.isStoryteller ? undefined : eq(vStoryScenes.status, SCENE_LOCKED_STATUS),
        where,
      ),
    )
    .orderBy(
      sql`${vStoryScenes.sceneNumber} asc nulls last`,
      sql`${vStoryScenes.activeAt} asc nulls last`,
      asc(vStoryScenes.idStoryScene),
    )
    .offset(offset);
  return limit === undefined ? query : query.limit(limit);
}

function card(board: Board, scene: Awaited<ReturnType<typeof sceneRows>>[number]): StoryboardScene {
  return {
    idStoryScene: scene.idStoryScene,
    title: scene.title,
    description: scene.description,
    // The scene's notes are the table's too, as sa_getStoryboardScene keeps them.
    notes: board.atTheTable ? scene.notes : null,
    status: scene.status,
    imageUrl: scene.imageUrl,
    sceneNumber: scene.sceneNumber,
    length: scene.length,
  };
}

/**
 * A page of the board's sittings with their scenes: the latest
 * STORYBOARD_SESSIONS_PAGE, or the ones before `before`, oldest first, and
 * whether there are earlier still. The storyteller sees every sitting;
 * anyone else only the done ones. Read latest first with one row over the
 * page to learn whether more exist, then turned round for the board.
 */
async function sessionsPage(
  board: Board,
  before: StoryboardSessionCursor | null,
): Promise<StoryboardSessionsPage> {
  const rows = await db
    .select({
      idStorySession: sql<number>`${vStorySessions.idStorySession}`,
      number: sql<number>`${vStorySessions.sessionNumber}`.mapWith(Number),
      title: vStorySessions.title,
      status: sql<string>`${vStorySessions.status}`,
      // created_at is nullable in the schema because every audit column
      // is, but the database always stamps it; the type wants a Date.
      startedAt: sql<Date>`${vStorySessions.createdAt}`.mapWith(vStorySessions.createdAt),
      summary: vStorySessions.summary,
      notes: vStorySessions.notes,
      lingeringQuestions: vStorySessions.lingeringQuestions,
    })
    .from(vStorySessions)
    .where(
      and(
        eq(vStorySessions.idStory, board.story.idStory),
        board.isStoryteller ? undefined : eq(vStorySessions.status, SESSION_DONE_STATUS),
        // Before the cursor in the opening order, which is what numbers the
        // sittings; the id orders two opened in one statement.
        before === null
          ? undefined
          : or(
              lt(vStorySessions.sessionNumber, before.number),
              and(
                eq(vStorySessions.sessionNumber, before.number),
                lt(vStorySessions.idStorySession, before.idStorySession),
              ),
            ),
      ),
    )
    .orderBy(desc(vStorySessions.sessionNumber), desc(vStorySessions.idStorySession))
    .limit(STORYBOARD_SESSIONS_PAGE + 1);
  const more = rows.length > STORYBOARD_SESSIONS_PAGE;
  const page = rows.slice(0, STORYBOARD_SESSIONS_PAGE).reverse();

  const scenes =
    page.length === 0
      ? []
      : await sceneRows(
          board,
          inArray(
            vStoryScenes.idStorySession,
            page.map((session) => session.idStorySession),
          ),
        );

  const sessions: StoryboardSession[] = page.map((session) => ({
    ...session,
    notes: board.atTheTable ? session.notes : null,
    lingeringQuestions: board.atTheTable ? session.lingeringQuestions : null,
    scenes: scenes
      .filter((scene) => scene.idStorySession === session.idStorySession)
      .map((scene) => card(board, scene)),
  }));
  return { sessions, more };
}

/**
 * A page of the scenes in no sitting yet, from `offset` in the grid's
 * order, and whether there are more after. The storyteller's alone: empty
 * for anyone else, since the grid is theirs. One row over the page to
 * learn whether more exist.
 */
async function unplayedPage(board: Board, offset: number): Promise<StoryboardScenesPage> {
  if (!board.isStoryteller) return { scenes: [], more: false };
  const rows = await sceneRows(
    board,
    isNull(vStoryScenes.idStorySession),
    offset,
    STORYBOARD_UNPLAYED_PAGE + 1,
  );
  return {
    scenes: rows.slice(0, STORYBOARD_UNPLAYED_PAGE).map((scene) => card(board, scene)),
    more: rows.length > STORYBOARD_UNPLAYED_PAGE,
  };
}

/**
 * The story's storyboard (lib/storyboard.ts): its latest sittings oldest
 * first, each with the scenes played in it in play order, and for the
 * storyteller the first of the scenes in no sitting yet, with a word on
 * whether either has more (sa_getStoryboardSessions, sa_getStoryboardUnplayed
 * fetch them). Null when there is no such story or the caller may not read
 * it (openBoard).
 *
 * What each reader gets follows the rule sa_getStorySession keeps: the
 * storyteller sees every sitting and every scene, since the board is theirs;
 * anyone else sees only the done sittings, and in each only the completed
 * scenes, because until a sitting is done its scenes are prep the players
 * have not been shown, and a scene attached to a sitting but never run stays
 * prep after it.
 */
export async function sa_getStoryboard(idStory: number): Promise<Storyboard | null> {
  const user = await requireAccount();
  const board = await openBoard(user.id, idStory);
  if (!board) return null;

  const [latest, unplayed] = await Promise.all([sessionsPage(board, null), unplayedPage(board, 0)]);
  return {
    idStory: board.story.idStory,
    title: board.story.title,
    imageUrl: board.story.imageUrl,
    isStoryteller: board.isStoryteller,
    sessions: latest.sessions,
    moreSessions: latest.more,
    unplayed: unplayed.scenes,
    moreUnplayed: unplayed.more,
  };
}

/**
 * The STORYBOARD_SESSIONS_PAGE sittings before `before`, the oldest on the
 * board so far, for its More button; who sees which as sa_getStoryboard.
 * Null for a story the caller may not read, or a cursor that is not one.
 */
export async function sa_getStoryboardSessions(
  idStory: number,
  before: StoryboardSessionCursor,
): Promise<StoryboardSessionsPage | null> {
  const user = await requireAccount();
  const cursor = cursorSchema.safeParse(before);
  if (!cursor.success) return null;
  const board = await openBoard(user.id, idStory);
  if (!board) return null;
  return sessionsPage(board, cursor.data);
}

/**
 * The STORYBOARD_UNPLAYED_PAGE unplayed scenes from `offset`, how many the
 * grid holds so far, for its More button; the storyteller's alone, as
 * sa_getStoryboard. Null for a story the caller may not read, or an offset
 * that is not one.
 */
export async function sa_getStoryboardUnplayed(
  idStory: number,
  offset: number,
): Promise<StoryboardScenesPage | null> {
  const user = await requireAccount();
  const from = offsetSchema.safeParse(offset);
  if (!from.success) return null;
  const board = await openBoard(user.id, idStory);
  if (!board) return null;
  return unplayedPage(board, from.data);
}

/**
 * One scene of the board as the players' table would show it, for the
 * card's Elements: its text, its stacks and cover, and its elements with
 * hidden ones left out and each description kept back where its link keeps
 * it back, exactly as sa_getScenePreview reads one. The session is left
 * null, as there: this is the scene, not a sitting. The cover is the card's
 * picture (attachmentOrFirstUrl), so the dialog opens on what the card
 * showed.
 *
 * Who may look follows sa_getStoryboard: the storyteller at any scene of
 * theirs; a player of the story, or anyone signed in when it is public,
 * only at a completed scene of a done sitting. Null otherwise, and for an
 * id that names nothing. The scene's notes are the table's, written there
 * by the players (sa_setPlaySceneText), so a public reader gets the
 * description without them, as they get a session's.
 */
export async function sa_getStoryboardScene(idStoryScene: number): Promise<PlayScene | null> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStoryScene);
  if (!id.success) return null;

  const [row] = await db
    .select({
      idStory: stories.idStory,
      idCreatedByUser: stories.idCreatedByUser,
      isPublic: stories.isPublic,
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
      tags: storyScenes.tags,
      coverUrl: attachmentOrFirstUrl("STORY_SCENE", "story_scenes", "id_story_scene"),
      description: storyScenes.sceneDescription,
      notes: storyScenes.notes,
      sessionStatus: storySessions.status,
    })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .leftJoin(storySessions, eq(storySessions.idStorySession, storyScenes.idStorySession))
    .where(eq(storyScenes.idStoryScene, id.data))
    .limit(1);
  if (!row) return null;

  const access = await storyAccess(user.id, row);
  if (access === null) return null;
  if (
    access !== "storyteller" &&
    (row.status !== SCENE_LOCKED_STATUS || row.sessionStatus !== SESSION_DONE_STATUS)
  ) {
    return null;
  }
  const atTheTable = access !== "public";

  // The scene as it was played, for the storyteller too: a hidden element
  // was never shown at the table, so the board does not show it either.
  const items = await sceneItems(row.idStory, row.idStoryScene, [SCENE_ELEMENT_HIDDEN]);
  return {
    idStorySession: null,
    scene: {
      idStoryScene: row.idStoryScene,
      title: row.title,
      status: row.status,
      text: { description: row.description, notes: atTheTable ? row.notes : null },
    },
    tags: row.tags,
    coverUrl: row.coverUrl,
    items: items.map((item) => ({
      element: toPublicElement(item.element, item.imageUrl, item.link.showInfo),
      sceneElement: toPublicSceneElement(item.link),
    })),
  };
}
