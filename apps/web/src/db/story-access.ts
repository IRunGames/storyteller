import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  elements,
  sceneElements,
  stories,
  storyPlayers,
  storyScenes,
  storySessions,
} from "@/db/schema";
import { currentScene } from "@/db/scene-items";
import { SCENE_LOCKED_STATUS, SESSION_PLAYING_STATUSES, SESSION_STATUS } from "@/lib/status";

/**
 * What a session or a played scene needs to know about its story to decide
 * who may read it, as the action's query selects them off the stories row.
 */
export type StoryReadership = {
  idStory: number;
  idCreatedByUser: string | null;
  isPublic: boolean;
  isLookingForPlayers: boolean;
  isActive: boolean;
};

/**
 * How the caller stands to a story: its storyteller, one of its players
 * (a seat in story_players), or a reader of a public story with neither.
 */
export type StoryAccess = "storyteller" | "player" | "public";

/**
 * The readership columns of one story, for an action that has only an id;
 * null when there is no such story.
 */
export async function storyReadership(idStory: number): Promise<StoryReadership | null> {
  const [row] = await db
    .select({
      idStory: stories.idStory,
      idCreatedByUser: stories.idCreatedByUser,
      isPublic: stories.isPublic,
      isLookingForPlayers: stories.isLookingForPlayers,
      isActive: stories.isActive,
    })
    .from(stories)
    .where(eq(stories.idStory, idStory))
    .limit(1);
  return row ?? null;
}

/**
 * Whether, and as whom, the caller may read a story, its sessions and the
 * scenes played in them: null when they may not. The storyteller and the
 * players always may; anyone signed in may when the story is public, or
 * when it is advertised as looking for players while active: the Find list
 * (sa_listLookingForPlayers) shows those cards to every signed-in user and
 * its info popover reads the story back through sa_getStory, so advertising
 * is a public read even while is_public is off. The seat is looked up only
 * when being the storyteller does not settle it. What is read is the
 * action's to decide from the answer: the session's notes are the players'
 * to read too but not a public reader's, and the unplayed scenes are the
 * storyteller's alone (sa_getStorySession, sa_getStoryScene).
 */
export async function storyAccess(
  userId: string,
  story: StoryReadership,
): Promise<StoryAccess | null> {
  if (story.idCreatedByUser === userId) return "storyteller";
  const [seat] = await db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, story.idStory), eq(storyPlayers.idUser, userId)))
    .limit(1);
  if (seat) return "player";
  return story.isPublic || (story.isLookingForPlayers && story.isActive) ? "public" : null;
}

// What the storyteller's actions start with: whether the row they were asked
// to read or change is one of the caller's own story's. Each helper below is
// the one join from a row to its story's creator; the actions used to carry
// ten copies of it under ten names (ownsStory, requireOwnedStory,
// ownedSession, ownedScene, ownedSceneStatus, holderStory...), and some
// forgot the lock on a complete scene. A row that is not there and a row on
// someone else's story are one answer, null, so a stranger learns nothing
// from the difference; the caller says what that means in its own words.

/** A story the caller tells, with what the actions read off it most. */
export type OwnedStory = { idStory: number; idSystem: number | null };

/** The story when the caller is its storyteller; null otherwise, and for no such story. */
export async function ownedStory(userId: string, idStory: number): Promise<OwnedStory | null> {
  const [row] = await db
    .select({ idStory: stories.idStory, idSystem: stories.idSystem })
    .from(stories)
    .where(and(eq(stories.idStory, idStory), eq(stories.idCreatedByUser, userId)))
    .limit(1);
  return row ?? null;
}

/** A scene of a story the caller tells, as a write needs it. */
export type OwnedScene = {
  idStoryScene: number;
  idStory: number;
  title: string;
  description: string | null;
  status: string;
  tags: string[];
  /** The stacks widened to the whole play space (lib/scene-elements.ts stackKey). */
  wideTags: string[];
  idStorySession: number | null;
};

/**
 * Why a scene was refused: it is not the caller's (or not the story's, or
 * not there), or it is complete (SCENE_LOCKED_STATUS) and so takes no
 * change. The two are told apart so the caller can say which, since a
 * storyteller who tries to change a finished scene deserves the real reason.
 */
export type SceneRefusal = "not-yours" | "locked";

export type OwnedSceneResult =
  { ok: true; scene: OwnedScene } | { ok: false; reason: SceneRefusal };

export type OwnedSceneOptions = {
  /** The story the caller says the scene is in; a scene of another story is then not theirs. */
  idStory?: number;
  /**
   * Whether a complete scene is answered rather than refused: for a read, and
   * for the few writes that are allowed on a finished scene (putting the
   * table on it, deleting it). Off by default, so a write refuses the lock
   * unless it says otherwise.
   */
  allowLocked?: boolean;
};

/**
 * The scene when it is a scene of a story the caller tells, and not complete
 * unless `allowLocked` says a complete one will do. The lock lives here so
 * that every write to a scene or to what is in it (its elements, their
 * stat blocks, their pictures, their statuses) refuses the same way.
 */
export async function ownedScene(
  userId: string,
  idStoryScene: number,
  options: OwnedSceneOptions = {},
): Promise<OwnedSceneResult> {
  const [row] = await db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      idStory: storyScenes.idStory,
      title: storyScenes.sceneTitle,
      description: storyScenes.sceneDescription,
      status: storyScenes.status,
      tags: storyScenes.tags,
      wideTags: storyScenes.wideTags,
      idStorySession: storyScenes.idStorySession,
    })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(
      and(
        eq(storyScenes.idStoryScene, idStoryScene),
        eq(stories.idCreatedByUser, userId),
        options.idStory === undefined ? undefined : eq(storyScenes.idStory, options.idStory),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, reason: "not-yours" };
  if (!options.allowLocked && row.status === SCENE_LOCKED_STATUS) {
    return { ok: false, reason: "locked" };
  }
  return { ok: true, scene: row };
}

/** A session of a story the caller tells. */
export type OwnedSession = {
  idStorySession: number;
  idStory: number;
  status: string;
  title: string | null;
};

/**
 * The session when it is a session of a story the caller tells; null
 * otherwise. With `idStory`, held to that story as well.
 */
export async function ownedSession(
  userId: string,
  idStorySession: number,
  options: { idStory?: number } = {},
): Promise<OwnedSession | null> {
  const [row] = await db
    .select({
      idStorySession: storySessions.idStorySession,
      idStory: storySessions.idStory,
      status: storySessions.status,
      title: storySessions.title,
    })
    .from(storySessions)
    .innerJoin(stories, eq(stories.idStory, storySessions.idStory))
    .where(
      and(
        eq(storySessions.idStorySession, idStorySession),
        eq(stories.idCreatedByUser, userId),
        options.idStory === undefined ? undefined : eq(storySessions.idStory, options.idStory),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** An element of a story the caller tells. */
export type OwnedElement = { idElement: number; idStory: number; status: string };

/**
 * The element when it is an element of a story the caller tells; null
 * otherwise. With `idStory`, held to that story as well.
 */
export async function ownedElement(
  userId: string,
  idElement: number,
  options: { idStory?: number } = {},
): Promise<OwnedElement | null> {
  const [row] = await db
    .select({ idElement: elements.idElement, idStory: elements.idStory, status: elements.status })
    .from(elements)
    .innerJoin(stories, eq(stories.idStory, elements.idStory))
    .where(
      and(
        eq(elements.idElement, idElement),
        eq(stories.idCreatedByUser, userId),
        options.idStory === undefined ? undefined : eq(elements.idStory, options.idStory),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** An element's link to a scene of a story the caller tells. */
export type OwnedSceneElement = {
  idSceneElement: number;
  idStoryScene: number;
  idStory: number;
  idElement: number;
  status: string;
  /** The scene's status, which is what locks the link. */
  sceneStatus: string;
};

export type OwnedSceneElementResult =
  { ok: true; link: OwnedSceneElement } | { ok: false; reason: SceneRefusal };

/**
 * The link when its scene is a scene of a story the caller tells, and that
 * scene is not complete unless `allowLocked` says so: a link is part of what
 * a scene holds, so a complete scene's links take no change either. The
 * link's element is held to the story too, since nothing in the database
 * holds a link's two halves to one story. With `idStory` or `idStoryScene`,
 * held to those as well.
 */
export async function ownedSceneElement(
  userId: string,
  idSceneElement: number,
  options: OwnedSceneOptions & { idStoryScene?: number } = {},
): Promise<OwnedSceneElementResult> {
  const [row] = await db
    .select({
      idSceneElement: sceneElements.idSceneElement,
      idStoryScene: sceneElements.idStoryScene,
      idStory: storyScenes.idStory,
      idElement: sceneElements.idElement,
      status: sceneElements.status,
      sceneStatus: storyScenes.status,
    })
    .from(sceneElements)
    .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .innerJoin(elements, eq(elements.idElement, sceneElements.idElement))
    .where(
      and(
        eq(sceneElements.idSceneElement, idSceneElement),
        eq(stories.idCreatedByUser, userId),
        eq(elements.idStory, storyScenes.idStory),
        options.idStory === undefined ? undefined : eq(storyScenes.idStory, options.idStory),
        options.idStoryScene === undefined
          ? undefined
          : eq(sceneElements.idStoryScene, options.idStoryScene),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, reason: "not-yours" };
  if (!options.allowLocked && row.sceneStatus === SCENE_LOCKED_STATUS) {
    return { ok: false, reason: "locked" };
  }
  return { ok: true, link: row };
}

/**
 * The session being played at a story the caller tells, or null: when the
 * story is someone else's, when it has no current session, or when that
 * session is paused or finished. What a write at the table checks, since
 * nothing changes at a paused table.
 */
export async function playingSession(userId: string, idStory: number): Promise<number | null> {
  const [row] = await db
    .select({ idStorySession: storySessions.idStorySession })
    .from(stories)
    .innerJoin(storySessions, eq(storySessions.idStorySession, stories.idStorySession))
    .where(
      and(
        eq(stories.idStory, idStory),
        eq(stories.idCreatedByUser, userId),
        inArray(storySessions.status, SESSION_PLAYING_STATUSES),
      ),
    )
    .limit(1);
  return row?.idStorySession ?? null;
}

/**
 * The story's current session as the table shows it: being played or paused,
 * at a story the caller tells, with the scene it is on. Null when the story
 * is someone else's, has no current session, or that session has ended.
 * Only for reading what the table shows; a write checks playingSession.
 */
export async function shownSession(
  userId: string,
  idStory: number,
): Promise<{ idStorySession: number; idStoryScene: number | null; isPlaying: boolean } | null> {
  const [row] = await db
    .select({
      idStorySession: storySessions.idStorySession,
      idStoryScene: storySessions.idStoryScene,
      status: storySessions.status,
    })
    .from(stories)
    .innerJoin(storySessions, eq(storySessions.idStorySession, stories.idStorySession))
    .where(
      and(
        eq(stories.idStory, idStory),
        eq(stories.idCreatedByUser, userId),
        inArray(storySessions.status, [...SESSION_PLAYING_STATUSES, SESSION_STATUS.SUSPENDED]),
      ),
    )
    .limit(1);
  return row
    ? {
        idStorySession: row.idStorySession,
        idStoryScene: row.idStoryScene,
        isPlaying: SESSION_PLAYING_STATUSES.includes(row.status),
      }
    : null;
}

/**
 * Why a scene's text may not be written: the caller is not at the story's
 * table (or the scene is not the story's), the scene is complete, or, for a
 * player, it is not the scene being played.
 */
export type SceneTextRefusal = SceneRefusal | "not-being-played";

export type WritableSceneResult =
  | { ok: true; scene: OwnedScene; as: "storyteller" | "player" }
  | { ok: false; reason: SceneTextRefusal };

/**
 * Who may write up a scene's description and notes from a table, the
 * storyteller's or the players'. The storyteller may write any scene of
 * theirs (ownedScene, so the same lock), and whether that includes a
 * complete one is the caller's choice, since the pages differ on purpose:
 * the tables let the storyteller add notes to a scene once it is done
 * (`allowLocked`), while the live-edit page and the prep form, which call
 * ownedScene themselves, show a complete scene read only. A player may
 * write only the scene the session is on, and only while it is not
 * complete, which is the one scene their table shows them; `allowLocked`
 * does not reach them. A reader of a public story has no seat and may not
 * write at all.
 */
export async function writableScene(
  userId: string,
  idStory: number,
  idStoryScene: number,
  options: { allowLocked?: boolean } = {},
): Promise<WritableSceneResult> {
  const story = await storyReadership(idStory);
  const access = story === null ? null : await storyAccess(userId, story);
  if (access === null || access === "public") return { ok: false, reason: "not-yours" };

  if (access === "storyteller") {
    const owned = await ownedScene(userId, idStoryScene, { idStory, ...options });
    return owned.ok ? { ok: true, scene: owned.scene, as: "storyteller" } : owned;
  }

  const current = await currentScene(idStory);
  if (current === null || current.idStoryScene !== idStoryScene) {
    return { ok: false, reason: "not-being-played" };
  }
  const [scene] = await db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      idStory: storyScenes.idStory,
      title: storyScenes.sceneTitle,
      description: storyScenes.sceneDescription,
      status: storyScenes.status,
      tags: storyScenes.tags,
      wideTags: storyScenes.wideTags,
      idStorySession: storyScenes.idStorySession,
    })
    .from(storyScenes)
    .where(and(eq(storyScenes.idStoryScene, idStoryScene), eq(storyScenes.idStory, idStory)))
    .limit(1);
  if (!scene) return { ok: false, reason: "not-being-played" };
  if (scene.status === SCENE_LOCKED_STATUS) return { ok: false, reason: "locked" };
  return { ok: true, scene, as: "player" };
}
