import NextLink from "next/link";
import { Button, Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { STORIES_SECTIONS } from "@/lib/stories";
import { StoriesBoard } from "@/components/stories/stories-board";
import {
  sa_listFavoriteStories,
  sa_listMyStories,
  sa_setFavorite,
} from "./actions";

// The Stories page, behind the "Stories" nav item: the caller's favorites and
// their own stories. Stories open to new players are on Find a Story
// (./find), a sub-page under Stories in the menu. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
// Every action re-checks the user against the database before touching data.
export default async function StoriesPage() {
  await requireSession();

  const [favorites, mine] = await Promise.all([
    sa_listFavoriteStories(0),
    sa_listMyStories(0),
  ]);

  return (
    <Container maxW="full" py="8">
      <StoriesBoard
        sections={STORIES_SECTIONS}
        initial={{ favorites, mine }}
        loadMore={{
          favorites: sa_listFavoriteStories,
          mine: sa_listMyStories,
        }}
        // On the My Stories row rather than above the page: it is that list
        // the button adds to, and Favorites may not be there to push it down.
        headerActions={{
          mine: (
            <Button asChild>
              <NextLink href="/stories/new">New story</NextLink>
            </Button>
          ),
        }}
        setFavorite={sa_setFavorite}
      />
    </Container>
  );
}
