// The pool's DATABASE_URL check, made where a connection is asked for rather
// than when the module loads (see index.ts). It needs no database: the
// variable is taken away before the module is imported, so the pool has
// nothing to connect to and must say so. Naming the variable puts this file
// in the serial database pass of scripts/run-tests.mjs, where it runs
// whether a database is configured or not.
import { after, before, describe, it } from "node:test";
import { expect } from "expect";
import { sql } from "drizzle-orm";
import { MissingEnvError } from "@/lib/env";

const saved = process.env.DATABASE_URL;
let db: typeof import("./index").db;

describe("the database pool without DATABASE_URL", () => {
  before(async () => {
    delete process.env.DATABASE_URL;
    ({ db } = await import("./index"));
  });

  after(async () => {
    await db?.$client.end();
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  });

  it("loads, so a build that never queries is not stopped", () => {
    expect(db).toBeDefined();
  });

  // Drizzle wraps whatever a query throws in its own "Failed query" error,
  // as it would a refused connection, and keeps the pool's as the cause.
  it("refuses a query with an error naming DATABASE_URL", async () => {
    const failure: unknown = await db.execute(sql`select 1`).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).cause).toBeInstanceOf(MissingEnvError);
    expect(((failure as Error).cause as Error).message).toMatch(/^DATABASE_URL is not set\./);
  });

  it("refuses a transaction the same way", async () => {
    await expect(db.transaction(async (tx) => tx.execute(sql`select 1`))).rejects.toThrow(
      /^DATABASE_URL is not set\./,
    );
  });
});
