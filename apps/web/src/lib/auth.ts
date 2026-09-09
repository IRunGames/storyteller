import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";

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
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  // Must stay last so server-action responses can set cookies.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
