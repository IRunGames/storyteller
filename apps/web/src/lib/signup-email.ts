import { formatDateTimeUtc } from "@/lib/dates";
import { type Email, sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escape-html";

/** Where the app tells the people who run it that someone has joined. */
const SUPPORT_EMAIL = "support@storyteller.irun.games";

/** The fields of a new s_users row that the notice reads. */
export type NewAccount = {
  name: string;
  email: string;
  createdAt: Date;
  isAnonymous?: boolean | null;
};

/**
 * Tells support that an account was made, by email and password or by
 * Google. Better Auth calls it for every user row it inserts
 * (databaseHooks in lib/auth.ts), and that includes a guest's, made when
 * someone follows a join link; a guest is not an account, so it is skipped.
 * A guest who then signs up gets a new row of their own, which is told.
 *
 * Like sendEmail, it never throws, so a mail that does not go out never
 * fails the sign-up that has already been saved.
 */
export async function notifySupportOfSignup(account: NewAccount): Promise<void> {
  if (account.isAnonymous) return;
  await sendEmail(signupNoticeEmail(account));
}

function signupNoticeEmail(account: NewAccount): Email {
  // UTC and saying so: support reads it wherever they are, and the server
  // has no reader's zone to use.
  const rows = [
    ["Name", account.name],
    ["Email", account.email],
    ["Signed up", formatDateTimeUtc(account.createdAt)],
  ];
  const html = `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a;">
<p>A new account was made on Storyteller.</p>
<table style="border-collapse: collapse;">
${rows.map(([label, value]) => `<tr><td style="padding: 2px 16px 2px 0; color: #666666;">${label}</td><td style="padding: 2px 0;">${escapeHtml(value)}</td></tr>`).join("\n")}
</table>
</body></html>`;
  const text = [
    "A new account was made on Storyteller.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");
  return { to: SUPPORT_EMAIL, subject: `New sign-up: ${account.name}`, html, text };
}
