import { z } from "zod";
import { USER_STATUSES } from "@/lib/user-types";

/** The columns the administrators' Users table sorts by, as sa_listUsers names them. */
export const USER_SORT_KEYS = [
  "name",
  "email",
  "userTypeName",
  "status",
  "createdAt",
  "lastLogin",
  "hoursPlayed",
] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];

/** How many users one page of the table may hold. */
export const USER_PAGE_SIZES = [25, 50, 100] as const;
export type UserPageSize = (typeof USER_PAGE_SIZES)[number];

/**
 * What the Users page asks sa_listUsers for: a search over name, nickname
 * and email, the statuses and types to show (anything not named is hidden),
 * the sort and the page. The page builds it and sends the whole thing each
 * time, so the server never holds state for the table.
 */
export const userListQuerySchema = z.object({
  search: z.string().trim().max(200),
  statuses: z.array(z.enum(USER_STATUSES)).max(USER_STATUSES.length),
  idUserTypes: z.array(z.number().int()).max(50),
  sortBy: z.enum(USER_SORT_KEYS),
  sortDesc: z.boolean(),
  page: z.number().int().min(0).max(100_000),
  pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

/** The query the page opens with: everyone, newest first, 25 to a page. */
export function defaultUserListQuery(idUserTypes: number[]): UserListQuery {
  return {
    search: "",
    statuses: [...USER_STATUSES],
    idUserTypes,
    sortBy: "createdAt",
    sortDesc: true,
    page: 0,
    pageSize: 25,
  };
}
