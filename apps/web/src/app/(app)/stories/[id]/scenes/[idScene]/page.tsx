import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { LiveTable } from "@/components/live/live-table";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getPlayStory } from "@/components/play/actions";
import { sa_getScenePlaySpace } from "@/components/run/actions";
import { sa_getStorySceneForEdit } from "@/components/prep/actions";

// A scene's live-edit page, where the pencil on the library's scene cards
// goes. Outside (nav) because it draws its own header, as
// /stories/[id]/run does. See home/page.tsx for why the page calls
// requireSession() itself.
//
// Only the story's storyteller gets in: sa_getStorySceneForEdit answers null
// for anyone else, as for a scene that is not there, and both get the
// not-found page. So does a scene under another story's id, since the
// address names the story the scene belongs to. A complete scene opens too,
// locked, as the run page shows one; its status chip is how it is moved
// back. No session need be running: this is the scene being prepared, not
// played.
export default async function LiveScenePage({
  params,
}: {
  params: Promise<{ id: string; idScene: string }>;
}) {
  const signedIn = await requireSession();
  // A guest (someone in by a join link, with no account) is turned away
  // here, before the actions, because requireAccount() throws for a guest,
  // which would be the error page rather than not-found.
  if (signedIn.user.isAnonymous) notFound();

  const { id, idScene } = await params;
  const idStory = parseRouteId(id);
  const idStoryScene = parseRouteId(idScene);
  if (idStory === null || idStoryScene === null) notFound();

  const scene = await sa_getStorySceneForEdit(idStoryScene);
  if (!scene || scene.idStory !== idStory) notFound();

  const [story, space, sceneStatusOptions] = await Promise.all([
    sa_getPlayStory(scene.idStory),
    sa_getScenePlaySpace(scene.idStory, idStoryScene),
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
