import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { ScenePreview } from "@/components/play/scene-preview";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getScenePreview } from "./actions";

// A look at one scene as the players would see it, keyed on the scene, from
// the eye beside each scene in the storyteller's scene selector. Nothing on
// it can be pressed to change anything, so the storyteller can check a scene
// in another tab without moving their table. Outside (nav) because it draws
// the tables' header, as they do. The story's storyteller and its players
// get in; anyone else gets the same not-found page as a bad id.
export default async function ScenePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  const idStoryScene = parseRouteId(id);
  if (idStoryScene === null) notFound();

  // The scene workflow names each status in the title's dropdown.
  const [preview, statusOptions] = await Promise.all([
    sa_getScenePreview(idStoryScene),
    sa_listStatusOptions("story_scenes"),
  ]);
  if (!preview) notFound();

  return (
    <ScenePreview
      idStory={preview.idStory}
      title={preview.storyTitle}
      scene={preview.scene}
      previous={preview.previous}
      next={preview.next}
      scenes={preview.scenes}
      statusOptions={statusOptions}
      canEdit={preview.isOwner}
    />
  );
}
