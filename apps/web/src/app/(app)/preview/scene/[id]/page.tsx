import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { scenePreviewPath } from "@/lib/scenes";
import { sa_getScenePreview } from "@/app/(app)/stories/[id]/scenes/[idScene]/preview/actions";

// The scene preview's old address, kept so a link or bookmark made before
// the preview moved beside the scene's other pages still lands on it. The
// scene names its story, which the new address needs; whoever may not see
// the preview gets the not-found page there and here alike.
export default async function OldScenePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  const idStoryScene = parseRouteId(id);
  if (idStoryScene === null) notFound();

  const preview = await sa_getScenePreview(idStoryScene);
  if (!preview) notFound();
  redirect(scenePreviewPath(preview.idStory, idStoryScene));
}
