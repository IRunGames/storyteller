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

// The run page's element form, for a new element from a stack's + and for
// editing one from its info popover: every field the board's form has, and
// both statuses besides, the element's own in the story and its link's in
// the scene, since at the table both are set in the one place. The action
// checks each against its workflow.
const statusKeySchema = z.string().trim().min(1, "Choose a status.").max(64);
export const runElementSchema = elementSchema.extend({
  status: statusKeySchema,
  sceneStatus: statusKeySchema,
});

export type RunElementValues = z.infer<typeof runElementSchema>;
