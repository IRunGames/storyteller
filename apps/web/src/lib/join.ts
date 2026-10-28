import { USER_TYPES } from "@/lib/user-types";

/**
 * How many people may take a seat at one story through its join link, by
 * the storyteller's s_user_types id. Only seats from the link count
 * (story_players.is_from_link): players the storyteller invited, or who
 * joined a story looking for players, are not capped by this.
 */
export const JOIN_CAP_UNPAID = 3;
export const JOIN_CAP_PAID = 10;

// isUserTypeShown's order: a smaller id may do more, so a paid storyteller
// and anything above it (an administrator) gets the larger table.
export function joinCap(idUserType: number): number {
  return idUserType <= USER_TYPES.paidStoryteller ? JOIN_CAP_PAID : JOIN_CAP_UNPAID;
}

export const TABLE_FULL = "This table is full.";
