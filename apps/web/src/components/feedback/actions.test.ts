// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Writes rows for the seed user and
// removes them again in `after`; the negative-id seed data is never touched.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

// A server action reads the request headers for the caller's IP. There is no
// request here, so hand it an empty set and expect the column to stay null.
const headers = mock.fn(async () => new Headers());

let actions: typeof import("./actions");

// `@/db` opens its pool at import time, so it has to be pulled in from inside
// `before` — a static import is evaluated before loadEnvConfig() above runs,
// and the pool would be built without a connection string.
type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

describe("feedback actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    mock.module("next/headers", { namedExports: { headers } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    // A run that died before `after` leaves rows behind, and the first case
    // counts them, so start clean.
    await db.delete(tables.feedback).where(eq(tables.feedback.idCreatedByUser, SEED_USER));
  });

  after(async () => {
    if (!db) return;
    await db.delete(tables.feedback).where(eq(tables.feedback.idCreatedByUser, SEED_USER));
    // Otherwise the process lingers until the pool's idle timeout.
    await db.$client.end();
  });

  it("stores a rating with its text, page and submitter", async () => {
    const result = await actions.submitFeedback({
      isPositive: true,
      feedback: "  Loved the new cards.  ",
      pagePath: "/home",
    });
    expect(result).toEqual({ ok: true });

    const rows = await db
      .select()
      .from(tables.feedback)
      .where(eq(tables.feedback.idCreatedByUser, SEED_USER));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      isPositive: true,
      feedback: "Loved the new cards.",
      pagePath: "/home",
      ipAddress: null,
      idCreatedByUser: SEED_USER,
      idUpdatedByUser: SEED_USER,
    });
  });

  it("stores an empty text as null", async () => {
    await actions.submitFeedback({ isPositive: false, feedback: "", pagePath: "/library" });

    const [row] = await db
      .select({ feedback: tables.feedback.feedback, isPositive: tables.feedback.isPositive })
      .from(tables.feedback)
      .where(eq(tables.feedback.pagePath, "/library"));
    expect(row).toEqual({ feedback: null, isPositive: false });
  });

  it("returns field errors for an invalid submission and stores nothing", async () => {
    const before = await db
      .select({ id: tables.feedback.idFeedback })
      .from(tables.feedback)
      .where(eq(tables.feedback.idCreatedByUser, SEED_USER));

    const result = await actions.submitFeedback({ feedback: "", pagePath: "/home" });
    expect(result).toEqual({
      ok: false,
      errors: { isPositive: "Pick thumbs up or thumbs down." },
    });

    const after = await db
      .select({ id: tables.feedback.idFeedback })
      .from(tables.feedback)
      .where(eq(tables.feedback.idCreatedByUser, SEED_USER));
    expect(after).toHaveLength(before.length);
  });
});
