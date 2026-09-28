import { z } from "zod";

import { attachmentIdsSchema } from "@/lib/attachment-schemas";

// A <select> posts "" for "no system" and a string for a chosen one; the
// preprocess turns both into what the stories.id_system column wants.
const idSystem = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
  z.number().int().nullable(),
);

// One schema for creating and editing: both forms post the same fields.
const storyFields = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Please give the story a title.")
    .max(200, "Keep the title under 200 characters."),
  idSystem,
  summary: z.string().trim().max(4000, "Keep the summary under 4000 characters."),
  /**
   * The attachments the New story form collected before the story existed,
   * for sa_createStory to claim once it has an id. The edit form's field
   * attaches its rows to the story as they are made and posts none, so this
   * defaults to empty and sa_updateStory ignores it; it is validated here all
   * the same, because the server re-runs whatever the client sent.
   */
  attachmentIds: attachmentIdsSchema.default([]),
  isLookingForPlayers: z.boolean(),
  isActive: z.boolean(),
  isArchived: z.boolean(),
});

/**
 * An archived story is neither active nor looking for players. The form
 * unticks both when Archive is pressed, and this repeats that on the server,
 * so a request that skipped the form cannot archive a story and leave it
 * open at the same time. A transform rather than a refine: the combination
 * is not an error to report, it is one the archive flag simply overrides.
 */
export const storySchema = storyFields.transform((values) =>
  values.isArchived ? { ...values, isActive: false, isLookingForPlayers: false } : values,
);

export type StoryValues = z.infer<typeof storySchema>;
