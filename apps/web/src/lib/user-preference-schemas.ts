import { z } from "zod";

// What the user_preferences.preferences column can hold: any JSON value, so a
// preference may be a flag, a number, a list or a nested object without a
// schema change. The type is spelled out because the schema is recursive and
// zod cannot infer a type that refers to itself.
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type UserPreferenceMap = Record<string, JsonValue>;

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const MAX_VALUE_LENGTH = 10_000;

// Shared by the preferences provider and the sa_setUserPreference action, so
// the client and the server refuse the same things. The size cap is on the
// serialised value: the row holds every preference for a user in one jsonb
// column, and one runaway value would slow every page load that reads it.
export const setUserPreferenceSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "A preference needs a key.")
      .max(100, "Keep the key under 100 characters."),
    value: jsonValueSchema,
  })
  .refine((input) => JSON.stringify(input.value).length <= MAX_VALUE_LENGTH, {
    error: `Keep a preference under ${MAX_VALUE_LENGTH} characters.`,
    path: ["value"],
  });

export type SetUserPreferenceInput = z.infer<typeof setUserPreferenceSchema>;
