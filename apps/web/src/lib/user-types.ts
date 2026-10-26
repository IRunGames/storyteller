/**
 * The s_user_types rows (db/seeds/seed_s_user_types.sql) by name. The smaller
 * the id, the more the account may do: a player is -1, an administrator -100.
 * isUserTypeShown leans on that order rather than on this list, so a type
 * added later between two of these ranks by its id alone.
 */
export const USER_TYPES = {
  unpaidPlayer: -1,
  unpaidStoryteller: -2,
  paidStoryteller: -3,
  administrator: -100,
} as const;

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
