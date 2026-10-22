import { notFound } from "next/navigation";
import { Box, Container } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { safeRedirect } from "@/lib/safe-redirect";
import { cssUrlValue } from "@/lib/stories";
import { SceneForm } from "@/components/prep/scene-form";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getStorySceneForEdit } from "../../../libraries/actions";
import { sa_getScenePlaySpace } from "@/app/(app)/run/[id]/actions";

// A scene's edit form, behind the pencil on its card. requireSession() here
// rather than trusting the group layout; see lib/require-session.ts for why.
// sa_getStorySceneForEdit answers null for a scene the caller does not own
// as for one that does not exist, so both land on the not-found page. A
// completed scene has no pencil, and a typed URL gets the not-found page too.
// `from` says where the form was opened from, such as a scene's preview, and
// is where Cancel and a save go back to; a path of this site only.
//
// The scene's elements are read as the run page reads them, in their stacks,
// for the form's third column. The scene's cover, if it has one, is behind
// the whole page under a scrim, as a story's is behind its page; it is the
// cover as the page was loaded, so a new one shows on the next visit.
export default async function EditScenePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  await requireSession();

  const { id } = await params;
  const { from } = await searchParams;
  if (!/^-?\d+$/.test(id)) notFound();
  const idStoryScene = Number(id);

  const [scene, statusOptions] = await Promise.all([
    sa_getStorySceneForEdit(idStoryScene),
    sa_listStatusOptions("story_scenes"),
  ]);
  if (!scene || scene.locked) notFound();
  // Read once the scene is known to be the caller's to edit, since it needs
  // the story the scene belongs to.
  const space = await sa_getScenePlaySpace(scene.idStory, idStoryScene);

  return (
    // flex="1" fills the nav layout's column so the cover reaches the foot
    // of the viewport, not just the bottom of the form.
    <Box position="relative" flex="1">
      {space.coverUrl && (
        <>
          <Box
            data-testid="scene-backdrop"
            position="absolute"
            inset="0"
            bgSize="cover"
            bgPos="center"
            style={{ backgroundImage: `url("${cssUrlValue(space.coverUrl)}")` }}
          />
          <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.400" />
        </>
      )}
      {/* The full width, less a gutter, rather than a reading width: the
          three columns grow with the window as they would one under another. */}
      <Container maxW="full" px={{ base: "4", md: "8" }} py="8" position="relative">
        <SceneForm
          idStory={scene.idStory}
          sessions={scene.sessions}
          scene={{ idStoryScene, status: scene.status, values: scene.values }}
          statusOptions={statusOptions}
          returnTo={
            from === undefined ? undefined : safeRedirect(from, `/libraries/${scene.idStory}`)
          }
          elements={{ tags: space.tags, items: space.inPlay }}
          onCover={space.coverUrl !== null}
        />
      </Container>
    </Box>
  );
}
