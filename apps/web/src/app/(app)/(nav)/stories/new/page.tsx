import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { sa_createStory, sa_listSystems } from "../actions";
import { NewStoryForm } from "./new-story-form";

export default async function NewStoryPage() {
  await requireSession();
  const systems = await sa_listSystems();

  return (
    <Container maxW="lg" py="8">
      <NewStoryForm systems={systems} onCreate={sa_createStory} />
    </Container>
  );
}
