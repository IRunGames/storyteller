"use server";

import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { setUserPreferenceSchema, type UserPreferenceMap } from "@/lib/user-preference-schemas";

const { userPreferences } = schema;

// The preferences provider's server actions. They live beside the provider
// rather than under a route because (app)/layout.tsx mounts it on every
// signed-in page, so no single page owns them. Both start by proving who is
// asking, like every other action; the caller's id is the only user id that
// ever reaches a query.

export type SetUserPreferenceResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * The caller's whole preference map. A user who has never set anything has no
 * row yet, which reads as an empty map rather than a missing one, so the
 * provider never has to know whether the row exists.
 */
export async function sa_getUserPreferences(): Promise<UserPreferenceMap> {
  const user = await requireUser();

  const [row] = await db
    .select({ preferences: userPreferences.preferences })
    .from(userPreferences)
    .where(eq(userPreferences.idUser, user.id));

  return row?.preferences ?? {};
}

/**
 * Stores one key for the caller. A single upsert merges the new pair into the
 * existing map with jsonb's `||`, so there is no read-modify-write: two tabs
 * setting different keys at once both land, and the same key set twice keeps
 * the later value. updated_at comes from the table's trigger.
 */
export async function sa_setUserPreference(input: unknown): Promise<SetUserPreferenceResult> {
  const user = await requireUser();

  const parsed = setUserPreferenceSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const { key, value } = parsed.data;
  await db
    .insert(userPreferences)
    .values({
      idUser: user.id,
      preferences: { [key]: value },
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .onConflictDoUpdate({
      target: userPreferences.idUser,
      set: {
        preferences: sql`${userPreferences.preferences} || excluded.preferences`,
        idUpdatedByUser: user.id,
      },
    });

  return { ok: true };
}
