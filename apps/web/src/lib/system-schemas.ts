import { z } from "zod";

const MAX = 120;

/**
 * A trimmed optional part of a system's name: "" becomes null, as the
 * column holds it. Null is taken as input too, because the dialog's
 * resolver runs this schema and posts its output, null and all, to the
 * action, which runs it again.
 */
const part = (what: string) =>
  z
    .string()
    .nullable()
    .transform((text) => (text ?? "").trim() || null)
    .refine((text) => text === null || text.length <= MAX, {
      message: `Keep the ${what} under ${MAX} characters.`,
    });

/**
 * A system's own fields, as the New system dialog and the editor page's
 * details form post them. A system is named by all three together
 * ("Cypher System", "Revised", "Numenera"), which the systems table holds
 * unique; only the name is required, since most systems have one edition and
 * no setting. Shared by the dialog's resolver and the action.
 */
export const systemFieldsSchema = z.object({
  systemName: z
    .string()
    .trim()
    .min(1, "Please enter a name.")
    .max(MAX, `Keep the name under ${MAX} characters.`),
  systemVersion: part("version"),
  variant: part("variant"),
});

export type SystemFieldsInput = z.input<typeof systemFieldsSchema>;
export type SystemFieldsValues = z.output<typeof systemFieldsSchema>;
