import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { db, schema } from "@/db";
import { moveGuestToUser } from "@/db/guests";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-schemas";
import { serverEnv } from "@/lib/env";

const env = serverEnv();

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  advanced: {
    database: {
      // With provider "pg" the adapter reports supportsUUIDs, so Better Auth
      // leaves `id` out of the INSERT and Postgres fills it from
      // DEFAULT uuidv7(). Every auth table needs that default.
      generateId: "uuid",
    },
  },
  emailAndPassword: {
    enabled: true,
    // Better Auth is given no sendVerificationEmail yet (lib/email.ts only
    // sends invitations so far), so there is nothing to send a verification
    // link with. Sign-in stays unblocked and `email_verified` simply stays
    // false until it is.
    requireEmailVerification: false,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },
  // A guest is made only by sa_joinAsGuest, which checks the story's join
  // link first and calls the plugin's endpoint from the server (auth.api).
  // Left open over HTTP, anyone could make guests without a link. Deleting
  // a guest is ours too (db/guests.ts), so the plugin's delete stays shut.
  // These paths close only the HTTP handler; auth.api still reaches them.
  disabledPaths: ["/sign-in/anonymous", "/delete-anonymous-user"],
  // Optional: with no client id or secret, Better Auth refuses the Google
  // sign-in when it is tried (CLIENT_ID_AND_SECRET_REQUIRED) and email sign-in
  // is unaffected. An unset id is passed as "", not left undefined: Better
  // Auth treats both alike when signing in, but checks an ID token's audience
  // against it, and an undefined audience would mean no check at all.
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [
    // Guests: someone who follows a story's join link without an account
    // gets an anonymous user row and session (is_anonymous on s_users), and
    // the nickname they pick there names it (sa_joinByLink). Logging in or
    // signing up from that session links it: the plugin hands both users to
    // onLinkAccount and then deletes the anonymous one, so whatever the guest
    // did at the table is moved onto the account first. See docs/auth.md.
    anonymous({
      onLinkAccount: ({ anonymousUser, newUser }) =>
        moveGuestToUser(anonymousUser.user.id, newUser.user.id),
    }),
    // Must stay last so server-action responses can set cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
