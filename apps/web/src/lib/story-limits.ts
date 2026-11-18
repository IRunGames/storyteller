import { USER_TYPES } from "./user-types";

/**
 * How many active stories an account may own at a time: fifteen for a paid
 * storyteller, and for an administrator, whose rank is above it; three for
 * everyone else. Active is stories.is_active on a story that is not
 * archived. The limit holds wherever a story becomes active: New story is
 * refused at it (sa_createStory), and so is bringing a story back from Edit
 * story or the Stories list's status pill.
 */
export function activeStoryLimit(idUserType: number): number {
  return idUserType <= USER_TYPES.paidStoryteller ? 15 : 3;
}

/** What a refusal at the limit says, and the disabled New story button's tooltip. */
export function activeStoryLimitMessage(limit: number): string {
  return `You already have ${limit} active stories, the most at a time. Make one inactive to start or bring back another.`;
}

/** What the Stories page needs to say whether New story is open: the active stories owned, and the limit. */
export type StoryAllowance = { active: number; limit: number };
