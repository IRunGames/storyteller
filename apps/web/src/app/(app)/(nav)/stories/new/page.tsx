import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { StoryForm } from "@/components/stories/story-form";
import { sa_listSystems } from "../actions";

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
  const [systems, { redirectTo }] = await Promise.all([sa_listSystems(), searchParams]);

  return (
    <Container maxW="lg" py="8">
      <StoryForm
        systems={systems}
        afterCreate={Array.isArray(redirectTo) ? redirectTo[0] : redirectTo}
      />
    </Container>
  );
}
