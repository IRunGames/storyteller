import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { ScenePageDetail } from "@/components/prep/scene-page-detail";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getStoryScene } from "@/components/prep/actions";

// A scene's info panel on a page of its own, opened in a new tab from the
// panel's pop-out button. requireSession() here rather than trusting the
// group layout; see lib/require-session.ts for why. The story's storyteller
// can read any scene of theirs; its players, and anyone signed in when the
// story is public, only a completed one. sa_getStoryScene answers null for
// a scene the caller may not read as for one that does not exist, so both
// land on the not-found page. So does a scene under another story's id:
// the address names the story the scene belongs to, and only that one.
export default async function ScenePage({
  params,
}: {
  params: Promise<{ id: string; idScene: string }>;
}) {
  await requireSession();

  const { id, idScene } = await params;
  const idStory = parseRouteId(id);
  const idStoryScene = parseRouteId(idScene);
  if (idStory === null || idStoryScene === null) notFound();

  const [detail, statusOptions, elementStatusOptions] = await Promise.all([
    sa_getStoryScene(idStoryScene),
    sa_listStatusOptions("story_scenes"),
    sa_listStatusOptions("scene_elements"),
  ]);
  if (!detail || detail.idStory !== idStory) notFound();

  return (
    <Container maxW="lg" py="8">
      <ScenePageDetail
        initial={detail}
        statusOptions={statusOptions}
        elementStatusOptions={elementStatusOptions}
      />
    </Container>
  );
}
