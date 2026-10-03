import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { ScenePageDetail } from "@/components/prep/scene-page-detail";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getStoryScene } from "../../libraries/actions";

// A scene's info panel on a page of its own, opened in a new tab from the
// panel's pop-out button. requireSession() here rather than trusting the
// group layout; see lib/require-session.ts for why. sa_getStoryScene answers
// null for a scene on someone else's story as for one that does not exist,
// so both land on the not-found page.
export default async function ScenePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  // Only plain decimal digits are an id here; stories/[id]/page.tsx says why
  // Number() alone would not do.
  if (!/^-?\d+$/.test(id)) notFound();

  const [detail, statusOptions] = await Promise.all([
    sa_getStoryScene(Number(id)),
    sa_listStatusOptions("story_scenes"),
  ]);
  if (!detail) notFound();

  return (
    <Container maxW="lg" py="8">
      <ScenePageDetail initial={detail} statusOptions={statusOptions} />
    </Container>
  );
}
