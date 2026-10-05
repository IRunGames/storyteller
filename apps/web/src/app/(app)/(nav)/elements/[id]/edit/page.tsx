import { notFound } from "next/navigation";
import { Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { ElementForm } from "@/components/prep/element-form";
import { sa_getElementForEdit } from "../../../libraries/actions";

// An element's edit form, behind the pencil on its card. requireSession()
// here rather than trusting the group layout; see lib/require-session.ts for
// why. sa_getElementForEdit answers null for an element the caller does not
// own as for one that does not exist, so both land on the not-found page.
export default async function EditElementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  if (!/^-?\d+$/.test(id)) notFound();
  const idElement = Number(id);

  const element = await sa_getElementForEdit(idElement);
  if (!element) notFound();

  return (
    <Container maxW="lg" py="8">
      <ElementForm idStory={element.idStory} element={{ idElement, values: element.values }} />
    </Container>
  );
}
