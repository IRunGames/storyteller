import { notFound } from "next/navigation";
import { Container, Heading, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { systemLabel } from "@/lib/stories";
import { sa_getStory } from "../actions";

// Placeholder so a card click lands somewhere. The real story page comes later.
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  // Number() would also accept "0x2a", "1e3", " 4 " and "Infinity", each of
  // which is a different URL for the same row. Only plain decimal digits (with
  // an optional sign) are a story id here.
  if (!/^-?\d+$/.test(id)) notFound();
  const idGame = Number(id);

  const story = await sa_getStory(idGame);
  if (!story) notFound();

  const system = systemLabel(story);

  return (
    <Container maxW="3xl" py="8">
      <Stack gap="2">
        <Heading size="3xl">{story.gameTitle}</Heading>
        {system && <Text color="fg.muted">{system}</Text>}
        {story.summary && <Text>{story.summary}</Text>}
      </Stack>
    </Container>
  );
}
