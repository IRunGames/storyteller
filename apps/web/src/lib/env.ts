// The server's environment variables, read in one place. Server code takes
// them from here rather than from process.env, so this file and
// apps/web/.env.example are the whole list of what a deployment sets, each
// value comes out typed, and a variable the app cannot do without fails with
// its own name rather than as an undefined somewhere inside a library.
//
// Not to be confused with lib/environment.ts, which says which deployment
// this is (NEXT_PUBLIC_ENVIRONMENT) and is read in the browser too.
//
// The environment is parsed on every call, never once when this module
// loads. `next build` loads server modules while it collects page data, with
// whatever variables the build happens to have, and the tests set and unset
// variables between cases. So nothing here is checked until it is asked
// for, and the one variable the app cannot run without, DATABASE_URL, is
// checked each time the database pool is asked for a connection
// (db/index.ts), not here.
//
// Three kinds of variable are not in this schema:
//   - NEXT_PUBLIC_ ones. Next writes their values into the browser bundle only
//     where the code says `process.env.NEXT_PUBLIC_…` literally, so they stay
//     literal reads where they are used (lib/environment.ts,
//     lib/auth-client.ts).
//   - Those only a library reads, for itself: Better Auth reads
//     BETTER_AUTH_SECRET and @vercel/blob reads BLOB_READ_WRITE_TOKEN.
//     Better Auth reads BETTER_AUTH_URL too, which is in the schema only
//     because appOrigin (lib/email.ts) builds links from it as well.
//   - TZ, which only the test setup sets.
// .env.example lists all of them.
//
// Several of the values are secrets. This module must never reach the
// browser, which test/architecture.test.ts checks by following every client
// component's imports, and an error raised here names a variable but never
// prints its value.
import { z } from "zod";

// What the code these reads replaced did with an empty value is kept, one
// variable at a time. Most read the value with `||` or a truthiness check,
// so an empty value counted as unset; EMAIL_FROM and BETTER_AUTH_URL were
// read with `??`, which keeps an empty value as it is.
const unsetWhenEmpty = z
  .string()
  .optional()
  .transform((value) => value || undefined);
const asGiven = z.string().optional();
const withDefault = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((value) => value || fallback);

const serverSchema = z.object({
  // Postgres, with the irun schema on the search_path; see db/index.ts.
  DATABASE_URL: unsetWhenEmpty,
  // This deployment's own origin, which the links in mail start with.
  BETTER_AUTH_URL: asGiven,
  // Google sign-in. Without them the Google button fails and email sign-in
  // carries on.
  GOOGLE_CLIENT_ID: asGiven,
  GOOGLE_CLIENT_SECRET: asGiven,
  // The bearer token Vercel's scheduler sends to the cron routes. Unset, the
  // routes refuse every request.
  CRON_SECRET: unsetWhenEmpty,
  // Resend. Unset, mail is logged and not sent.
  RESEND_API_KEY: unsetWhenEmpty,
  EMAIL_FROM: asGiven,
  // Where mail goes anywhere but production; see lib/email.ts.
  EMAIL_NON_PRODUCTION_TO: unsetWhenEmpty,
  // The EMQX broker. The server publishes through its REST API with the
  // app's key and secret (lib/realtime/publish.ts); the players' browsers
  // subscribe over WebSocket TLS with the shared player login
  // (sa_getStoryChannel). Unset, the table works without live updates.
  MQTT_ADDRESS: unsetWhenEmpty,
  MQTT_API_PORT: withDefault("8443"),
  MQTT_WS_TLS_PORT: withDefault("8084"),
  MQTT_APP_ID: unsetWhenEmpty,
  MQTT_APP_SECRET: unsetWhenEmpty,
  MQTT_PLAYER_USERNAME: unsetWhenEmpty,
  MQTT_PLAYER_PASSWORD: unsetWhenEmpty,
});

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * A variable the code cannot go on without is unset; thrown where the
 * variable is used, as db/index.ts does for DATABASE_URL. The message names
 * the variable and where to set it, never a value.
 */
export class MissingEnvError extends Error {
  constructor(readonly variable: keyof ServerEnv) {
    super(
      `${variable} is not set. Set it in apps/web/.env.local for development, or in the ` +
        `Vercel project's environment variables for a deployment; apps/web/.env.example ` +
        `lists every variable.`,
    );
    this.name = "MissingEnvError";
  }
}

/** The server's variables as they stand now, parsed. */
export function serverEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only reachable if something put a value that is not a string into
    // process.env. A zod issue can carry the value it rejected, so the
    // message is built from the variables' names alone.
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Environment variables could not be read: ${names.join(", ")}.`);
  }
  return parsed.data;
}
