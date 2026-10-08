import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/require-session";
import { isUnplayable } from "@/lib/play";
import { sessionHeading } from "@/lib/stories";
import { PlayCover } from "@/components/play/play-cover";
import { StoryUnavailableDialog } from "@/components/play/story-unavailable-dialog";
import { RunTable } from "@/components/run/run-table";
import { sa_getStorySession } from "@/app/(app)/(nav)/stories/actions";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getPlayStory } from "@/app/(app)/play/[id]/actions";
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
  // the scene workflow names each status in the header's scene selector.
  const [session, initialSpace, sceneStatusOptions] = await Promise.all([
    story.hasOpenSession && story.idStorySession !== null
      ? sa_getStorySession(story.idStorySession)
      : null,
    sa_getRunPlaySpace(story.idStory),
    sa_listStatusOptions("story_scenes"),
  ]);

  return (
    <RunTable
      idStory={story.idStory}
      title={story.title}
      session={session ? sessionHeading(session) : null}
      initialSpace={initialSpace}
      sceneStatusOptions={sceneStatusOptions}
    />
  );
}
