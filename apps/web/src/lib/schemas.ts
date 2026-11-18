import { z } from "zod";

// The fragments every feature's schema is built from, declared once so the
// rule (and the message) is the same wherever a form or an action checks the
// same kind of thing. A feature's own schema in lib/<feature>-schemas.ts
// composes these; an action imports what it checks by hand straight from here.

/**
 * An id as every id column holds it: z.int32() is exactly int4, so the range
 * lives in Zod and not in a pattern of our own (docs/standards.md). Negative
 * ids are the seeds' and are as valid as any other; an id outside the range
 * is a query error rather than a missing row, which is why it is refused here.
 */
export const idSchema = z.int32();

/** How far into a list a page starts: a whole number from zero up. */
export const offsetSchema = z.number().int().min(0);

/**
 * What someone typed into a search box, trimmed. 200 characters is more than
 * any title it could match and keeps an ILIKE pattern short.
 */
export const searchSchema = z.string().trim().max(200);

/**
 * The title of a story, a scene or a session: required, trimmed, at most
 * 200 characters. `what` names the thing in the message when it is missing,
 * so the form says "Please give the scene a title."
 */
export const titleSchema = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `Please give the ${what} a title.`)
    .max(200, "Keep the title under 200 characters.");

/**
 * A description, notes or summary: trimmed, may be empty, at most 8000
 * characters. `label` names the field in the message, as the form shows it.
 */
export const longTextSchema = (label: string) =>
  z.string().trim().max(8000, `Keep the ${label} under 8000 characters.`);

/**
 * An id chosen in a <select> whose empty option means none: the browser posts
 * "" for that and a string for a row, and a client that already has the
 * number posts it as one. All three become what a nullable id column wants.
 */
export const selectIntSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
  idSchema.nullable(),
);
