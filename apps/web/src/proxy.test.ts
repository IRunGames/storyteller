import { describe, it } from "node:test";
import { expect } from "expect";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import proxy, { config } from "./proxy";

const ORIGIN = "http://localhost:3000";

function request(path: string, { sessionCookie = false } = {}) {
  return new NextRequest(new URL(path, ORIGIN), {
    headers: sessionCookie
      ? { cookie: "better-auth.session_token=some-token" }
      : {},
  });
}

describe("proxy", () => {
  it("sends a visitor without a cookie from a protected route to /login", () => {
    const response = proxy(request("/home"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/login?redirectTo=%2Fhome`,
    );
  });

  for (const path of [
    "/play",
    "/library",
    "/profile",
    "/home/anything/nested",
    "/some-page-that-does-not-exist-yet",
  ]) {
    it(`protects ${path}`, () => {
      // Anything not listed as public needs a session, so a page added under
      // app/(app)/ is covered without a change here.
      const response = proxy(request(path));

      expect(response.headers.get("location")).toBe(
        `${ORIGIN}/login?redirectTo=${encodeURIComponent(path)}`,
      );
    });
  }

  for (const path of ["/", "/signup", "/signup/"]) {
    it(`lets a visitor without a cookie reach ${path}`, () => {
      const response = proxy(request(path));

      expect(response.headers.get("location")).toBeNull();
    });
  }

  it("lets a visitor with a cookie through to a protected route", () => {
    const response = proxy(request("/home", { sessionCookie: true }));

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a visitor with a cookie reach /login", () => {
    // The cookie may be stale: the session row can be gone while the browser
    // still holds the token. Bouncing on cookie presence alone would loop
    // with (app)/layout, which sends the same stale cookie back to /login.
    // (auth)/layout does the authoritative bounce for genuinely signed-in users.
    const response = proxy(request("/login", { sessionCookie: true }));

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a visitor without a cookie reach /login", () => {
    const response = proxy(request("/login"));

    expect(response.headers.get("location")).toBeNull();
  });

  // The matcher, not proxy(), decides these, so they are checked against
  // config directly: a cron job is called by Vercel with no cookie, and a
  // redirect to /login would stop it running without an error anywhere.
  it("never runs for /api/cron", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/cron/blob-sweep" })).toBe(false);
  });

  it("still runs for the other API routes", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/blob/upload" })).toBe(true);
  });
});
