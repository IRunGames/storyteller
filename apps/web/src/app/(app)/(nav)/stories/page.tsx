import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { DEFAULT_MY_STORY_LIST_QUERY } from "@/lib/story-list-schemas";
import { MyStories } from "@/components/stories/my-stories";
import { sa_listFavoriteStories, sa_listMyStoryPage } from "./actions";

// The Stories page, behind the "Stories" nav item: every story the caller
// runs, plays in or has favorited, as cards or as a list, searched and
// sorted (MyStories), with the favorites also first in a section of their
// own on the cards. Stories open to new players are on Find a Story
// (./find), a sub-page under Stories in the menu. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
// Every action re-checks the user against the database before touching data.
export default async function StoriesPage() {
  await requireSession();

  // The favorites are loaded whatever the view: the view is a preference the
  // client reads, and the toggle shows them without a round trip.
  const [initial, favorites] = await Promise.all([
    sa_listMyStoryPage(DEFAULT_MY_STORY_LIST_QUERY),
    sa_listFavoriteStories(0),
  ]);

  return (
    <Container maxW="full" py="8">
      <MyStories initial={initial} initialFavorites={favorites} />
    </Container>
  );
}
