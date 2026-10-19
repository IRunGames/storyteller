import { z } from "zod";
import { ELEMENT_KINDS, isWebUrl } from "./elements";

// An external link on an element, or on its link to a scene: a full web
// address or nothing, and the words to show for it. The address is checked
// the way the pill checks it (isWebUrl), so what the form accepts is what
// the players can follow.
export const linkUrlSchema = z
  .string()
  .trim()
  .max(2000, "Keep the link under 2000 characters.")
  .refine(
    (url) => url === "" || isWebUrl(url),
    "Please enter a full web address, starting with http:// or https://.",
  );
export const linkTextSchema = z
  .string()
  .trim()
  .max(200, "Keep the link text under 200 characters.");

// One schema for creating and editing an element: both forms post the same
// fields. The status is not among them; a new element takes the workflow's
// default, and it moves by its pill from then on.
export const elementSchema = z.object({
  kind: z.enum(ELEMENT_KINDS, { error: "Choose what kind of element this is." }),
  name: z
    .string()
    .trim()
    .min(1, "Please give the element a name.")
    .max(200, "Keep the name under 200 characters."),
  initialName: z.string().trim().max(200, "Keep the initial name under 200 characters."),
  title: z.string().trim().max(200, "Keep the title under 200 characters."),
  description: z.string().trim().max(8000, "Keep the description under 8000 characters."),
  notes: z.string().trim().max(8000, "Keep the notes under 8000 characters."),
  url: linkUrlSchema,
  urlText: linkTextSchema,
});

export type ElementValues = z.infer<typeof elementSchema>;

// The run page's element form, for a new element from a stack's + and for
// editing one from its info popover: every field the board's form has, and
// both statuses besides, the element's own in the story and its link's in
// the scene, since at the table both are set in the one place. The action
// checks each against its workflow.
const statusKeySchema = z.string().trim().min(1, "Choose a status.").max(64);
export const runElementSchema = elementSchema.extend({
  status: statusKeySchema,
  sceneStatus: statusKeySchema,
  // The link's own link, for this scene, in front of the element's.
  sceneUrl: linkUrlSchema,
  sceneUrlText: linkTextSchema,
});

export type RunElementValues = z.infer<typeof runElementSchema>;

// The library's info popover edits an element of the story whether or not
// it is in the scene, so only the element's own status comes with its fields.
export const runStoryElementSchema = elementSchema.extend({ status: statusKeySchema });

/**
 * One of an element's own tags as a storyteller types it in the element
 * panel's Tags editor: trimmed, lower-cased so "Map" and "map" are one tag,
 * and short enough to sit in a chip, as an attachment's tags are
 * (attachmentTagSchema). No tag is set apart here: an element has no cover
 * among its tags, that being its picture's use.
 */
export const elementTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Please enter a tag.")
  .max(40, "Keep a tag under 40 characters.");

/** An element's tags, deduplicated once lower-cased; the bound keeps a crafted array small. */
export const elementTagsSchema = z
  .array(elementTagSchema)
  .max(20, "That is too many tags. Remove a few first.")
  .transform((tags) => [...new Set(tags)]);
