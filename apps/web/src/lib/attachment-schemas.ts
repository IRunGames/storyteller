import { z } from "zod";

// An id outside int4 is a query error rather than a missing row, so it is
// refused before it reaches Postgres -- the same reasoning idStorySchema
// uses in stories/actions.ts and libraries/actions.ts. id_attachment and the
// external id (a story, session or scene id) share the same int4 column
// type, but are kept as separate exports so a call site reads which one a
// given parameter means.
export const idAttachmentSchema = z.number().int().min(-2147483648).max(2147483647);
export const idExternalSchema = z.number().int().min(-2147483648).max(2147483647);

export const attachmentKindSchema = z.enum(["STORY", "STORY_SESSION", "STORY_SCENE"]);

// A create form only ever collects a handful of ids; a bound keeps a crafted
// array from turning a claim into a full-table scan, the same reasoning
// statusesSchema uses in libraries/actions.ts.
export const attachmentIdsSchema = z.array(idAttachmentSchema).max(50);
