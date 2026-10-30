import { z } from "zod";
import { USER_TYPES } from "@/lib/user-types";

/**
 * How long an invitation's link works for. An administrator can push it out
 * from the Invitations page; a storyteller revokes and invites again.
 */
export const INVITE_TTL_DAYS = 14;

/**
 * The address an invitation is sent to. Lower-cased as well as trimmed, so
 * the database's one-live-invitation-per-email indexes see "Ada@x.com" and
 * "ada@x.com" as the same person.
 */
export const inviteEmailSchema = z
  .string()
  .trim()
  .min(1, "Please enter an email.")
  .pipe(z.email("Please enter a valid email."))
  .transform((email) => email.toLowerCase());

/**
 * The types an administrator may invite someone to. Only the paid ones: an
 * unpaid account is what open signup already gives, and an administrator is
 * made by hand, not by a link anyone holding it could follow.
 */
export const INVITE_USER_TYPES = [
  { value: USER_TYPES.paidPlayer, label: "Paid Player" },
  { value: USER_TYPES.paidStoryteller, label: "Paid Storyteller" },
] as const;

// A <select> posts a string, so the value is coerced before it is checked
// against the list.
const inviteUserTypeSchema = z.coerce
  .number()
  .refine((value) => INVITE_USER_TYPES.some((type) => type.value === value), {
    message: "Pick Paid Player or Paid Storyteller.",
  });

/** The storyteller's Invite by email form. */
export const storyInviteSchema = z.object({ email: inviteEmailSchema });
export type StoryInviteInput = z.input<typeof storyInviteSchema>;
export type StoryInviteValues = z.infer<typeof storyInviteSchema>;

/** The administrator's New invitation form. */
export const appInviteSchema = z.object({
  email: inviteEmailSchema,
  idUserType: inviteUserTypeSchema,
});
export type AppInviteInput = z.input<typeof appInviteSchema>;
export type AppInviteValues = z.infer<typeof appInviteSchema>;

/**
 * The administrator's Edit dialog. The type is only read for an app
 * invitation; a story invitation's stays null. expiresAt arrives as the
 * date input's yyyy-mm-dd and must not be in the past, or the edit would
 * kill the link rather than change it.
 */
export const invitationEditSchema = z.object({
  email: inviteEmailSchema,
  idUserType: inviteUserTypeSchema.optional(),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
    .refine((day) => new Date(`${day}T23:59:59`) > new Date(), {
      message: "Pick a day that has not passed.",
    }),
});
export type InvitationEditInput = z.input<typeof invitationEditSchema>;
export type InvitationEditValues = z.infer<typeof invitationEditSchema>;
