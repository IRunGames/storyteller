import { z } from "zod";

// A session's title as the run page's header edits it. Optional, as the
// column is: an empty title clears it, and the header goes back to
// "Session 3".
export const sessionTitleSchema = z
  .string()
  .trim()
  .max(200, "Keep the title under 200 characters.")
  .transform((title) => title || null);

const sessionText = (label: string) =>
  z.string().trim().max(8000, `Keep the ${label} under 8000 characters.`);

// The Timeline's edit panel: the title as the header edits it, and the three
// things the storyteller keeps about a sitting, all of which may be empty.
export const sessionEditSchema = z.object({
  title: sessionTitleSchema,
  summary: sessionText("summary"),
  notes: sessionText("notes"),
  lingeringQuestions: sessionText("lingering questions"),
});

export type SessionEditInput = z.input<typeof sessionEditSchema>;
export type SessionEditValues = z.infer<typeof sessionEditSchema>;
