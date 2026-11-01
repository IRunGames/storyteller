"use server";

import { and, asc, count, desc, ilike, inArray, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import { userListQuerySchema, type UserSortKey } from "@/lib/user-list-schemas";
import type { UserStatus } from "@/lib/user-types";

const { vUsers, userTypes } = schema;

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
