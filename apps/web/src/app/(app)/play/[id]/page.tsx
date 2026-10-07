import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/require-session";
import { isUnplayable } from "@/lib/play";
import { sessionHeading } from "@/lib/stories";
import { PlayCover } from "@/components/play/play-cover";
import { PlayTable } from "@/components/play/play-table";
import { StoryUnavailableDialog } from "@/components/play/story-unavailable-dialog";
import { sa_getStorySession } from "@/app/(app)/(nav)/stories/actions";
import { sa_getPlayStory, sa_joinSession } from "./actions";

// stories.id_story is int4, and a seed story has a negative id, so anything that
// parses to an int in that range is a candidate; the rest is a 404 rather
// than a query error later on.
const idSchema = z.coerce.number().int().min(-2147483648).max(2147483647);

// The table for one story, behind the Play button on a story card and the
// picker on /play. Outside (nav) because the table draws its own header. See
// home/page.tsx for why the page calls requireSession() itself.
//
// Three things can stand in front of the table, checked in this order. A
// story the caller neither tells nor plays in is not found. A story that is
// switched off or archived has no table at all, so everyone, storyteller or
// player, gets the dialog that says so over the story's cover. And a player
// who arrives before the storyteller has opened a session waits in the
// waiting room, which sends them back here once one opens; the storyteller
// is the one who opens it, so they always come straight in. A player who
// does reach the table is marked PRESENT at the session in session_players.
export default async function PlayTablePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const story = await sa_getPlayStory(id.data);
  if (!story) notFound();

  if (isUnplayable(story)) {
    return (
      <PlayCover title={story.title} imageUrl={story.imageUrl}>
        <StoryUnavailableDialog story={story} />
      </PlayCover>
    );
  }

  if (!story.isOwner) {
    if (!story.hasOpenSession) redirect(`/play/${story.idStory}/waiting`);
    // A player coming to the table is PRESENT at its session, whether they
    // came through the waiting room or straight here.
    await sa_joinSession(story.idStory);
  }

  // The header names the session being played, numbered and titled as the
  // story page lists it; with none, it says so.
  const session =
    story.hasOpenSession && story.idStorySession !== null
      ? await sa_getStorySession(story.idStorySession)
      : null;

  return <PlayTable title={story.title} session={session ? sessionHeading(session) : null} />;
}
