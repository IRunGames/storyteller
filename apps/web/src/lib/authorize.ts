import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSession } from "@/lib/require-session";

export type DbUser = typeof schema.user.$inferSelect;

/** Thrown when an action is reached without a live session and active user. */
export class UnauthorizedError extends Error {
  constructor(message = "You need to be signed in to do that.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * The gate every server action passes through. A session cookie alone is not
 * enough: the user must still exist in `users` and be active, so a deleted or
 * deactivated account cannot keep acting on a cookie that has not expired.
 *
 * Returns the database row, so callers use `user.id` from here and never an id
 * sent by the client.
 *
 * Wrapped in React's cache() like getSession(): the Stories page runs three
 * list actions in parallel and each one calls this, which would otherwise be
 * three identical `users` lookups per render. Outside a React render cache()
 * is a pass-through, so a server action invoked on its own still re-checks.
 */
export const requireUser = cache(async function requireUser(): Promise<DbUser> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, session.user.id),
  });
  if (!user || !user.isActive) throw new UnauthorizedError();

  return user;
});

/**
 * The gate for every server action a guest must not reach: requireUser()
 * and then a refusal for an anonymous user, the guest who came in by a
 * story's join link (lib/auth.ts). A guest's pages only read the table they
 * joined, so a guest calling anything else has gone around those pages;
 * the few actions that serve them stay on requireUser(), and
 * authorize-guard.test.ts names them.
 */
export async function requireAccount(): Promise<DbUser> {
  const user = await requireUser();
  if (user.isAnonymous) throw new UnauthorizedError("You need an account to do that.");
  return user;
}
