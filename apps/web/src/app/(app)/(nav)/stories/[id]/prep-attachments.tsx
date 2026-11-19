"use client";

import { AttachmentListField } from "@/components/uploads/attachment-list-field";
import { useAttachmentSearch } from "@/components/uploads/use-attachment-search";

// How many cards the column draws before its More button.
const ATTACHMENTS_PAGE_SIZE = 10;

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
  /** An id for the block holding them, for a +'s aria-controls; see the field. */
  addId?: string;
  /** How many attachments the story has, for the count beside the heading; see the field. */
  onCountChange?: (count: number) => void;
};

/**
 * The Attachments column of the Prep Work board, and the story page's
 * Attachments section, which shows the same cards the same way: the story's
 * attachment cards, ten at a time with More under them, narrowed by a search
 * box. The Covers pill, over the search box like the other columns' filters,
 * takes the cover out of the way when it is not what the storyteller is
 * looking for.
 *
 * Like the Scenes column the search goes to the database, against
 * attachments.search_text (the address, the file name and every tag), rather
 * than matching what the cards happen to show. The answer is which ids
 * matched; the field already holds every row and only narrows what it draws.
 * The column's + opens the same link input and dropzone the story page has,
 * drawn above the column's filters.
 *
 * Ten cards are drawn at first, with More under them for ten more, as the
 * board's other columns page: a story's attachments run long, and every
 * card drawn fetches its picture.
 *
 * Each uploaded picture's card carries its annotation controls: the drawing
 * is the file's, shown to the players wherever an element shows the file.
 */
export function PrepAttachments({
  idStory,
  filter,
  showCovers,
  showAdd,
  addTarget,
  addId,
  onCountChange,
}: Props) {
  const { shownIds } = useAttachmentSearch("STORY", idStory, filter);

  return (
    <AttachmentListField
      kind="STORY"
      idExternal={idStory}
      showAdd={showAdd}
      addTarget={addTarget}
      addId={addId}
      shownIds={shownIds}
      hideCovers={!showCovers}
      showEmpty
      onCountChange={onCountChange}
      pageSize={ATTACHMENTS_PAGE_SIZE}
      canAnnotate
    />
  );
}
