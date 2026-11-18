import { z } from "zod";
import { longTextSchema } from "@/lib/schemas";

// A session's title as the run page's header edits it. Optional, as the
// column is: an empty title clears it, and the header goes back to
// "Session 3".
export const sessionTitleSchema = z
  .string()
  .trim()
  .max(200, "Keep the title under 200 characters.")
  .transform((title) => title || null);

// The Timeline's edit panel: the title as the header edits it, and the three
// things the storyteller keeps about a sitting, all of which may be empty.
export const sessionEditSchema = z.object({
  title: sessionTitleSchema,
  summary: longTextSchema("summary"),
  notes: longTextSchema("notes"),
  lingeringQuestions: longTextSchema("lingering questions"),
});

export type SessionEditInput = z.input<typeof sessionEditSchema>;
export type SessionEditValues = z.infer<typeof sessionEditSchema>;

// The tables' session panel (SessionNotesPopover): the two things written
// up as a session is played, by the storyteller and the players alike.
export const sessionNotesSchema = sessionEditSchema.pick({ notes: true, lingeringQuestions: true });

export type SessionNotesValues = z.infer<typeof sessionNotesSchema>;
