import NextLink from "next/link";
import { Button, Container, Stack, Text } from "@chakra-ui/react";
import { activeStoryLimitMessage } from "@/lib/story-limits";
import { requireSession } from "@/lib/require-session";
import { StoryForm } from "@/app/(app)/(nav)/stories/story-form";
import { sa_getStoryAllowance, sa_listSystems } from "@/components/stories/actions";

// redirectTo says where to go once the story is made, as the login page's
// does: the home page's first-story button sends people on to the Stories
// page. Left out, the story's own page. Read here so the form never needs
// useSearchParams; sa_createStory narrows it to a same-origin path.
export default async function NewStoryPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  await requireSession();
  const [systems, { redirectTo }, allowance] = await Promise.all([
    sa_listSystems(),
    searchParams,
    sa_getStoryAllowance(),
  ]);

  // At the limit there is no form to fill in only to be refused: the page
  // says why and leads back to the Stories page, where a story can be made
  // inactive. sa_createStory refuses as well.
  if (allowance.active >= allowance.limit) {
    return (
      <Container maxW="lg" py="8">
        <Stack gap="4" align="start">
          <Text>{activeStoryLimitMessage(allowance.limit)}</Text>
          <Button asChild variant="outline">
            <NextLink href="/stories">Back to Stories</NextLink>
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxW="lg" py="8">
      <StoryForm
        systems={systems}
        afterCreate={Array.isArray(redirectTo) ? redirectTo[0] : redirectTo}
      />
    </Container>
  );
}
