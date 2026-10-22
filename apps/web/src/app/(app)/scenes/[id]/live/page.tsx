import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/require-session";
import { LiveTable } from "@/components/live/live-table";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getPlayStory } from "@/app/(app)/play/[id]/actions";
import { sa_getScenePlaySpace } from "@/app/(app)/run/[id]/actions";
import { sa_getStorySceneForEdit } from "@/app/(app)/(nav)/libraries/actions";

// The same int4 range as /run/[id]; see there.
const idSchema = z.coerce.number().int().min(-2147483648).max(2147483647);

// A scene's live-edit page, where the pencil on the library's scene cards
// goes. Outside (nav) because it draws its own header, as /run/[id] does.
// See home/page.tsx for why the page calls requireSession() itself.
//
// Only the story's storyteller gets in: sa_getStorySceneForEdit answers null
// for anyone else, as for a scene that is not there, and both get the
// not-found page. A complete scene opens too, locked, as the run page shows
// one; its status chip is how it is moved back. No session need be running:
// this is the scene being prepared, not played.
export default async function LiveScenePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const scene = await sa_getStorySceneForEdit(id.data);
  if (!scene) notFound();

  const [story, space, sceneStatusOptions] = await Promise.all([
    sa_getPlayStory(scene.idStory),
    sa_getScenePlaySpace(scene.idStory, id.data),
    sa_listStatusOptions("story_scenes"),
  ]);
  if (!story || !story.isOwner || !space.scene) notFound();

  return (
    <LiveTable
      idStory={scene.idStory}
      title={story.title}
      scene={space.scene}
      initialTags={space.tags}
      initialCoverUrl={space.coverUrl}
      initialInPlay={space.inPlay}
      sessions={scene.sessions}
      idStorySession={scene.values.idStorySession}
      sceneStatusOptions={sceneStatusOptions}
    />
  );
}
