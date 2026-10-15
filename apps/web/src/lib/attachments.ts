/**
 * The tag on a use (attachment_uses.tags) that makes the attachment its
 * holder's cover: the one picture a story card, story page, session popover,
 * scene panel or element pill shows. Nothing else qualifies, not even a
 * holder's only attachment, and the database allows at most one per holder
 * (attachment_uses_one_cover_idx).
 */
export const COVER_TAG = "cover";

/**
 * How many attachments one holder (a story's pool, a sitting, a scene) may
 * carry at any one time -- a ceiling on what exists at once, not a budget
 * spent by uploading, so removing a row hands its place straight back. The
 * attachments field holds an upload to it, and attaching the story's
 * pictures to a scene is held to it on the server.
 */
export const MAX_ATTACHMENTS = 20;

/**
 * Which kind of row uses an attachment. Mirrors the attachment_uses_kind
 * enum. STORY is the story showing the file itself (its cover); every
 * attachment belongs to a story whether or not the story uses it.
 * SCENE_ELEMENT is an element's link to one scene (scene_elements): how the
 * element looks in that scene, whose cover its pill shows there instead of
 * the element's own picture.
 */
export type AttachmentKind =
  "STORY" | "STORY_SESSION" | "STORY_SCENE" | "ELEMENT" | "SCENE_ELEMENT";

/**
 * The holders that pictures are attached to out of the story's pool by the
 * story attachment picker and the run page's library: a scene, or an
 * element's link to one.
 */
export type AttachHolderKind = Extract<AttachmentKind, "STORY_SCENE" | "SCENE_ELEMENT">;

/** What a holder is called where the picker speaks of it: "This scene has room for 1 more." */
export const ATTACH_HOLDER_NOUNS: Record<AttachHolderKind, string> = {
  STORY_SCENE: "scene",
  SCENE_ELEMENT: "element",
};

/**
 * One attachment as a form or a card sees it, listed for one holder: the
 * file, and its use by that holder. A story's list is its whole pool, so a
 * row there may have no use at all (idAttachmentUse null): the story owns
 * the file without showing it.
 */
export type Attachment = {
  idAttachment: number;
  /** The story that owns the file; null until a create form's first use claims it. */
  idStory: number | null;
  /** The holder the row was listed for. */
  kind: AttachmentKind;
  /** Null until a create form's parent row exists and claims it. */
  idExternal: number | null;
  /** The holder's use of the file, or null when it has none. */
  idAttachmentUse: number | null;
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
  /** The holder's use is tagged COVER_TAG, so this is the picture it shows. */
  isCover: boolean;
  /** The file's own tags, in the order they were added. COVER_TAG is never here. */
  tags: string[];
};
