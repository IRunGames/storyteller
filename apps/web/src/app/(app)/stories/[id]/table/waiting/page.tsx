import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { isUnplayable, pickWaitingBackground } from "@/lib/play";
import { WaitingRoom } from "@/components/play/waiting-room";
import { sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";
import { sa_getPlayStory, sa_waitForSession } from "@/components/play/actions";

// The display table's waiting room: the players' one
// (stories/[id]/play/waiting), handing over to /stories/[id]/table when the
// table opens, so someone who chose the display table, or a guest, who has
// only that one, comes back to it. Anyone who should not be waiting is sent
// to /stories/[id]/table to be shown the right thing, as the players' room
// sends them to /stories/[id]/play.
export default async function DisplayWaitingRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();

  const { id } = await params;
  const idStory = parseRouteId(id);
  if (idStory === null) notFound();

  const story = await sa_getPlayStory(idStory);
  if (!story) notFound();
  if (story.isOwner || story.hasOpenSession || isUnplayable(story)) {
    redirect(`/stories/${story.idStory}/table`);
  }

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
      tableHref={`/stories/${story.idStory}/table`}
    />
  );
}
