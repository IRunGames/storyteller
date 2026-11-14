import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { parseRouteId } from "@/lib/route-ids";
import { sa_getOrCreateSceneToBuild } from "@/components/prep/actions";

// Where Build scenes goes: the scene the storyteller touched last, opened on
// its live-edit page, /stories/[id]/scenes/[idScene]. See home/page.tsx for
// why the page calls requireSession() itself.
//
// Loading this page may write. A story with no scenes has nothing to build
// on, so its first load makes one, "New scene", and opens that. It makes one
// only when the story has none, so a reload opens the same scene rather than
// making another. Anyone but the storyteller gets the not-found page, and
// nothing is made.
export default async function BuildScenesPage({ params }: { params: Promise<{ id: string }> }) {
  const signedIn = await requireSession();
  // A guest (someone in by a join link, with no account) is turned away
  // here, before the action, because requireAccount() throws for a guest,
  // which would be the error page rather than not-found.
  if (signedIn.user.isAnonymous) notFound();

  const { id } = await params;
  const idStory = parseRouteId(id);
  if (idStory === null) notFound();

  const idStoryScene = await sa_getOrCreateSceneToBuild(idStory);
  if (idStoryScene === null) notFound();

  redirect(`/stories/${idStory}/scenes/${idStoryScene}`);
}
