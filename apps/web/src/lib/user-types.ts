/**
 * The s_user_types rows (db/seeds/seed_s_user_types.sql) by name. The smaller
 * the id, the more the account may do: a player is -10, an administrator -100.
 * Each tier is its unpaid type then its paid one, five apart.
 * isUserTypeShown leans on that order rather than on this list, so a type
 * added later between two of these ranks by its id alone.
 */
export const USER_TYPES = {
  unpaidPlayer: -10,
  paidPlayer: -15,
  unpaidStoryteller: -20,
  paidStoryteller: -25,
  administrator: -100,
} as const;

/**
 * The one-word states v_users gives an account (db/views/v_users.sql): a
 * guest who came in by a join link, an account switched off, or an account
 * in use. In the order the Users page lists them.
 */
export const USER_STATUSES = ["active", "inactive", "guest"] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Who something is shown to, by s_user_types id: strictly below one type,
 * strictly above one, or between. "Above" is more powerful, so a smaller id.
 */
export type UserTypeRule = { showBelow?: number; showAbove?: number };

/**
 * Whether an account of type `idUserType` passes `rule`. Both bounds are
 * strict, so showAbove unpaidPlayer is every type but the player. A rule
 * with neither bound shows nothing: hidden is the default, as with
 * isShownIn in lib/environment.ts.
 */
export function isUserTypeShown(idUserType: number, rule: UserTypeRule): boolean {
  if (rule.showBelow === undefined && rule.showAbove === undefined) return false;
  if (rule.showBelow !== undefined && idUserType <= rule.showBelow) return false;
  if (rule.showAbove !== undefined && idUserType >= rule.showAbove) return false;
  return true;
}
