import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { SceneForm } from "@/components/prep/scene-form";
import { sa_getStory } from "../../../../stories/actions";
import { sa_listSceneSessionOptions } from "../../../actions";

// The New scene form, behind the + on the Prep Work board's Scenes column.
// requireSession() here rather than trusting the group layout; see
// lib/require-session.ts for why. Only the storyteller adds scenes, so
// anyone else gets the not-found page the board itself would give them.
export default async function NewScenePage({ params }: { params: Promise<{ id_story: string }> }) {
  await requireSession();

  const { id_story } = await params;
  if (!/^-?\d+$/.test(id_story)) notFound();
  const idStory = Number(id_story);

  const [story, sessions] = await Promise.all([
    sa_getStory(idStory),
    sa_listSceneSessionOptions(idStory),
  ]);
  if (!story || !story.isOwner) notFound();

  return (
    <Container maxW="lg" py="8">
      <SceneForm idStory={idStory} storyTitle={story.title} sessions={sessions} />
    </Container>
  );
}
