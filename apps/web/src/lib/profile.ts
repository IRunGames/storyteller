import type { JsonValue } from "@/lib/user-preference-schemas";

/**
 * The user_preferences keys the profile card keeps. The card's colour, picture
 * and status live in the preference map rather than on s_users because they
 * are how the user dresses their profile, not facts about the account.
 */
export const PROFILE_PREFERENCE_KEYS = {
  color: "profile.color",
  avatarUrl: "profile.avatarUrl",
  status: "profile.status",
} as const;

/**
 * The colours a profile's banner may be. A fixed list rather than a free
 * colour picker because the banner sits on the app's dark surfaces, and these
 * are mid-to-bright hues picked to stand out against them; a free choice
 * would let someone pick a near-black that disappears into the page.
 */
export const PROFILE_COLORS = [
  { value: "#E5484D", label: "Red" },
  { value: "#F76B15", label: "Orange" },
  { value: "#FFC53D", label: "Amber" },
  { value: "#AD7F58", label: "Bronze" },
  { value: "#46A758", label: "Green" },
  { value: "#12A594", label: "Teal" },
  { value: "#00A2C7", label: "Cyan" },
  { value: "#3E63DD", label: "Blue" },
  { value: "#6E56CF", label: "Violet" },
  { value: "#AB4ABA", label: "Purple" },
  { value: "#D6409F", label: "Pink" },
  { value: "#8B8D98", label: "Slate" },
] as const;

export type ProfileColor = (typeof PROFILE_COLORS)[number]["value"];

/** The banner colour of a profile whose owner has not chosen one. */
export const DEFAULT_PROFILE_COLOR: ProfileColor = "#6E56CF";

/**
 * The banner colour from the stored preference, or the default when none is
 * stored or what is stored is not one of the palette's: a colour since
 * removed from the list, or a hand-edited row, falls back rather than
 * painting something the palette never offered.
 */
export function profileColor(stored: JsonValue | undefined): ProfileColor {
  return chosenProfileColor(stored) ?? DEFAULT_PROFILE_COLOR;
}

/**
 * The colour the user chose, or null when they have not chosen one of the
 * palette's. For the places that have their own colour to fall back on, as
 * the table chat has a colour per name, rather than painting everyone who
 * never chose in the banner's default.
 */
export function chosenProfileColor(stored: JsonValue | undefined): ProfileColor | null {
  return PROFILE_COLORS.find((color) => color.value === stored)?.value ?? null;
}

/**
 * The picture to show for a user: the one stored in their preferences, else
 * the one their sign-in provider gave (s_users.image), else none, which the
 * avatar shows as initials. A blank string is treated as none at both steps
 * because a cleared field is stored as "" or null.
 */
export function avatarSrc(stored: JsonValue | undefined, image: string | null): string | null {
  if (typeof stored === "string" && stored !== "") return stored;
  return image || null;
}

/** A system on a profile's "Systems I like" list, or a match in its search. */
export type LikedSystem = { idSystem: number; label: string };

/** What the profile card shows that the CurrentUser in context does not carry. */
export type Profile = {
  name: string;
  email: string;
  nickName: string | null;
  bio: string | null;
  /** The sign-in provider's picture, which the card falls back to. */
  image: string | null;
  /** When the account was made: the card's "Member Since". */
  createdAt: Date;
  systems: LikedSystem[];
};
