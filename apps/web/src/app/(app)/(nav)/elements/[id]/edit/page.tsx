import { notFound } from "next/navigation";
import { Container, Grid } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { ElementForm } from "@/components/prep/element-form";
import { HolderPictures } from "@/components/uploads/holder-pictures";
import { sa_getElementForEdit, sa_listStatBlockSystems } from "@/components/prep/actions";

// An annotated picture's players' copy is rendered after the annotator's
// save has answered, in this page's function, for up to the render's claim
// (RENDER_CLAIM_SECONDS in lib/annotations.ts; lib/players-copy-time.test.ts
// holds the two together).
export const maxDuration = 60;

// An element's edit form, behind the pencil on its card. requireSession()
// here rather than trusting the group layout; see lib/require-session.ts for
// why. sa_getElementForEdit answers null for an element the caller does not
// own as for one that does not exist, so both land on the not-found page.
//
// Two columns, as Edit scene has its own: the form, and the element's
// pictures (HolderPictures), its cover set apart, each uploaded one with its
// annotation controls. The pictures take effect at once rather than on
// Save, each saved the moment it is added; the columns stack as the page
// narrows.
export default async function EditElementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  const idElement = parseRouteId(id);
  if (idElement === null) notFound();

  const element = await sa_getElementForEdit(idElement);
  if (!element) notFound();
  const statBlockSystems = await sa_listStatBlockSystems(element.idStory);

  return (
    <Container maxW="6xl" py="8">
      <Grid
        templateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }}
        gap="8"
        alignItems="start"
      >
        <ElementForm
          idStory={element.idStory}
          element={{ idElement, values: element.values }}
          statBlockSystems={statBlockSystems}
        />
        <HolderPictures
          idStory={element.idStory}
          holder={{ kind: "ELEMENT", idExternal: idElement }}
          headingLevel={2}
          canAnnotate
        />
      </Grid>
    </Container>
  );
}
