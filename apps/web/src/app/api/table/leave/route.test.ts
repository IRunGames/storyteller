import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

import { GUEST_AWAY_GRACE_MS } from "@/lib/play";

// The guest's rows are tested against the database in db/guests.test.ts;
// here the route's decisions are, with the gate, the rows and the work left
// for after the answer all mocked. The class is handed to the mocked module
// so the route's instanceof check sees the one thrown below.
class UnauthorizedError extends Error {}

let caller: { id: string; isAnonymous: boolean } | null = { id: "guest-1", isAnonymous: true };
const requireUser = mock.fn(async () => {
  if (!caller) throw new UnauthorizedError("not signed in");
  return caller;
});
let present = true;
const markGuestAway = mock.fn(async (_idStory: number, _id: string) => {
  const was = present;
  present = false;
  return was;
});
const isGuestAway = mock.fn(async (_idStory: number, _id: string) => !present);
const recountTable = mock.fn((_idStory: number) => {});
const removeGuestsFrom = mock.fn(async (_idStory: number, _ids?: string[]) => [] as string[]);
let later: (() => Promise<void>)[] = [];
const after = (work: () => Promise<void>) => void later.push(work);

let POST: typeof import("./route").POST;

const beacon = (body: unknown) =>
  new Request("http://localhost/api/table/leave", { method: "POST", body: JSON.stringify(body) });

// Runs what the route left for after its answer, with the grace period
// passed at once, after `meanwhile` has had its chance to bring them back.
async function afterGrace(meanwhile: () => void = () => {}) {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const running = later.map((work) => work());
    meanwhile();
    mock.timers.tick(GUEST_AWAY_GRACE_MS);
    await Promise.all(running);
  } finally {
    mock.timers.reset();
  }
}

describe("table leave beacon", () => {
  before(async () => {
    mock.module("@/lib/authorize", { namedExports: { requireUser, UnauthorizedError } });
    mock.module("@/db/guests", { namedExports: { markGuestAway, isGuestAway } });
    mock.module("@/lib/guests", { namedExports: { recountTable, removeGuestsFrom } });
    mock.module("next/server", { namedExports: { after } });
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    caller = { id: "guest-1", isAnonymous: true };
    present = true;
    later = [];
    for (const fn of [markGuestAway, isGuestAway, recountTable, removeGuestsFrom]) {
      fn.mock.resetCalls();
    }
  });

  it("marks a guest away at once and takes them out once the grace has passed", async () => {
    expect((await POST(beacon({ idStory: 7 }))).status).toBe(204);
    expect(markGuestAway.mock.calls[0].arguments).toEqual([7, "guest-1"]);
    expect(recountTable.mock.calls[0].arguments).toEqual([7]);
    expect(removeGuestsFrom.mock.callCount()).toBe(0);

    await afterGrace();

    expect(removeGuestsFrom.mock.calls[0].arguments).toEqual([7, ["guest-1"]]);
  });

  it("keeps a guest whose table came back, as a reload does", async () => {
    await POST(beacon({ idStory: 7 }));

    await afterGrace(() => {
      present = true;
    });

    expect(removeGuestsFrom.mock.callCount()).toBe(0);
  });

  it("leaves someone with an account alone", async () => {
    caller = { id: "member-1", isAnonymous: false };

    expect((await POST(beacon({ idStory: 7 }))).status).toBe(204);
    expect(markGuestAway.mock.callCount()).toBe(0);
    expect(later).toEqual([]);
  });

  it("waits on nothing for a guest with no place at the table", async () => {
    present = false;

    await POST(beacon({ idStory: 7 }));

    expect(recountTable.mock.callCount()).toBe(0);
    expect(later).toEqual([]);
  });

  it("refuses a page with no session, and a body with no story", async () => {
    expect((await POST(beacon({ idStory: "seven" }))).status).toBe(400);
    caller = null;
    expect((await POST(beacon({ idStory: 7 }))).status).toBe(401);
    expect(markGuestAway.mock.callCount()).toBe(0);
  });
});
