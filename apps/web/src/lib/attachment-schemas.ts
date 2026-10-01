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
// statusesSchema uses in libraries/actions.ts. The message is worded for a
// reader because the story form does show it: an over-long list is refused by
// the client resolver and lands on the form's own alert.
export const attachmentIdsSchema = z
  .array(idAttachmentSchema)
  .max(50, "That is too many attachments. Remove a few and try again.");

/**
 * A url an attachment may carry, whether someone typed it or Blob returned
 * it. The protocol is pinned to http(s) on purpose: a story's picture still
 * lands inside a CSS `url("…")` on the story card, so `javascript:` and
 * `data:` must never get that far. The card escapes the value as well, and
 * both halves are needed — escaping a `javascript:` url leaves it a
 * `javascript:` url, and pinning the protocol does nothing about a quote in
 * the path.
 *
 * This rule used to live on `storyFields.imageUrl` in story-schemas.ts, back
 * when a story carried one url in a column of its own. The column is gone;
 * the reason for the rule is not, so it moved here with the urls.
 *
 * Unlike the old field it has no empty case: a story with no picture now has
 * no attachment row rather than an empty string, so anything reaching here is
 * meant to be a url.
 */
export const attachmentUrlSchema = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https?$/, error: "Please enter a valid URL." }));

/**
 * One tag as a storyteller types it: trimmed, lower-cased so "Map" and "map"
 * are one tag, and short enough to sit in a chip. "cover" is refused here,
 * because it is not a tag like the others: it moves between an object's
 * attachments through sa_setAttachmentCover, which also takes it off the
 * one that held it. The tags popover turns a typed "cover" into that call
 * before it ever reaches this schema.
 */
export const attachmentTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Please enter a tag.")
  .max(40, "Keep a tag under 40 characters.")
  .refine((tag) => tag !== "cover", "Cover is set with the Cover button, not as a tag.");

/**
 * An attachment's tags apart from cover, deduplicated once lower-cased. The
 * bound keeps a crafted array small, as attachmentIdsSchema's does.
 */
export const attachmentTagsSchema = z
  .array(attachmentTagSchema)
  .max(20, "That is too many tags. Remove a few first.")
  .transform((tags) => [...new Set(tags)]);
