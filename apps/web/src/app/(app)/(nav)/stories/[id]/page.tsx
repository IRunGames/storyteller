import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { StoryDetails } from "@/components/stories/story-details";
import { sa_getStory, sa_listStoryPlayers, sa_listStorySessions } from "../actions";

// One story, behind a card's title. requireSession() here rather than
// trusting the group layout; see lib/require-session.ts for why. Every action
// re-checks the user against the database before touching data.
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();

  const { id } = await params;
  // Number() would also accept "0x2a", "1e3", " 4 " and "Infinity", each of
  // which is a different URL for the same row. Only plain decimal digits (with
  // an optional sign) are a story id here.
  if (!/^-?\d+$/.test(id)) notFound();
  const idStory = Number(id);

  const [story, players, sessions] = await Promise.all([
    sa_getStory(idStory),
    sa_listStoryPlayers(idStory),
    sa_listStorySessions(idStory, 0),
  ]);
  if (!story) notFound();

  return <StoryDetails story={story} players={players} sessions={sessions} />;
}
