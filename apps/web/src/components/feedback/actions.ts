"use server";

import { headers } from "next/headers";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { feedbackSchema } from "@/lib/feedback-schemas";

const { feedback } = schema;

// The feedback popover's server action. It lives beside the component rather
// than under a route because the popover is mounted by the menu bar on every
// signed-in page, so no single page owns it. It starts by proving who is
// asking, like every other action.

export type SubmitFeedbackResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

/**
 * Records a thumbs up / down for the page the caller was on. The submitter is
 * id_created_by_user, stamped from the database row rather than anything the
 * client sent; the IP is kept only as a record and never trusted for anything.
 */
export async function sa_submitFeedback(input: unknown): Promise<SubmitFeedbackResult> {
  const user = await requireUser();

  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  // Vercel puts the client first in x-forwarded-for; local development has no
  // proxy at all, so the header is missing and the column stays null.
  const requestHeaders = await headers();
  const ipAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    null;

  const values = parsed.data;
  await db.insert(feedback).values({
    isPositive: values.isPositive,
    pagePath: values.pagePath,
    feedback: values.feedback || null,
    ipAddress,
    idCreatedByUser: user.id,
    idUpdatedByUser: user.id,
  });

  return { ok: true };
}
