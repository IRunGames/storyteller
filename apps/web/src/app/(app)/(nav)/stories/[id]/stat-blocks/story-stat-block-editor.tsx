"use client";

import { StatBlockDefinitionEditor } from "@/components/stat-blocks/stat-block-definition-editor";
import type { StatBlockDefinition } from "@/lib/stat-blocks";
import { sa_setStoryStatBlockDefinition } from "@/app/(app)/(nav)/stories/[id]/actions";

/** The story's copy of its system's stat block definition in the shared editor, saved over the copy. */
export function StoryStatBlockEditor({
  idStory,
  systemLabel,
  definition,
}: {
  idStory: number;
  /** The system the copy was taken from, which every other story of it still reads. */
  systemLabel: string;
  definition: StatBlockDefinition;
}) {
  return (
    <StatBlockDefinitionEditor
      definition={definition}
      intro={`The stat block every element of this story can carry, in place of ${systemLabel}'s, which other stories of that system keep: its groups, and the stats in each.`}
      save={(next) => sa_setStoryStatBlockDefinition(idStory, next)}
      back={{ href: `/stories/${idStory}`, label: "Back to story" }}
    />
  );
}
