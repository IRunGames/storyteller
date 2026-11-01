import { notFound } from "next/navigation";
import { Container, Heading, HStack, Stack } from "@chakra-ui/react";
import { sessionHeading } from "@/lib/stories";
import { requireSession } from "@/lib/require-session";
import { SessionNeighbourChevron } from "@/components/stories/session-neighbour-chevron";
import { SessionPageDetail } from "@/components/stories/session-page-detail";
import { SessionScenesAccordion } from "@/components/stories/session-scenes-accordion";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getStoryScene } from "../../libraries/actions";
import { sa_getStorySession, sa_getStorySessionNeighbours } from "../../stories/actions";

// A session's info panel on a page of its own, opened in a new tab from the
// panel's pop-out button, with arrows either side of the heading to the
// sessions before and after it and every scene of the sitting opened out
// below. requireSession() here rather than trusting the group layout; see
// lib/require-session.ts for why. sa_getStorySession decides what the
// caller sees, exactly as it does for the popover: the notes, the lingering
// questions and the scenes are the storyteller's alone, so for anyone else
// the scenes below are simply not there.
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  // Only plain decimal digits are an id here; stories/[id]/page.tsx says why
  // Number() alone would not do.
  if (!/^-?\d+$/.test(id)) notFound();

  const detail = await sa_getStorySession(Number(id));
  if (!detail) notFound();
  // As in the popover: the scenes' workflows are only worth asking for when
  // there are scenes to colour. Each scene is loaded as its own panel loads
  // it, so the folds below show what the info button would.
  const [neighbours, sessionStatusOptions, sceneStatusOptions, elementStatusOptions, scenes] =
    await Promise.all([
      sa_getStorySessionNeighbours(detail.idStorySession),
      sa_listStatusOptions("story_sessions"),
      detail.scenes.length > 0 ? sa_listStatusOptions("story_scenes") : [],
      detail.scenes.length > 0 ? sa_listStatusOptions("scene_elements") : [],
      Promise.all(detail.scenes.map((scene) => sa_getStoryScene(scene.idStoryScene))),
    ]);

  return (
    <Container maxW="lg" py="8">
      <Stack gap="6">
        <HStack gap="2" align="center">
          <SessionNeighbourChevron direction="previous" session={neighbours.previous} />
          <Heading as="h1" size="2xl" flex="1" textAlign="center">
            {sessionHeading(detail)}
          </Heading>
          <SessionNeighbourChevron direction="next" session={neighbours.next} />
        </HStack>
        <SessionPageDetail
          initial={detail}
          sessionStatusOptions={sessionStatusOptions}
          sceneStatusOptions={sceneStatusOptions}
        />
        <SessionScenesAccordion
          // A scene deleted between the two reads is simply not listed.
          scenes={scenes.filter((scene) => scene !== null)}
          sceneStatusOptions={sceneStatusOptions}
          elementStatusOptions={elementStatusOptions}
        />
      </Stack>
    </Container>
  );
}
