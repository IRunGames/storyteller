import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { storyPlayers } from "@/db/schema";

/**
 * What a session or a played scene needs to know about its story to decide
 * who may read it, as the action's query selects them off the stories row.
 */
export type StoryReadership = {
  idStory: number;
  idCreatedByUser: string | null;
  isPublic: boolean;
};

/**
 * How the caller stands to a story: its storyteller, one of its players
 * (a seat in story_players), or a reader of a public story with neither.
 */
export type StoryAccess = "storyteller" | "player" | "public";

/**
 * Whether, and as whom, the caller may read a story's sessions and the
 * scenes played in them: null when they may not. The storyteller and the
 * players always may; anyone signed in may when the story is public. The
 * seat is looked up only when being the storyteller does not settle it.
 * What is read is the action's to decide from the answer: the session's
 * notes are the players' to read too but not a public reader's, and the
 * unplayed scenes are the storyteller's alone (sa_getStorySession,
 * sa_getStoryScene).
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
  return story.isPublic ? "public" : null;
}
