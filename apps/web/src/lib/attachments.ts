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
};
