import { Container, Heading, List, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { PlayPicker } from "@/components/play/play-picker";
import { sa_listPlayableStories } from "./actions";

// The Play primer, behind the "Play" nav item: how a session works, then a
// picker into the caller's own tables. The table itself is /play/[id],
// outside this group, since it draws its own chrome. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
export default async function PlayPage() {
  await requireSession();

  const stories = await sa_listPlayableStories();

  return (
    <Container maxW="3xl" py="8">
      <Stack gap="10">
        <Stack gap="4">
          <Heading size="3xl">Play</Heading>
          <Text textStyle="lg" color="fg.muted">
            A story is played at its table: one live room where the storyteller
            and the players create the story together.
          </Text>
          <List.Root as="ol" gap="2" ps="5">
            <List.Item>
              Storytellers: you open a session of play for one of your stories
              from here or from the play button on your story card from the
              hoome page or your stories page.
            </List.Item>
            <List.Item>
              Players: you can join an active session from the JOIN button on a
              story card on your home or stories pages.
            </List.Item>
            <List.Item>
              The changes to any active scenes in a session remain so you can
              pick up where you left off - or flip back to remember what
              happened!
            </List.Item>
          </List.Root>
        </Stack>

        <Stack as="section" aria-labelledby="play-picker-heading" gap="4">
          <Heading id="play-picker-heading" size="xl">
            Start playing
          </Heading>
          <PlayPicker stories={stories} />
        </Stack>
      </Stack>
    </Container>
  );
}
