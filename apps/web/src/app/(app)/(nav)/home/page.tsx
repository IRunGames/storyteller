import NextLink from "next/link";
import { Button, Container, Flex, Heading, Stack } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { StoriesBoard } from "@/components/stories/stories-board";
import {
  listFavoriteStories,
  listLookingForPlayers,
  listMyStories,
  setFavorite,
} from "./actions";

// The Stories page: the signed-in home and the "Stories" nav item are the
// same route. requireSession() here rather than trusting the group layout;
// see lib/require-session.ts for why. Every action re-checks the user against
// the database before touching data.
export default async function HomePage() {
  await requireSession();

  const [favorites, mine, open] = await Promise.all([
    listFavoriteStories(0),
    listMyStories(0),
    listLookingForPlayers(0),
  ]);

  return (
    <Container maxW="full" py="8">
      <Stack gap="10">
        <Flex justify="space-between" align="center" wrap="wrap" gap="4">
          <Heading size="3xl">Stories</Heading>
          <Button asChild>
            <NextLink href="/home/new">New story</NextLink>
          </Button>
        </Flex>

        <StoriesBoard
          initial={{ favorites, mine, open }}
          loadMore={{
            favorites: listFavoriteStories,
            mine: listMyStories,
            open: listLookingForPlayers,
          }}
          setFavorite={setFavorite}
        />
      </Stack>
    </Container>
  );
}
