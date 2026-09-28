import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

const USER = "8f2b1c44-0000-4000-8000-000000000001";

// requireUser() is the real gate; mocking it is how this test drives the two
// answers the route has to tell apart — no session, and a session whose user
// is asking for someone else's prefix.
//
// The class is declared here and handed to the mocked module, so the instance
// thrown below is the very class the route's `catch` checks with instanceof.
// A bare Error would fall through to the 400 branch and the 401 case would
// pass for the wrong reason.
class UnauthorizedError extends Error {}

const requireUser = mock.fn<() => Promise<{ id: string }>>(async () => ({
  id: USER,
}));

let POST: typeof import("./route").POST;

function tokenRequest(pathname: string): Request {
  return new Request("http://localhost/api/blob/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: {
        pathname,
        callbackUrl: "http://localhost/api/blob/upload",
        multipart: false,
      },
    }),
  });
}

describe("POST /api/blob/upload", () => {
  before(async () => {
    // The store is not provisioned (see technologies.md / the task report):
    // there is no real BLOB_READ_WRITE_TOKEN anywhere in this environment.
    // The SDK still insists a syntactically plausible one is present before
    // it will even look at onBeforeGenerateToken, so a dummy value goes here
    // purely to satisfy that local precondition. Nothing below ever reaches
    // the point where the SDK would sign a token or call out to Vercel: both
    // cases this file tests fail inside onBeforeGenerateToken first.
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_0000000000000000000000";
    mock.module("@/lib/authorize", {
      namedExports: { requireUser, UnauthorizedError },
    });
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    requireUser.mock.resetCalls();
    requireUser.mock.mockImplementation(async () => ({ id: USER }));
  });

  it("refuses to issue a token when nobody is signed in", async () => {
    requireUser.mock.mockImplementation(async () => {
      throw new UnauthorizedError("not signed in");
    });

    const response = await POST(tokenRequest(`uploads/${USER}/cat.jpg`));

    expect(response.status).toBe(401);
  });

  // The client sends the pathname, so the server is the only place the
  // prefix can be enforced. Without this check any signed-in user could
  // write into another user's prefix and defeat the delete check.
  it("refuses a pathname under another user's prefix", async () => {
    const other = "8f2b1c44-0000-4000-8000-000000000002";

    const response = await POST(tokenRequest(`uploads/${other}/cat.jpg`));

    expect(response.status).toBe(400);
  });
});
