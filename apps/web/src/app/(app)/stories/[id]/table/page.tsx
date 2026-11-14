import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { isUnplayable } from "@/lib/play";
import { sessionHeading } from "@/lib/stories";
import { EMPTY_PLAY_SCENE } from "@/lib/play-scene";
import { PlayCover } from "@/components/play/play-cover";
import { StoryUnavailableDialog } from "@/components/play/story-unavailable-dialog";
import { PassiveTable } from "@/components/table/passive-table";
import { sa_getStorySession } from "@/app/(app)/(nav)/stories/actions";
import { sa_getPlayScene, sa_getPlayStory, sa_joinSession } from "@/components/play/actions";

// The display table: the story's table put up to be read at a distance,
// with nothing on it to press (PassiveTable). Players reach it from the
// Display mode button on their own table, and a guest who came in by the
// join link lands here and has nowhere else to go. Outside (nav), as the
// other tables are, because it draws its own chrome.
//
// It follows /stories/[id]/play in all but two things. The storyteller is
// let in rather than sent to their own table, so they can put this up on a
// shared screen. And a player who comes before the session opens waits in
// this table's own waiting room, which brings them back here rather than to
// the players' table. Anyone else is not found, as there.
export default async function DisplayTablePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  const idStory = parseRouteId(id);
  if (idStory === null) notFound();

  const story = await sa_getPlayStory(idStory);
  if (!story) notFound();

  if (isUnplayable(story)) {
    return (
      <PlayCover title={story.title} imageUrl={story.imageUrl}>
        <StoryUnavailableDialog story={story} />
      </PlayCover>
    );
  }

  if (!story.hasOpenSession && !story.isOwner) redirect(`/stories/${story.idStory}/table/waiting`);
  // A player here is at the session, PRESENT as at the players' table. It
  // does nothing for the storyteller, who is always at their own table.
  await sa_joinSession(story.idStory);

  const [session, scene] = await Promise.all([
    story.hasOpenSession && story.idStorySession !== null
      ? sa_getStorySession(story.idStorySession)
      : null,
    sa_getPlayScene(story.idStory),
  ]);

  return (
    <PassiveTable
      idStory={story.idStory}
      title={story.title}
      session={session ? sessionHeading(session) : null}
      initialScene={scene ?? EMPTY_PLAY_SCENE}
      storyCoverUrl={story.imageUrl}
      isOwner={story.isOwner}
    />
  );
}
