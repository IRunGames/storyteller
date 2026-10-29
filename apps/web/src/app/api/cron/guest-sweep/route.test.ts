import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

// Which guests are lapsed, and deleting them, are tested against the
// database in db/guests.test.ts. Here they are mocked, since the sweep is
// global and would otherwise delete guests other than a test's own.
const lapsedGuests = mock.fn(async () => ["guest-a", "guest-b"]);
const removeGuests = mock.fn(async (_ids: string[]) => {});

let GET: typeof import("./route").GET;

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/guest-sweep", {
    headers: authorization ? { authorization } : {},
  });

describe("guest sweep", () => {
  before(async () => {
    process.env.CRON_SECRET = "sweep-secret";
    mock.module("@/db/guests", { namedExports: { lapsedGuests } });
    mock.module("@/lib/guests", { namedExports: { removeGuests } });
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    removeGuests.mock.resetCalls();
  });

  it("refuses anyone without the cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect(removeGuests.mock.callCount()).toBe(0);
  });

  it("deletes the lapsed guests and says how many", async () => {
    const response = await GET(request("Bearer sweep-secret"));

    expect(await response.json()).toEqual({ deletedGuests: 2 });
    expect(removeGuests.mock.calls[0].arguments).toEqual([["guest-a", "guest-b"]]);
  });
});
