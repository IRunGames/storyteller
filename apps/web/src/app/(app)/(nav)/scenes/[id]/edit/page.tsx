import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { SceneForm } from "@/components/prep/scene-form";
import { sa_getStorySceneForEdit } from "../../../libraries/actions";

// A scene's edit form, behind the pencil on its card. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
// sa_getStorySceneForEdit answers null for a scene the caller does not own
// as for one that does not exist, so both land on the not-found page. A
// completed scene has no pencil, and a typed URL gets the not-found page too.
export default async function EditScenePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  if (!/^-?\d+$/.test(id)) notFound();
  const idStoryScene = Number(id);

  const scene = await sa_getStorySceneForEdit(idStoryScene);
  if (!scene || scene.locked) notFound();

  return (
    <Container maxW="lg" py="8">
      <SceneForm
        idStory={scene.idStory}
        sessions={scene.sessions}
        scene={{ idStoryScene, values: scene.values }}
      />
    </Container>
  );
}
