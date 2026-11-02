import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { Storyboard } from "@/components/storyboard/storyboard";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getStoryboard } from "./actions";

// A story's storyboard, behind the Storyboard door on its page: the scenes
// laid side to side by sitting, on the cover. requireSession() here rather
// than trusting the group layout; see lib/require-session.ts for why.
// sa_getStoryboard decides who sees the page at all (the storyteller, the
// story's players, anyone when the story is public) and what they see, and
// answers null for a story the caller may not read as for one that is not
// there, so both land on the not-found page.
export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  // Only plain decimal digits are a story id here; stories/[id]/page.tsx
  // says why Number() alone would not do.
  if (!/^-?\d+$/.test(id)) notFound();

  const [board, sceneStatusOptions] = await Promise.all([
    sa_getStoryboard(Number(id)),
    // The scene workflow, so each card's status is the same word the board
    // and the session page use for it.
    sa_listStatusOptions("story_scenes"),
  ]);
  if (!board) notFound();

  return <Storyboard board={board} sceneStatusOptions={sceneStatusOptions} />;
}
