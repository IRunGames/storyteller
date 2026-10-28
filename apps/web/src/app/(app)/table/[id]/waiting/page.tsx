import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/require-session";
import { isUnplayable, pickWaitingBackground } from "@/lib/play";
import { WaitingRoom } from "@/components/play/waiting-room";
import { sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";
import { sa_getPlayStory, sa_waitForSession } from "@/app/(app)/play/[id]/actions";

// The same int4 range as /play/[id]; see there.
const idSchema = z.coerce.number().int().min(-2147483648).max(2147483647);

// The display table's waiting room: the players' one (play/[id]/waiting),
// handing over to /table/[id] when the table opens, so someone who chose
// the display table, or a guest, who has only that one, comes back to it.
// Anyone who should not be waiting is sent to /table/[id] to be shown the
// right thing, as the players' room sends them to /play/[id].
export default async function DisplayWaitingRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();

  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const story = await sa_getPlayStory(id.data);
  if (!story) notFound();
  if (story.isOwner || story.hasOpenSession || isUnplayable(story)) {
    redirect(`/table/${story.idStory}`);
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
      tableHref={`/table/${story.idStory}`}
    />
  );
}
