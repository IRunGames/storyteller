// The user a database test signs in as, and owns its fixtures as. Each test
// file makes its own, under an @example.test address with no s_accounts row,
// so nobody can log in as it and nothing a test writes or deletes lands on a
// real person's rows. The dev database is also where the owner plays: never
// sign a test in as a seeded or @irun.games account, whose preferences,
// feedback and chats the cleanup would wipe (real-accounts.test.ts checks).
import { eq } from "drizzle-orm";
import type { db as Db, schema as Schema } from "@/db";

const TEST_DOMAIN = "@example.test";

function checked(email: string) {
  if (!email.endsWith(TEST_DOMAIN)) {
    throw new Error(`A test user's email must end in ${TEST_DOMAIN}, not ${email}.`);
  }
  return email;
}

/** Makes the test user afresh, clearing one a crashed run left, and returns its id. */
export async function makeTestUser(db: typeof Db, tables: typeof Schema, email: string) {
  await removeTestUser(db, tables, email);
  const [made] = await db
    .insert(tables.user)
    .values({ name: "Test User", email: checked(email) })
    .returning({ id: tables.user.id });
  return made.id;
}

/**
 * Removes the test user. Its sessions, favourites and news reads go with it;
 * its preferences and seats in stories are removed first, as they hold it
 * back; audit columns that named it are left null.
 */
export async function removeTestUser(db: typeof Db, tables: typeof Schema, email: string) {
  const [found] = await db
    .select({ id: tables.user.id })
    .from(tables.user)
    .where(eq(tables.user.email, checked(email)));
  if (!found) return;
  await db.delete(tables.userPreferences).where(eq(tables.userPreferences.idUser, found.id));
  await db.delete(tables.userSystems).where(eq(tables.userSystems.idUser, found.id));
  await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idUser, found.id));
  await db.delete(tables.user).where(eq(tables.user.id, found.id));
}
