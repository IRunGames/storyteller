import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { createStory, listSystems } from "../actions";
import { NewStoryForm } from "./new-story-form";

export default async function NewStoryPage() {
  await requireSession();
  const systems = await listSystems();

  return (
    <Container maxW="lg" py="8">
      <NewStoryForm systems={systems} onCreate={createStory} />
    </Container>
  );
}
