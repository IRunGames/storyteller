/**
 * The tag that makes an attachment its object's cover: the one picture a
 * story card, story page, session popover or scene panel shows. Nothing else
 * qualifies, not even an object's only attachment, and the database allows
 * at most one per object (attachments_one_cover_idx).
 */
export const COVER_TAG = "cover";

/**
 * How many attachments one story, sitting or scene may carry at any one time
 * -- a ceiling on what exists at once, not a budget spent by uploading, so
 * removing a row hands its place straight back. The attachments field holds
 * an upload to it, and moving the story's attachments onto a scene is held
 * to it on the server.
 */
export const MAX_ATTACHMENTS = 20;

/** Which kind of row an attachment hangs off. Mirrors the attachments_kind enum. */
export type AttachmentKind = "STORY" | "STORY_SESSION" | "STORY_SCENE";

/** One attachment as a form or a card sees it. */
export type Attachment = {
  idAttachment: number;
  kind: AttachmentKind;
  /** Null until a create form's parent row exists and claims it. */
  idExternal: number | null;
  /**
   * The status the row holds, as the database has it. Not narrowed to the
   * statuses the workflow lists today: those live in s_statuses.
   */
  status: string;
  /** Null while UPLOADING; the CHECK makes READY mean this is set. */
  url: string | null;
  /** True for a file we put in Blob, false for a link someone typed. */
  isUploaded: boolean;
  fileName: string | null;
  /** Tagged COVER_TAG, so this is the picture its object shows. */
  isCover: boolean;
  /** Every other tag, in the order they were added. COVER_TAG is never here. */
  tags: string[];
};
