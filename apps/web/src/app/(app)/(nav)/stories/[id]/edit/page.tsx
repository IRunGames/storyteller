import { Container } from "@chakra-ui/react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { StoryForm } from "@/components/stories/story-form";
import { sa_getStoryForEdit, sa_listSystems } from "../../actions";

// The story page's edit form, behind its pencil button. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
// sa_getStoryForEdit answers null for a story the caller did not create as
// well as for one that does not exist, so both land on the not-found page.
export default async function EditStoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  const idStory = parseRouteId(id);
  if (idStory === null) notFound();

  const [values, systems] = await Promise.all([sa_getStoryForEdit(idStory), sa_listSystems()]);
  if (!values) notFound();

  return (
    <Container maxW="lg" py="8">
      <StoryForm systems={systems} story={{ idStory, values }} />
    </Container>
  );
}
