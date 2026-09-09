import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so load .env.local the way Next would.
loadEnvConfig(process.cwd());

// This config exists for `db:studio` only — browsing the database.
//
// dbmate owns the schema: it lives in db/migrations, generated from db/custom,
// db/functions and db/procedures. The drizzle-kit generate/migrate/push
// scripts were deliberately removed, because each of them writes DDL derived
// from schema.ts and would diverge from — or silently undo — those migrations.
// schema.ts is a description of what dbmate already built, not a source of
// truth. To change the schema, add a migration (see db/README.md) and then
// update schema.ts to match.

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
