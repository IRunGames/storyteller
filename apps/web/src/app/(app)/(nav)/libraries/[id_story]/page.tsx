import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { PrepBoard } from "@/components/prep/prep-board";
import { sa_getStory, sa_listStorySessions } from "../../stories/actions";

// A story's Prep Work board, behind the stopwatch on the story's page.
// requireSession() here rather than trusting the group layout; see
// lib/require-session.ts for why. Every action re-checks the user against
// the database before touching data.
export default async function LibraryPage({ params }: { params: Promise<{ id_story: string }> }) {
  await requireSession();

  const { id_story } = await params;
  // Only plain decimal digits are a story id here, for the reasons given in
  // stories/[id]/page.tsx.
  if (!/^-?\d+$/.test(id_story)) notFound();
  const idStory = Number(id_story);

  const [story, sessions] = await Promise.all([
    sa_getStory(idStory),
    sa_listStorySessions(idStory, 0),
  ]);
  // The library is the storyteller's: scenes and enemies are what the
  // players are not meant to see yet. A player gets the same not-found page
  // as a bad id rather than a hint that there is something here.
  if (!story || !story.isOwner) notFound();

  return <PrepBoard story={story} sessions={sessions} />;
}
