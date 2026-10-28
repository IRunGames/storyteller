import type { DbUser } from "@/lib/authorize";

/**
 * The signed-in user as every logged-in page sees it, on the server and in
 * the browser. A deliberate subset of the `users` row: what a page may show
 * or key on, and nothing that is only the server's business.
 */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  nickName: string | null;
  /** The s_user_types row the account is on, which decides what the table offers; see lib/diagnostics.ts. */
  idUserType: number;
  /** A guest who came in by a join link and has no account yet; see docs/auth.md. */
  isAnonymous: boolean;
};

// Picks the fields explicitly rather than spreading the row, so a column
// added to `users` later does not start shipping to the browser by accident.
export function toCurrentUser(row: DbUser): CurrentUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    nickName: row.nickName,
    idUserType: row.idUserType,
    isAnonymous: row.isAnonymous,
  };
}
