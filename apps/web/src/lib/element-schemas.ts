import { z } from "zod";
import { ELEMENT_KINDS } from "./elements";

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
});

export type ElementValues = z.infer<typeof elementSchema>;
