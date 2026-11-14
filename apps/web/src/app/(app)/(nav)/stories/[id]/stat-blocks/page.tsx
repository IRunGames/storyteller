import { Container, Heading, Stack } from "@chakra-ui/react";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { sa_getStory } from "../../actions";
import { sa_getStoryStatBlockDefinition } from "./actions";
import { StoryStatBlockEditor } from "./story-stat-block-editor";

// The story's own copy of its system's stat block definition, in the
// Systems page's editor, behind Edit stat block on the story's page.
// requireSession() here rather than trusting the group layout; see
// lib/require-session.ts for why. Only the storyteller edits it, so anyone
// else lands on the not-found page; a story with no copy yet goes back to
// its page, where Copy to this story makes one from what it says it copies.
export default async function StoryStatBlockPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  const idStory = parseRouteId(id);
  if (idStory === null) notFound();

  const [story, statBlock] = await Promise.all([
    sa_getStory(idStory),
    sa_getStoryStatBlockDefinition(idStory),
  ]);
  if (!story || !statBlock?.isStoryteller) notFound();
  if (!statBlock.copy || !statBlock.system) redirect(`/stories/${idStory}`);

  return (
    // As wide as the Systems page's editor, for the same nine fields a row.
    <Container maxW="7xl" py="8">
      <Stack gap="8">
        <Heading size="2xl">{story.title}</Heading>
        <StoryStatBlockEditor
          idStory={idStory}
          systemLabel={statBlock.system.label}
          definition={statBlock.copy}
        />
      </Stack>
    </Container>
  );
}
