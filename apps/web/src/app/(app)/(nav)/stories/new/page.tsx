import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { StoryForm } from "@/components/stories/story-form";
import { sa_listSystems } from "../actions";

export default async function NewStoryPage() {
  await requireSession();
  const systems = await sa_listSystems();

  return (
    <Container maxW="lg" py="8">
      <StoryForm systems={systems} />
    </Container>
  );
}
