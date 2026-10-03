"use client";

import { useEffect, useRef, useState } from "react";
import { SCENE_SEARCH_DELAY_MS } from "@/lib/scenes";
import { sa_searchAttachments } from "@/components/uploads/actions";
import { AttachmentListField } from "@/components/uploads/attachment-list-field";

type Props = {
  idStory: number;
  /** What the column's search box holds. */
  filter: string;
  /** The Covers pill above the search box: off leaves the cover out. */
  showCovers: boolean;
  /** The column's +: the link input and dropzone. */
  showAdd: boolean;
  /** Where the board wants them drawn, above the column's filters; see the field. */
  addTarget?: HTMLElement | null;
  /** How many attachments the story has, for the count beside the heading; see the field. */
  onCountChange?: (count: number) => void;
};

/**
 * The Attachments column of the Prep Work board: the story's attachment
 * cards, as the story page shows them. The board's Covers pill, over the
 * search box like the other columns' filters, takes the cover out of the way
 * when it is not what the storyteller is looking for.
 *
 * Like the Scenes column the search goes to the database, against
 * attachments.search_text (the address, the file name and every tag), rather
 * than matching what the cards happen to show. The answer is which ids
 * matched; the field already holds every row and only narrows what it draws.
 * The column's + opens the same link input and dropzone the story page has,
 * drawn above the column's filters.
 */
export function PrepAttachments({
  idStory,
  filter,
  showCovers,
  showAdd,
  addTarget,
  onCountChange,
}: Props) {
  const [shownIds, setShownIds] = useState<ReadonlySet<number> | null>(null);
  // Which search is the latest: a slow reply to an earlier query must not
  // land on top of the results for what the box says now.
  const searchSeq = useRef(0);

  useEffect(() => {
    const needle = filter.trim();
    const seq = ++searchSeq.current;
    // An empty box shows everything, with nothing to ask.
    if (needle === "") {
      const timer = setTimeout(() => setShownIds(null), 0);
      return () => clearTimeout(timer);
    }
    // The scenes column's pause, so typing a word asks once rather than once
    // a letter.
    const timer = setTimeout(async () => {
      try {
        const ids = await sa_searchAttachments("STORY", idStory, needle);
        if (seq === searchSeq.current) setShownIds(new Set(ids));
      } catch {
        // Leave the last results in place; the next keystroke tries again.
      }
    }, SCENE_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [idStory, filter]);

  return (
    <AttachmentListField
      kind="STORY"
      idExternal={idStory}
      showAdd={showAdd}
      addTarget={addTarget}
      shownIds={shownIds}
      hideCovers={!showCovers}
      showEmpty
      onCountChange={onCountChange}
    />
  );
}
