import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { ScenePreview } from "./scene-preview";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getScenePreview } from "./actions";

// An annotated picture's players' copy is rendered after the annotator's
// save has answered, in this page's function, for up to the render's claim
// (RENDER_CLAIM_SECONDS in lib/annotations.ts; lib/players-copy-time.test.ts
// holds the two together).
export const maxDuration = 60;

// A look at one scene as the players would see it, beside the scene's edit
// and info pages, from the eye beside each scene in the storyteller's scene
// selector. Nothing on it can be pressed to change anything, so the
// storyteller can check a scene in another tab without moving their table;
// the storyteller may annotate a pill's picture from its preview. Outside
// (nav) because it draws the tables' header, as they do. The story's
// storyteller and its players get in; anyone else gets the same not-found
// page as a bad id, as does a scene under another story's id, since the
// address names the story the scene belongs to.
export default async function ScenePreviewPage({
  params,
}: {
  params: Promise<{ id: string; idScene: string }>;
}) {
  await requireSession();

  const { id, idScene } = await params;
  const idStory = parseRouteId(id);
  const idStoryScene = parseRouteId(idScene);
  if (idStory === null || idStoryScene === null) notFound();

  // The scene workflow names each status in the title's dropdown.
  const [preview, statusOptions] = await Promise.all([
    sa_getScenePreview(idStoryScene),
    sa_listStatusOptions("story_scenes"),
  ]);
  if (!preview || preview.idStory !== idStory) notFound();

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
