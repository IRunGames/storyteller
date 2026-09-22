import NextLink from "next/link";
import { Button, Container, Flex, Heading, Stack } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { StoriesBoard } from "@/components/stories/stories-board";
import {
  sa_listFavoriteStories,
  sa_listLookingForPlayers,
  sa_listMyStories,
  sa_setFavorite,
} from "./actions";

// The Stories page, behind the "Stories" nav item. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
// Every action re-checks the user against the database before touching data.
export default async function StoriesPage() {
  await requireSession();

  const [favorites, mine, open] = await Promise.all([
    sa_listFavoriteStories(0),
    sa_listMyStories(0),
    sa_listLookingForPlayers(0),
  ]);

  return (
    <Container maxW="full" py="8">
      <Stack gap="10">
        <Flex justify="space-between" align="center" wrap="wrap" gap="4">
          <Heading size="3xl">Stories</Heading>
          <Button asChild>
            <NextLink href="/stories/new">New story</NextLink>
          </Button>
        </Flex>

        <StoriesBoard
          initial={{ favorites, mine, open }}
          loadMore={{
            favorites: sa_listFavoriteStories,
            mine: sa_listMyStories,
            open: sa_listLookingForPlayers,
          }}
          setFavorite={sa_setFavorite}
        />
      </Stack>
    </Container>
  );
}
