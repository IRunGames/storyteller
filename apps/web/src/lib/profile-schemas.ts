import { z } from "zod";
import { PROFILE_COLORS, type ProfileColor } from "@/lib/profile";

// Shared by the profile card and its actions, so the client and the server
// refuse the same things. The colour, picture and status are saved through
// sa_setUserPreference, which takes any JSON; the card checks them against
// these before it hands them over, since that action cannot know what a
// profile key should hold.

/** The name, nickname and bio, which live on s_users. */
export const profileDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Your name cannot be empty.")
    .max(100, "Keep your name under 100 characters."),
  // A cleared nickname is stored as "", which the rest of the app already
  // reads as none (see displayName in nav-account-menu.tsx).
  nickName: z.string().trim().max(50, "Keep your nickname under 50 characters."),
  bio: z.string().trim().max(1000, "Keep your bio under 1000 characters."),
});

export type ProfileDetails = z.infer<typeof profileDetailsSchema>;

/** What is on the user's mind, in the bubble beside their picture. */
export const profileStatusSchema = z
  .string()
  .trim()
  .max(140, "Keep your thought under 140 characters.");

/**
 * A picture linked from elsewhere. https only: the page is served over https,
 * so an http picture would be blocked as mixed content, and anything that is
 * not a web address at all has no business in an <img src>.
 */
export const avatarUrlSchema = z
  .string()
  .trim()
  .max(2000, "That link is too long.")
  .pipe(z.url({ protocol: /^https$/, error: "Link a picture with an https:// address." }));

const colorValues = PROFILE_COLORS.map((color) => color.value) as [ProfileColor, ...ProfileColor[]];

/** One of the palette's colours and nothing else. */
export const profileColorSchema = z.enum(colorValues, { error: "Pick one of the colours." });

// systems.id_system is int4; anything outside it is a query error to
// Postgres rather than "not found", so it is refused before the query.
export const systemIdSchema = z.number().int().min(-2147483648).max(2147483647);

/** How many systems a profile may list as liked. */
export const MAX_LIKED_SYSTEMS = 20;
