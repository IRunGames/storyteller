import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/require-session";
import { ScenePreview } from "@/components/play/scene-preview";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getScenePreview } from "./actions";

// The same int4 range as /play/[id]; see there.
const idSchema = z.coerce.number().int().min(-2147483648).max(2147483647);

// A look at one scene as the players would see it, keyed on the scene, from
// the eye beside each scene in the storyteller's scene selector. Nothing on
// it can be pressed to change anything, so the storyteller can check a scene
// in another tab without moving their table. Outside (nav) because it draws
// the tables' header, as they do. The story's storyteller and its players
// get in; anyone else gets the same not-found page as a bad id.
export default async function ScenePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  // The scene workflow names each status in the title's dropdown.
  const [preview, statusOptions] = await Promise.all([
    sa_getScenePreview(id.data),
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
