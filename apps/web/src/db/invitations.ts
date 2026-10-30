import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { appInvitationEmail, storyInvitationEmail } from "@/lib/invitation-email";
import { INVITE_TTL_DAYS } from "@/lib/invitation-schemas";
import { appOrigin, sendEmail } from "@/lib/email";
import { db } from "./index";
import { invitations, stories, storyPlayers, user as users, userTypes } from "./schema";

export const ALREADY_INVITED = "That email already has an invitation waiting.";
export const NO_LONGER_VALID = "This invitation is no longer valid.";

/** 24 base64url characters: the same source as a story's join code, twice as long. */
export function newInviteToken(): string {
  return randomBytes(18).toString("base64url");
}

/** When an invitation made now stops working. */
export function inviteExpiry(from = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Where an invitation's link leads, as mail needs it: absolute. */
export function inviteUrl(token: string): string {
  return `${appOrigin()}/invite/${token}`;
}

// Live: not accepted, not revoked, not past its expiry.
const live = and(
  isNull(invitations.acceptedAt),
  isNull(invitations.revokedAt),
  gt(invitations.expiresAt, sql`now()`),
);

export type NewInvitation = {
  email: string;
  senderId: string;
} & ({ idStory: number; idUserType?: undefined } | { idStory?: undefined; idUserType: number });

export type CreateInvitationResult =
  { ok: true; idInvitation: number; token: string } | { ok: false; error: string };

/**
 * Makes an invitation, refusing an email that already has one waiting: per
 * story for a storyteller's, once for an administrator's. The partial
 * unique indexes on the table are what refuse it, so two sends racing each
 * other cannot both get in; ON CONFLICT DO NOTHING turns that refusal into
 * no row rather than an error to catch.
 *
 * Those indexes cannot see expiry (now() is not allowed in an index
 * predicate), so an expired invitation would block the email for good.
 * It is revoked first, in the same transaction, which frees the email.
 */
export async function createInvitation(input: NewInvitation): Promise<CreateInvitationResult> {
  return db.transaction(async (tx) => {
    const scope =
      input.idStory !== undefined
        ? eq(invitations.idStory, input.idStory)
        : isNull(invitations.idStory);
    await tx
      .update(invitations)
      .set({ revokedAt: sql`now()`, idUpdatedByUser: input.senderId })
      .where(
        and(
          eq(invitations.email, input.email),
          scope,
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          lte(invitations.expiresAt, sql`now()`),
        ),
      );

    const [row] = await tx
      .insert(invitations)
      .values({
        email: input.email,
        token: newInviteToken(),
        idStory: input.idStory ?? null,
        idUserType: input.idUserType ?? null,
        expiresAt: inviteExpiry(),
        idCreatedByUser: input.senderId,
        idUpdatedByUser: input.senderId,
      })
      .onConflictDoNothing()
      .returning({ idInvitation: invitations.idInvitation, token: invitations.token });

    return row ? { ok: true, ...row } : { ok: false, error: ALREADY_INVITED };
  });
}

/**
 * Emails an invitation to the address it names and says whether it went.
 * The sender's name and the story's title or the type's name are read here
 * rather than passed in, so a resend from the list says the same as the
 * first send.
 */
export async function emailInvitation(idInvitation: number): Promise<boolean> {
  const [row] = await db
    .select({
      email: invitations.email,
      token: invitations.token,
      idStory: invitations.idStory,
      storyTitle: stories.title,
      userTypeName: userTypes.userTypeName,
      inviter: sql<string>`coalesce(${users.nickName}, ${users.name}, 'Someone')`,
    })
    .from(invitations)
    .leftJoin(stories, eq(stories.idStory, invitations.idStory))
    .leftJoin(userTypes, eq(userTypes.idUserType, invitations.idUserType))
    .leftJoin(users, eq(users.id, invitations.idCreatedByUser))
    .where(eq(invitations.idInvitation, idInvitation))
    .limit(1);
  if (!row) return false;

  const url = inviteUrl(row.token);
  const email =
    row.idStory !== null
      ? storyInvitationEmail({
          to: row.email,
          inviter: row.inviter,
          storyTitle: row.storyTitle ?? "a story",
          url,
        })
      : appInvitationEmail({
          to: row.email,
          inviter: row.inviter,
          userTypeName: row.userTypeName ?? "new",
          url,
        });
  return sendEmail(email);
}

export type LiveInvitation = {
  email: string;
  inviter: string;
  /** Set for a storyteller's invitation. */
  story: { idStory: number; title: string } | null;
  /** Set for an administrator's invitation. */
  userTypeName: string | null;
};

/**
 * The live invitation a link's token names, with what the invite page shows,
 * or null. A story invitation whose story has since been archived leads
 * nowhere, as its join link would.
 */
export async function findLiveInvitation(token: string): Promise<LiveInvitation | null> {
  const [row] = await db
    .select({
      email: invitations.email,
      idStory: invitations.idStory,
      storyTitle: stories.title,
      storyArchived: stories.isArchived,
      userTypeName: userTypes.userTypeName,
      inviter: sql<string>`coalesce(${users.nickName}, ${users.name}, 'Someone')`,
    })
    .from(invitations)
    .leftJoin(stories, eq(stories.idStory, invitations.idStory))
    .leftJoin(userTypes, eq(userTypes.idUserType, invitations.idUserType))
    .leftJoin(users, eq(users.id, invitations.idCreatedByUser))
    .where(and(eq(invitations.token, token), live))
    .limit(1);
  if (!row) return null;
  if (row.idStory !== null && (row.storyTitle === null || row.storyArchived)) return null;

  return {
    email: row.email,
    inviter: row.inviter,
    story: row.idStory !== null ? { idStory: row.idStory, title: row.storyTitle ?? "" } : null,
    userTypeName: row.idStory === null ? row.userTypeName : null,
  };
}

export type RedeemResult = { ok: true; idStory: number | null } | { ok: false; error: string };

/**
 * Accepts a live invitation for the account `userId`, once. The row is
 * locked for the transaction, so the same link opened in two tabs is
 * accepted by the first and refused to the second.
 *
 * A story invitation seats the account at the story, unless it is already
 * seated there or tells the story itself, in which case accepting simply
 * uses the invitation up. It is not a link seat, so the storyteller's
 * join-link cap does not count it (lib/join.ts).
 *
 * A type invitation raises the account to that type and never lowers it:
 * the smaller id is the more powerful (lib/user-types.ts), so least() keeps
 * an administrator who accepts a Paid Player invitation an administrator.
 */
export async function redeemInvitation(token: string, userId: string): Promise<RedeemResult> {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select({
        idInvitation: invitations.idInvitation,
        idStory: invitations.idStory,
        idUserType: invitations.idUserType,
      })
      .from(invitations)
      .where(and(eq(invitations.token, token), live))
      .for("update")
      .limit(1);
    if (!invitation) return { ok: false, error: NO_LONGER_VALID };

    if (invitation.idStory !== null) {
      const [story] = await tx
        .select({ owner: stories.idCreatedByUser, isArchived: stories.isArchived })
        .from(stories)
        .where(eq(stories.idStory, invitation.idStory))
        .limit(1);
      if (!story || story.isArchived) return { ok: false, error: NO_LONGER_VALID };

      if (story.owner !== userId) {
        // story_players has no unique key on (id_story, id_user), so the
        // seat is only inserted where there is none, as sa_addStoryPlayers
        // does.
        await tx.execute(sql`
          insert into ${storyPlayers} (id_story, id_user)
          select ${invitation.idStory}::bigint, ${userId}::uuid
          where not exists (
            select 1 from ${storyPlayers}
            where ${storyPlayers.idStory} = ${invitation.idStory} and ${storyPlayers.idUser} = ${userId}
          )`);
      }
    }

    if (invitation.idUserType !== null) {
      await tx
        .update(users)
        .set({ idUserType: sql`least(${users.idUserType}, ${invitation.idUserType})` })
        .where(eq(users.id, userId));
    }

    await tx
      .update(invitations)
      .set({ acceptedAt: sql`now()`, idAcceptedByUser: userId, idUpdatedByUser: userId })
      .where(eq(invitations.idInvitation, invitation.idInvitation));

    return { ok: true, idStory: invitation.idStory };
  });
}
