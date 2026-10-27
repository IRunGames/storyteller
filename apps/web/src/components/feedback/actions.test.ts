// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Writes rows for the test user and
// removes them again in `after`; the negative-id seed data is never touched.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "components-feedback-actions@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));

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
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    actions = await import("./actions");

    // A run that died before `after` leaves rows behind, and the first case
    // counts them, so start clean.
    await db.delete(tables.feedback).where(eq(tables.feedback.idCreatedByUser, testUser));
  });

  after(async () => {
    if (!db) return;
    await db.delete(tables.feedback).where(eq(tables.feedback.idCreatedByUser, testUser));
    // Otherwise the process lingers until the pool's idle timeout.
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  it("stores a rating with its text, page and submitter", async () => {
    const result = await actions.sa_submitFeedback({
      isPositive: true,
      feedback: "  Loved the new cards.  ",
      pagePath: "/home",
    });
    expect(result).toEqual({ ok: true });

    const rows = await db
      .select()
      .from(tables.feedback)
      .where(eq(tables.feedback.idCreatedByUser, testUser));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      isPositive: true,
      feedback: "Loved the new cards.",
      pagePath: "/home",
      ipAddress: null,
      idCreatedByUser: testUser,
      idUpdatedByUser: testUser,
    });
  });

  it("stores an empty text as null", async () => {
    await actions.sa_submitFeedback({ isPositive: false, feedback: "", pagePath: "/library" });

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
      .where(eq(tables.feedback.idCreatedByUser, testUser));

    const result = await actions.sa_submitFeedback({ feedback: "", pagePath: "/home" });
    expect(result).toEqual({
      ok: false,
      errors: { isPositive: "Pick thumbs up or thumbs down." },
    });

    const after = await db
      .select({ id: tables.feedback.idFeedback })
      .from(tables.feedback)
      .where(eq(tables.feedback.idCreatedByUser, testUser));
    expect(after).toHaveLength(before.length);
  });
});
