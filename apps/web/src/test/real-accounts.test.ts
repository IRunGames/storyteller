// The database tests run against the dev database the owner also plays in,
// and their cleanup deletes what the signed-in user wrote. Signed in as a real
// account, that wiped its preferences, feedback and chats on every run. This
// keeps every database test on a test user of its own (test-user.ts): none
// may name an @irun.games account or a real user's id.
import { describe, it } from "node:test";
import { expect } from "expect";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return testFiles(path);
    return /\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// Seeded fixture people use the synthetic 00000000-0000-7000-8000-… range
// (db/seeds/seed_s_users.sql); any other literal user id is a real person.
const REAL_USER_ID =
  /["'`](?!00000000-)[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}["'`]/;

describe("database tests and real accounts", () => {
  const files = testFiles("src").filter(
    (file) =>
      !file.endsWith("real-accounts.test.ts") &&
      readFileSync(file, "utf8").includes("process.env.DATABASE_URL"),
  );

  it("finds the database tests", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(`${file} signs in as a test user, never a real account`, () => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/@irun\.games/);
      expect(source).not.toMatch(REAL_USER_ID);
      expect(source).not.toMatch(/\bSEED_USER\b/);
    });
  }
});
