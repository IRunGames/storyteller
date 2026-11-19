import { Resend } from "resend";
import { serverEnv } from "@/lib/env";
import { currentEnvironment } from "@/lib/environment";

/**
 * Who the app's mail is from. The sending domain is the storyteller.irun.games
 * subdomain verified in Resend, kept apart from irun.games so
 * the app's sending reputation is its own. EMAIL_FROM overrides it.
 */
const DEFAULT_FROM = "Storyteller <noreply@storyteller.irun.games>";

// One client for the process, made on first use so that importing this
// module without a key (tests, a fresh checkout) does not throw.
let client: Resend | null = null;

export type Email = { to: string; subject: string; html: string; text: string };

/**
 * Sends one email through Resend and says whether it went. Every send in the
 * app comes through here. It never throws: a mail that cannot go out is the
 * caller's to report ("copy the link instead"), not a reason to undo the
 * work that wanted it sent. With no RESEND_API_KEY it logs and reports false,
 * so development and tests run without one.
 *
 * Anywhere but production the mail goes to EMAIL_NON_PRODUCTION_TO instead,
 * with the address it was meant for at the front of the subject.
 * Development, test and staging send for real through the same Resend
 * account, so without this an invite tried out on a laptop would reach the
 * person typed in, with a link to localhost they cannot open. An unset or
 * unknown environment counts as not production, and with no
 * EMAIL_NON_PRODUCTION_TO there nothing is sent at all: a misconfigured
 * deployment must not fall through to the real recipient.
 */
export async function sendEmail(intended: Email): Promise<boolean> {
  const env = serverEnv();
  let email = intended;
  if (currentEnvironment() !== "PRODUCTION") {
    const to = env.EMAIL_NON_PRODUCTION_TO;
    if (!to) {
      console.warn(
        `[email] Not production and EMAIL_NON_PRODUCTION_TO is not set; not sending "${intended.subject}" to ${intended.to}.`,
      );
      return false;
    }
    email = { ...intended, to, subject: `[to: ${intended.to}] ${intended.subject}` };
  }
  const key = env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] RESEND_API_KEY is not set; not sending "${email.subject}".`);
    return false;
  }
  client ??= new Resend(key);
  try {
    const from = env.EMAIL_FROM ?? DEFAULT_FROM;
    const { error } = await client.emails.send({ from, ...email });
    if (error) {
      console.error(`[email] Resend refused "${email.subject}": ${error.message}`);
      return false;
    }
    return true;
  } catch (cause) {
    console.error(`[email] Could not reach Resend for "${email.subject}".`, cause);
    return false;
  }
}

/**
 * The app's own origin, for links in mail, which has no page to read
 * window.location from. BETTER_AUTH_URL is set per environment already,
 * since Better Auth builds its own callback links from it.
 */
export function appOrigin(): string {
  return (serverEnv().BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
