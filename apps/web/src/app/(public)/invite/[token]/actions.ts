"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  findLiveInvitation,
  NO_LONGER_VALID,
  redeemInvitation,
  type LiveInvitation,
} from "@/db/invitations";
import { requireAccount } from "@/lib/authorize";

// The tokens newInviteToken makes are 24 base64url characters; anything that
// could not be one is turned away before it reaches the query.
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/**
 * The invitation a link names, for /invite/[token] to show before anyone
 * has an account: who sent it, and the story or account type it is for.
 * Ungated, like sa_getJoinStory: whoever holds the link may see what it
 * offers, which is what it was sent for. Null once it is accepted, revoked
 * or expired.
 */
export async function sa_getInvitation(token: string): Promise<LiveInvitation | null> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return null;
  return findLiveInvitation(parsed.data);
}

export type AcceptInvitationResult = { ok: false; error: string };

/**
 * Accepts the invitation for the signed-in account and goes on to what it
 * was for: the story's table, or home for an account type. The token is
 * enough, whatever address the account has, so a link passed on by text or
 * a Google account under another address still works. A guest must make an
 * account first, which the page sends them to do.
 */
export async function sa_acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  const user = await requireAccount();
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, error: NO_LONGER_VALID };

  const redeemed = await redeemInvitation(parsed.data, user.id);
  if (!redeemed.ok) return redeemed;
  redirect(redeemed.idStory !== null ? `/play/${redeemed.idStory}` : "/home");
}
