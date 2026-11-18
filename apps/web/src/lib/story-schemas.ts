import { z } from "zod";
import { selectIntSchema, titleSchema } from "@/lib/schemas";

// One schema for creating and editing: both forms post the same fields.
const storyFields = z.object({
  title: titleSchema("story"),
  // The system <select> posts "" for "no system", which the column holds as null.
  idSystem: selectIntSchema,
  summary: z.string().trim().max(4000, "Keep the summary under 4000 characters."),
  isLookingForPlayers: z.boolean(),
  isActive: z.boolean(),
  isArchived: z.boolean(),
  /** Anyone signed in may read its sessions; else only the storyteller and players. */
  isPublic: z.boolean(),
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
