import { Container, Heading, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { LibraryList } from "@/components/library/library-list";
import { sa_listLibraryStories } from "./actions";

// The way into the storyteller's libraries, behind the "Library" nav item:
// what a library is, then the caller's own stories with a book into each.
// The libraries themselves are libraries/[id_story]. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
export default async function LibraryPage() {
  await requireSession();

  const stories = await sa_listLibraryStories();

  return (
    <Container maxW="3xl" py="8">
      <Stack gap="10">
        <Stack gap="4">
          <Heading size="3xl">Library</Heading>
          <Text textStyle="lg" color="fg.muted">
            Every story has a library of its own: its sessions, its scenes and the rest of your
            preparation, kept where only you, its storyteller, can see them. Open one with the book
            beside a story below, or with the book on the story&apos;s page or its card.
          </Text>
        </Stack>

        <Stack as="section" aria-labelledby="library-stories-heading" gap="4">
          <Heading id="library-stories-heading" size="xl">
            Your stories
          </Heading>
          <LibraryList stories={stories} />
        </Stack>
      </Stack>
    </Container>
  );
}
