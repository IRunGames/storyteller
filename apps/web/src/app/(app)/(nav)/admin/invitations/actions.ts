"use server";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/db";
import { ALREADY_INVITED, createInvitation, emailInvitation } from "@/db/invitations";
import { requireAdmin } from "@/lib/authorize";
import { appInviteSchema, invitationEditSchema } from "@/lib/invitation-schemas";

const { invitations, stories, userTypes, user: users } = schema;
const acceptedBy = alias(users, "accepted_by");

// The administrators' Invitations page. Every action here starts with
// requireAdmin(); the wrench that leads to the page is only drawn for an
// administrator, which decides nothing on its own.

const idSchema = z.number().int().positive().max(2147483647);

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type AdminInvitation = {
  idInvitation: number;
  kind: "app" | "story";
  email: string;
  token: string;
  /** The story's title for a story invitation, the type's name for an app one. */
  target: string;
  idUserType: number | null;
  inviter: string;
  createdAt: Date;
  expiresAt: Date;
  status: InvitationStatus;
  acceptedBy: string | null;
};

const statusSql = sql<InvitationStatus>`case
  when ${invitations.acceptedAt} is not null then 'accepted'
  when ${invitations.revokedAt} is not null then 'revoked'
  when ${invitations.expiresAt} <= now() then 'expired'
  else 'pending' end`;

/**
 * Every invitation, the administrators' and the storytellers' alike, newest
 * first, for the page's table to search, sort and filter in the browser.
 * The status is worked out here from the row's stamps so the table and the
 * Edit dialog agree on what can still be changed.
 */
export async function sa_listInvitations(): Promise<AdminInvitation[]> {
  await requireAdmin();
  return db
    .select({
      idInvitation: invitations.idInvitation,
      kind: sql<
        "app" | "story"
      >`case when ${invitations.idStory} is null then 'app' else 'story' end`,
      email: invitations.email,
      token: invitations.token,
      target: sql<string>`coalesce(${stories.title}, ${userTypes.userTypeName}, '')`,
      idUserType: invitations.idUserType,
      inviter: sql<string>`coalesce(${users.nickName}, ${users.name}, '')`,
      createdAt: sql<Date>`${invitations.createdAt}`.mapWith(invitations.createdAt),
      expiresAt: invitations.expiresAt,
      status: statusSql,
      acceptedBy: sql<string | null>`coalesce(${acceptedBy.nickName}, ${acceptedBy.name})`,
    })
    .from(invitations)
    .leftJoin(stories, eq(stories.idStory, invitations.idStory))
    .leftJoin(userTypes, eq(userTypes.idUserType, invitations.idUserType))
    .leftJoin(users, eq(users.id, invitations.idCreatedByUser))
    .leftJoin(acceptedBy, eq(acceptedBy.id, invitations.idAcceptedByUser))
    .orderBy(desc(invitations.idInvitation));
}

/** One row as sa_listInvitations has it, after a change to it. */
async function listed(idInvitation: number): Promise<AdminInvitation> {
  const rows = await sa_listInvitations();
  const row = rows.find((invitation) => invitation.idInvitation === idInvitation);
  if (!row) throw new Error("Invitation not found");
  return row;
}

export type AdminInviteResult =
  | { ok: true; invitation: AdminInvitation; emailed: boolean }
  | { ok: false; errors: Record<string, string> };

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? "root")] ??= issue.message;
  return errors;
}

/**
 * The New invitation form: invites an address to the app with a paid type
 * and, when `send` is set, emails it. An address that already has an app
 * invitation waiting is refused (db/invitations.ts). A mail that does not
 * go out leaves the invitation in place and says so.
 */
export async function sa_inviteToApp(input: unknown, send: boolean): Promise<AdminInviteResult> {
  const admin = await requireAdmin();
  const parsed = appInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const made = await createInvitation({
    email: parsed.data.email,
    idUserType: parsed.data.idUserType,
    senderId: admin.id,
  });
  if (!made.ok) return { ok: false, errors: { email: made.error } };

  const emailed = send ? await emailInvitation(made.idInvitation) : false;
  return { ok: true, invitation: await listed(made.idInvitation), emailed };
}

export type EditInvitationResult =
  { ok: true; invitation: AdminInvitation } | { ok: false; errors: Record<string, string> };

/**
 * The Edit dialog: changes an invitation's address, its type (an app
 * invitation's only) and the day its link stops working. An accepted one
 * is refused: what it gave has been given. A changed address goes through
 * the same one-waiting-invitation check a new one does, and a new expiry
 * brings an expired invitation back to life, which is how an administrator
 * extends one.
 */
export async function sa_updateInvitation(
  idInvitation: number,
  input: unknown,
): Promise<EditInvitationResult> {
  const admin = await requireAdmin();
  const id = idSchema.parse(idInvitation);
  const parsed = invitationEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const [current] = await db
    .select({ idStory: invitations.idStory, acceptedAt: invitations.acceptedAt })
    .from(invitations)
    .where(eq(invitations.idInvitation, id))
    .limit(1);
  if (!current) throw new Error("Invitation not found");
  if (current.acceptedAt !== null) {
    return { ok: false, errors: { root: "An accepted invitation cannot be changed." } };
  }

  const isApp = current.idStory === null;
  if (isApp && parsed.data.idUserType === undefined) {
    return { ok: false, errors: { idUserType: "Pick Paid Player or Paid Storyteller." } };
  }

  // Another waiting invitation for the new address in the same scope would
  // break the partial unique index; say so in the form instead.
  const [clash] = await db
    .select({ one: invitations.idInvitation })
    .from(invitations)
    .where(
      and(
        ne(invitations.idInvitation, id),
        eq(invitations.email, parsed.data.email),
        isApp ? isNull(invitations.idStory) : eq(invitations.idStory, current.idStory!),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .limit(1);
  if (clash) return { ok: false, errors: { email: ALREADY_INVITED } };

  await db
    .update(invitations)
    .set({
      email: parsed.data.email,
      ...(isApp ? { idUserType: parsed.data.idUserType } : {}),
      // The end of the chosen day, in the server's zone.
      expiresAt: new Date(`${parsed.data.expiresOn}T23:59:59`),
      idUpdatedByUser: admin.id,
    })
    .where(eq(invitations.idInvitation, id));

  return { ok: true, invitation: await listed(id) };
}

/**
 * Emails a waiting invitation again, for an address that lost the first
 * mail or was changed in the Edit dialog. Says whether it went.
 */
export async function sa_resendInvitation(idInvitation: number): Promise<{ ok: boolean }> {
  await requireAdmin();
  const id = idSchema.parse(idInvitation);
  const [row] = await db
    .select({ status: statusSql })
    .from(invitations)
    .where(eq(invitations.idInvitation, id))
    .limit(1);
  if (row?.status !== "pending") return { ok: false };
  return { ok: await emailInvitation(id) };
}

/**
 * Deletes an invitation outright. Its link stops working at once and the
 * address may be invited again. Deleting an accepted one removes only the
 * record: the seat or the type it gave stays.
 */
export async function sa_deleteInvitation(idInvitation: number): Promise<{ ok: boolean }> {
  await requireAdmin();
  const id = idSchema.parse(idInvitation);
  const deleted = await db
    .delete(invitations)
    .where(eq(invitations.idInvitation, id))
    .returning({ id: invitations.idInvitation });
  return { ok: deleted.length > 0 };
}
