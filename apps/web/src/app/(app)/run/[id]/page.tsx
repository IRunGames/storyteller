import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/require-session";
import { isUnplayable } from "@/lib/play";
import { PlayCover } from "@/components/play/play-cover";
import { StoryUnavailableDialog } from "@/components/play/story-unavailable-dialog";
import { RunTable } from "@/components/run/run-table";
import { PREP_SESSIONS_PAGE_SIZE } from "@/lib/stories";
import { sa_getStorySession, sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getPlayStory } from "@/app/(app)/play/[id]/actions";
import { sa_startPlaying } from "@/app/(app)/(nav)/play/actions";
import { sa_getSceneToBuild } from "@/app/(app)/(nav)/libraries/actions";
import { sa_getRunPlaySpace } from "./actions";

// The same int4 range as /play/[id]; see there.
const idSchema = z.coerce.number().int().min(-2147483648).max(2147483647);

// The storyteller's table for one story, where Start and Resume land and
// where /play/[id] sends the story's owner. Outside (nav) because the table
// draws its own header, as the player's does. See home/page.tsx for why the
// page calls requireSession() itself.
//
// Only the story's owner gets in: the library down the side is the material
// the players are not meant to see. Anyone else gets the same not-found page
// as a bad id, so a player learns nothing from trying the address. A story
// that is switched off or archived has no table, so its owner gets the
// dialog that says so over the cover, as on /play/[id].
export default async function RunTablePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const story = await sa_getPlayStory(id.data);
  if (!story || !story.isOwner) notFound();

  if (isUnplayable(story)) {
    return (
      <PlayCover title={story.title} imageUrl={story.imageUrl}>
        <StoryUnavailableDialog story={story} />
      </PlayCover>
    );
  }

  // The play space opens on the scene the session is on, with its elements;
  // the scene workflow names each status in the play space's scene selector,
  // and the session workflow the chip beside the session in the header.
  //
  // The story's current session is loaded whether it is being played or
  // paused: a pause is a break at the table, and the session chip is where
  // it is resumed, so a reload during one must keep the chip. Only an ended
  // session leaves the table with none.
  //
  // The first page of the story's sessions is for the box the play space
  // shows while it is on no scene, the library's Timeline folded away.
  const [
    currentSession,
    initialSpace,
    sceneStatusOptions,
    sessionStatusOptions,
    sessions,
    buildSceneId,
  ] = await Promise.all([
    story.idStorySession !== null ? sa_getStorySession(story.idStorySession) : null,
    sa_getRunPlaySpace(story.idStory),
    sa_listStatusOptions("story_scenes"),
    sa_listStatusOptions("story_sessions"),
    sa_listStorySessions(story.idStory, 0, PREP_SESSIONS_PAGE_SIZE),
    // Where the title menu's Build scenes goes.
    sa_getSceneToBuild(story.idStory),
  ]);
  const session = currentSession?.status === "DONE" ? null : currentSession;

  // A table with no session is a table nothing can be said at, so arriving
  // without one starts a new session here and now, as the Play button's
  // "new session" does, and comes back to this page with it: the action
  // redirects to the table once the story holds the session. Only a refusal
  // comes back, and then the table opens as it stood, with none.
  if (session === null) await sa_startPlaying(story.idStory, null);

  return (
    <RunTable
      idStory={story.idStory}
      title={story.title}
      buildSceneId={buildSceneId}
      storyCoverUrl={story.imageUrl}
      isOwner={story.isOwner}
      sessions={sessions}
      session={
        session
          ? {
              idStorySession: session.idStorySession,
              number: session.number,
              title: session.title,
              status: session.status,
            }
          : null
      }
      initialSpace={initialSpace}
      sceneStatusOptions={sceneStatusOptions}
      sessionStatusOptions={sessionStatusOptions}
    />
  );
}
