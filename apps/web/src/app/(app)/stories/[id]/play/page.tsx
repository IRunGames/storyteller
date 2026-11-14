import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { isUnplayable } from "@/lib/play";
import { PREP_SESSIONS_PAGE_SIZE, sessionHeading } from "@/lib/stories";
import { PlayCover } from "@/components/play/play-cover";
import { PlayTable } from "@/components/play/play-table";
import { StoryUnavailableDialog } from "@/components/play/story-unavailable-dialog";
import { sa_getStorySession, sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";
import { EMPTY_PLAY_SCENE } from "@/lib/play-scene";
import { sa_getPlayScene, sa_getPlayStory, sa_joinSession } from "@/components/play/actions";

// The table for one story, behind the Play button on a story card and the
// picker on /play. Outside (nav) because the table draws its own header. See
// home/page.tsx for why the page calls requireSession() itself.
//
// This is the players' table. A story the caller neither tells nor plays in
// is not found, and its storyteller is sent on to their own table,
// /stories/[id]/run, which carries the library; links that name
// /stories/[id]/play for any story therefore still take the storyteller to
// the right place.
//
// Two more things can stand in front of a player's table, checked in this
// order. A story that is switched off or archived has no table at all, so
// the player gets the dialog that says so over the story's cover. And a
// player who arrives before the storyteller has opened a session waits in
// the waiting room, which sends them back here once one opens. A player who
// does reach the table is marked PRESENT at the session in session_players.
export default async function PlayTablePage({ params }: { params: Promise<{ id: string }> }) {
  const signedIn = await requireSession();

  const { id } = await params;
  const idStory = parseRouteId(id);
  if (idStory === null) notFound();
  // A guest (someone in by a join link, with no account) has only the
  // display table; the players' table is for accounts.
  if (signedIn.user.isAnonymous) redirect(`/stories/${idStory}/table`);

  const story = await sa_getPlayStory(idStory);
  if (!story) notFound();
  if (story.isOwner) redirect(`/stories/${story.idStory}/run`);

  if (isUnplayable(story)) {
    return (
      <PlayCover title={story.title} imageUrl={story.imageUrl}>
        <StoryUnavailableDialog story={story} />
      </PlayCover>
    );
  }

  if (!story.hasOpenSession) redirect(`/stories/${story.idStory}/play/waiting`);
  // A player coming to the table is PRESENT at its session, whether they
  // came through the waiting room or straight here.
  await sa_joinSession(story.idStory);

  // The header names the session being played, numbered and titled as the
  // story page lists it; with none, it says so.
  // The scene is loaded here so the table shows it on first paint, and kept
  // up to date by the table itself from the story's MQTT topic.
  // The first page of the story's sessions is for the box the play space
  // shows while it is on no scene, as at the storyteller's table.
  const [session, scene, sessions] = await Promise.all([
    story.hasOpenSession && story.idStorySession !== null
      ? sa_getStorySession(story.idStorySession)
      : null,
    sa_getPlayScene(story.idStory),
    sa_listStorySessions(story.idStory, 0, PREP_SESSIONS_PAGE_SIZE),
  ]);

  return (
    <PlayTable
      idStory={story.idStory}
      title={story.title}
      storyCoverUrl={story.imageUrl}
      sessions={sessions}
      session={session ? sessionHeading(session) : null}
      idStorySession={session?.idStorySession ?? null}
      initialScene={scene ?? EMPTY_PLAY_SCENE}
    />
  );
}
