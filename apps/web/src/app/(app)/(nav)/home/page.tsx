import { Container, Heading, Stack } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { NewsSection } from "@/components/home/news-section";
import { HomeFavorites } from "@/components/home/home-favorites";
import { sa_listFavoriteStories } from "../stories/actions";
import { sa_listNews } from "./actions";

// The signed-in landing page: what is new, then the stories the user has
// hearted. requireSession() here rather than trusting the group layout; see
// lib/require-session.ts for why. Both actions re-check the user against the
// database before touching data.
export default async function HomePage() {
  await requireSession();

  const [items, favorites] = await Promise.all([sa_listNews(), sa_listFavoriteStories(0)]);

  return (
    <Container maxW="full" py="8">
      <Stack gap="10">
        <Heading size="3xl">Home</Heading>
        <NewsSection items={items} />
        <HomeFavorites initial={favorites} />
      </Stack>
    </Container>
  );
}
