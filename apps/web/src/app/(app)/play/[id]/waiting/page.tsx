import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/require-session";
import { isUnplayable, pickWaitingBackground } from "@/lib/play";
import { WaitingRoom } from "@/components/play/waiting-room";
import { sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";
import { sa_getPlayStory, sa_waitForSession } from "../actions";

// The same int4 range as /play/[id]; see there.
const idSchema = z.coerce.number().int().min(-2147483648).max(2147483647);

// Where a player waits for the storyteller to open the table. /play/[id]
// sends them here, and anyone who should not be here — the storyteller, a
// player whose table has opened meanwhile, anyone at a story that has been
// put away — is sent back there to be shown the right thing, so the rules
// for who sees what stay in that one page.
export default async function WaitingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const story = await sa_getPlayStory(id.data);
  if (!story) notFound();
  if (story.isOwner || story.hasOpenSession || isUnplayable(story)) {
    redirect(`/play/${story.idStory}`);
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
