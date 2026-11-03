"use server";

import { and, asc, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { listStatusOptions } from "@/db/status-options";
import { requireAdmin } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import { statusLabel, transitionsFrom, type StatusOption } from "@/lib/status";
import { userListQuerySchema, type UserSortKey } from "@/lib/user-list-schemas";
import type { UserStatus } from "@/lib/user-types";

const { user, vUsers, userTypes } = schema;

// The administrators' Users page. Every action here starts with
// requireAdmin(); the wrench that leads to the page is only drawn for an
// administrator, which decides nothing on its own.

/** One row of the Users table, from v_users. */
export type AdminUser = {
  id: string;
  name: string;
  nickName: string | null;
  email: string;
  idUserType: number;
  userTypeName: string;
  status: UserStatus;
  createdAt: Date;
  lastLogin: Date;
  hoursPlayed: number;
};

/** One page of the table and how many rows the whole query has. */
export type UserListPage = { rows: AdminUser[]; total: number };

/** An s_user_types row, for the page's type filters. */
export type UserTypeOption = { idUserType: number; label: string };

/** Every account type, least powerful first, as the Users page lists its filters. */
export async function sa_listUserTypes(): Promise<UserTypeOption[]> {
  await requireAdmin();
  return db
    .select({ idUserType: userTypes.idUserType, label: userTypes.userTypeName })
    .from(userTypes)
    .orderBy(desc(userTypes.idUserType));
}

const SORT_COLUMNS = {
  name: vUsers.name,
  email: vUsers.email,
  userTypeName: vUsers.userTypeName,
  status: vUsers.status,
  createdAt: vUsers.createdAt,
  lastLogin: vUsers.lastLogin,
  hoursPlayed: vUsers.hoursPlayed,
} satisfies Record<UserSortKey, unknown>;

/**
 * One page of users for the table, filtered, sorted and counted in the
 * database rather than in the browser: there is no ceiling on how many
 * accounts there are, so the page never downloads them all. The search runs
 * over s_users.search_text (name, email and nickname together); a query
 * that shows no status or no type has nothing to show and is answered
 * without asking the database. Bad input throws rather than coming back as
 * field errors: the page builds the query itself, so there is nothing for a
 * person to correct.
 */
export async function sa_listUsers(input: unknown): Promise<UserListPage> {
  await requireAdmin();
  const query = userListQuerySchema.parse(input);
  if (query.statuses.length === 0 || query.idUserTypes.length === 0) {
    return { rows: [], total: 0 };
  }

  const conditions: SQL[] = [
    inArray(vUsers.status, query.statuses),
    inArray(vUsers.idUserType, query.idUserTypes),
  ];
  if (query.search !== "") conditions.push(ilike(vUsers.searchText, likeContains(query.search)));
  const where = and(...conditions);
  const column = SORT_COLUMNS[query.sortBy];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: vUsers.id,
        name: vUsers.name,
        nickName: vUsers.nickName,
        email: vUsers.email,
        idUserType: vUsers.idUserType,
        userTypeName: vUsers.userTypeName,
        status: vUsers.status,
        createdAt: vUsers.createdAt,
        lastLogin: vUsers.lastLogin,
        hoursPlayed: vUsers.hoursPlayed,
      })
      .from(vUsers)
      .where(where)
      // The id second, so two rows alike in the sorted column keep one
      // order from page to page.
      .orderBy(query.sortDesc ? desc(column) : asc(column), asc(vUsers.id))
      .limit(query.pageSize)
      .offset(query.page * query.pageSize),
    db.select({ total: count() }).from(vUsers).where(where),
  ]);
  return { rows, total };
}

/**
 * The statuses of the Users Status Workflow in its order, for the status
 * chip on every row. s_users is not one of the status pill's tables
 * (lib/status.ts): its rows are keyed by uuid and gated by requireAdmin()
 * rather than owned through a story, so the Users page has actions of its
 * own over the same query (db/status-options.ts).
 */
export async function sa_listUserStatusOptions(): Promise<StatusOption[]> {
  await requireAdmin();
  return listStatusOptions("s_users");
}

export type SetUserStatusResult = { ok: true; status: UserStatus } | { ok: false; error: string };

const idUserSchema = z.uuid();

// A status key is only ever compared against the workflow's own list, never
// interpolated, but a bound on the length keeps a runaway string out of the
// query altogether.
const statusKeySchema = z.string().min(1).max(64);

/**
 * Move one account to a new status of the Users Status Workflow, taking
 * effect on that account's next request (the gate reads the row every
 * time). The administrator's own row is refused, so no one can lock themself
 * out from this page; a guest's is refused because a guest is deleted rather
 * than switched off (db/views/v_users.sql).
 *
 * The transition is checked against the workflow here and again by the
 * database's own trigger, which is the one that counts. A refusal comes back
 * as `ok: false` with something the chip can say, because there is nothing
 * the caller can fix by trying differently. The row's id_updated_by_user is
 * set to the administrator, and the transition trigger copies it into the
 * activity log entry it writes, so the change records who made it.
 */
export async function sa_setUserStatus(
  idUser: string,
  status: string,
): Promise<SetUserStatusResult> {
  const admin = await requireAdmin();
  const id = idUserSchema.parse(idUser);
  const next = statusKeySchema.parse(status);

  if (id === admin.id) return { ok: false, error: "You cannot change your own status." };

  const options = await listStatusOptions("s_users");
  if (!options.some((option) => option.key === next)) {
    return { ok: false, error: `${statusLabel(next)} is not a status of this workflow.` };
  }

  // A row that is not there and a guest answer the same way: neither has a
  // status an administrator may set, and the page never shows a chip that
  // opens for either.
  const [row] = await db
    .select({ status: user.status, isAnonymous: user.isAnonymous })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  if (!row || row.isAnonymous) {
    return { ok: false, error: "That account's status cannot be changed." };
  }
  const shown = (key: string) => key.toLowerCase() as UserStatus;
  if (row.status === next) return { ok: true, status: shown(next) };

  if (!transitionsFrom(row.status, options).some((option) => option.key === next)) {
    return {
      ok: false,
      error: `${statusLabel(row.status)} cannot move to ${statusLabel(next).toLowerCase()}.`,
    };
  }

  // The WHERE repeats the status the check was made against, so two
  // administrators moving the same account at once cannot both win: the
  // second update matches nothing and says so rather than overwriting a move
  // it never saw.
  try {
    const updated = await db
      .update(user)
      .set({ status: next, idUpdatedByUser: admin.id })
      .where(and(eq(user.id, id), eq(user.status, row.status)))
      .returning({ status: user.status });
    if (updated.length === 0) {
      return { ok: false, error: "That status changed while you were looking; try again." };
    }
    return { ok: true, status: shown(updated[0].status) };
  } catch {
    // The transition trigger raises rather than returns. Whatever it objected
    // to, the row is as it was, and the message it raises names database
    // internals, so the chip says the plain thing instead.
    return { ok: false, error: "The database refused that change." };
  }
}
