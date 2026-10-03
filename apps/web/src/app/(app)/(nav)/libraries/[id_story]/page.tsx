import { notFound } from "next/navigation";
import { ELEMENT_KINDS, type ElementKind, type StoryElement } from "@/lib/elements";
import { PREP_SESSIONS_PAGE_SIZE } from "@/lib/stories";
import { requireSession } from "@/lib/require-session";
import { PrepBoard } from "@/components/prep/prep-board";
import { ELEMENT_COLUMNS } from "@/components/prep/prep-columns";
import { sa_listStatusOptions } from "@/components/status/actions";
import { sa_getStory, sa_countStorySessions, sa_listStorySessions } from "../../stories/actions";
import {
  sa_countStoryElements,
  sa_countStoryScenes,
  sa_listStoryElements,
  sa_listStoryScenes,
} from "../actions";

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

  // Each column loads its most recent page and the count of everything behind
  // it, so a heading can say how much there is without the board holding it
  // all. The scene actions answer nothing to anyone but the storyteller, so a
  // visitor who is not the owner gets empty columns and then the not-found
  // below; the check does not depend on the order these resolve in.
  const [
    story,
    sessions,
    sessionCount,
    scenes,
    sceneCount,
    sessionStatusOptions,
    sceneStatusOptions,
    elementStatusOptions,
    elementCounts,
    ...elementPages
  ] = await Promise.all([
    sa_getStory(idStory),
    sa_listStorySessions(idStory, 0, PREP_SESSIONS_PAGE_SIZE),
    sa_countStorySessions(idStory),
    sa_listStoryScenes(idStory, 0),
    sa_countStoryScenes(idStory),
    sa_listStatusOptions("story_sessions"),
    sa_listStatusOptions("story_scenes"),
    sa_listStatusOptions("elements"),
    sa_countStoryElements(idStory),
    // One first page per kind, in ELEMENT_KINDS order, for the column each
    // kind has.
    ...ELEMENT_KINDS.map((kind) => sa_listStoryElements(idStory, kind, 0)),
  ]);
  // The library is the storyteller's: scenes and enemies are what the
  // players are not meant to see yet. A player gets the same not-found page
  // as a bad id rather than a hint that there is something here.
  if (!story || !story.isOwner) notFound();

  const elements = Object.fromEntries(
    ELEMENT_KINDS.map((kind, index) => [kind, elementPages[index]]),
  ) as Record<ElementKind, StoryElement[]>;

  return (
    <PrepBoard
      story={story}
      sessions={sessions}
      scenes={scenes}
      elements={elements}
      counts={{
        Timeline: sessionCount,
        Scenes: sceneCount,
        ...Object.fromEntries(
          ELEMENT_COLUMNS.map((column) => [column.title, elementCounts[column.kind]]),
        ),
      }}
      sessionStatusOptions={sessionStatusOptions}
      sceneStatusOptions={sceneStatusOptions}
      elementStatusOptions={elementStatusOptions}
    />
  );
}
