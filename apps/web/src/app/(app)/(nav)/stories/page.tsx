import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { DEFAULT_MY_STORY_LIST_QUERY } from "@/lib/story-list-schemas";
import { MyStories } from "@/components/stories/my-stories";
import { sa_listMyStoryPage } from "./actions";

// The Stories page, behind the "Stories" nav item: every story the caller
// runs, plays in or has favorited, as cards or as a list, searched and
// sorted (MyStories). Stories open to new players are on Find a Story
// (./find), a sub-page under Stories in the menu. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
// Every action re-checks the user against the database before touching data.
export default async function StoriesPage() {
  await requireSession();

  const initial = await sa_listMyStoryPage(DEFAULT_MY_STORY_LIST_QUERY);

  return (
    <Container maxW="full" py="8">
      <MyStories initial={initial} />
    </Container>
  );
}
