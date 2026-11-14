import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { isUnplayable, pickWaitingBackground } from "@/lib/play";
import { WaitingRoom } from "@/components/play/waiting-room";
import { sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";
import { sa_getPlayStory, sa_waitForSession } from "@/components/play/actions";

// Where a player waits for the storyteller to open the table.
// /stories/[id]/play sends them here, and anyone who should not be here —
// the storyteller, a player whose table has opened meanwhile, anyone at a
// story that has been put away — is sent back there to be shown the right
// thing, so the rules for who sees what stay in that one page.
export default async function WaitingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const signedIn = await requireSession();

  const { id } = await params;
  const idStory = parseRouteId(id);
  if (idStory === null) notFound();
  // A guest (someone in by a join link, with no account) has only the
  // display table; the players' table is for accounts.
  if (signedIn.user.isAnonymous) redirect(`/stories/${idStory}/table`);

  const story = await sa_getPlayStory(idStory);
  if (!story) notFound();
  if (story.isOwner || story.hasOpenSession || isUnplayable(story)) {
    redirect(`/stories/${story.idStory}/play`);
  }

  // Put in the room as the page renders, so the count includes the caller on the
  // first paint rather than after the room's first heartbeat.
  const [initial, sessions] = await Promise.all([
    sa_waitForSession(story.idStory),
    sa_listStorySessions(story.idStory, 0),
  ]);
  if (!initial) notFound();

  return (
    <WaitingRoom
      story={story}
      initial={initial}
      sessions={sessions}
      background={pickWaitingBackground()}
    />
  );
}
