import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { safeRedirect } from "@/lib/safe-redirect";
import { SceneForm } from "@/components/prep/scene-form";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getStorySceneForEdit } from "../../../libraries/actions";

// A scene's edit form, behind the pencil on its card. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
// sa_getStorySceneForEdit answers null for a scene the caller does not own
// as for one that does not exist, so both land on the not-found page. A
// completed scene has no pencil, and a typed URL gets the not-found page too.
// `from` says where the form was opened from, such as a scene's preview, and
// is where Cancel and a save go back to; a path of this site only.
export default async function EditScenePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  await requireSession();

  const { id } = await params;
  const { from } = await searchParams;
  if (!/^-?\d+$/.test(id)) notFound();
  const idStoryScene = Number(id);

  const [scene, statusOptions] = await Promise.all([
    sa_getStorySceneForEdit(idStoryScene),
    sa_listStatusOptions("story_scenes"),
  ]);
  if (!scene || scene.locked) notFound();

  return (
    <Container maxW="lg" py="8">
      <SceneForm
        idStory={scene.idStory}
        sessions={scene.sessions}
        scene={{ idStoryScene, status: scene.status, values: scene.values }}
        statusOptions={statusOptions}
        returnTo={
          from === undefined ? undefined : safeRedirect(from, `/libraries/${scene.idStory}`)
        }
      />
    </Container>
  );
}
