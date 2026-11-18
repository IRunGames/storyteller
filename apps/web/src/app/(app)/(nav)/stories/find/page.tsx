import { Container, Heading, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { StoriesBoard } from "@/components/stories/stories-board";
import { sa_listLookingForPlayers } from "../actions";

// Find a Story, the sub-page under Stories in the menu: every active story
// whose storyteller has opened it to new players, as one paged list
// (StoriesBoard); a heart here lands on the Stories page's Favorites.
// requireSession() here rather than trusting the group layout; see
// lib/require-session.ts.
export default async function FindStoryPage() {
  await requireSession();

  const open = await sa_listLookingForPlayers(0);

  return (
    <Container maxW="full" py="8">
      <Stack gap="10">
        <Stack gap="2">
          <Heading size="3xl">Find a Story</Heading>
          <Text textStyle="lg" color="fg.muted">
            Stories whose storyteller is looking for players. Heart one to keep it on your Stories
            page.
          </Text>
        </Stack>

        <StoriesBoard initial={open} />
      </Stack>
    </Container>
  );
}
