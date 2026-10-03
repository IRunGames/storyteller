import { notFound } from "next/navigation";
import { Container, Heading, Stack } from "@chakra-ui/react";
import { sessionHeading } from "@/lib/stories";
import { requireSession } from "@/lib/require-session";
import { SessionPageDetail } from "@/components/stories/session-page-detail";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getStorySession } from "../../stories/actions";

// A session's info panel on a page of its own, opened in a new tab from the
// panel's pop-out button. requireSession() here rather than trusting the
// group layout; see lib/require-session.ts for why. sa_getStorySession
// decides what the caller sees, exactly as it does for the popover: the
// notes, the lingering questions and the scenes are the storyteller's alone.
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  // Only plain decimal digits are an id here; stories/[id]/page.tsx says why
  // Number() alone would not do.
  if (!/^-?\d+$/.test(id)) notFound();

  const detail = await sa_getStorySession(Number(id));
  if (!detail) notFound();
  // As in the popover: the scenes' workflow is only worth asking for when
  // there are scenes to colour.
  const [sessionStatusOptions, sceneStatusOptions] = await Promise.all([
    sa_listStatusOptions("story_sessions"),
    detail.scenes.length > 0 ? sa_listStatusOptions("story_scenes") : [],
  ]);

  return (
    <Container maxW="lg" py="8">
      <Stack gap="6">
        <Heading as="h1" size="2xl">
          {sessionHeading(detail)}
        </Heading>
        <SessionPageDetail
          initial={detail}
          sessionStatusOptions={sessionStatusOptions}
          sceneStatusOptions={sceneStatusOptions}
        />
      </Stack>
    </Container>
  );
}
