// A guest, who came in by a story's join link with no account, holds a real
// session, so every server action is open to them unless it says otherwise:
// an action is a POST anyone with a cookie can make, whatever the pages show.
// requireAccount() is what says otherwise (lib/authorize.ts).
//
// This test reads every "use server" module and the API routes and fails
// when an exported action passes a guest through requireUser() without
// being named below, or calls neither gate without being named either. So a
// new action is closed to guests unless someone decides here that it is not.
import { describe, it } from "node:test";
import { expect } from "expect";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");

// What a guest's pages call: the display table and its waiting room read
// the story, the scene, the sessions, the chat and the live channel, and
// keep the guest's presence, and say when the guest leaves or their page
// goes; the (app) layout reads their preferences. Nothing here writes
// anything but the guest's own seat and presence.
const GUEST_ACTIONS = new Set([
  "app/(app)/play/[id]/actions.ts sa_getPlayStory",
  "app/(app)/play/[id]/actions.ts sa_waitForSession",
  "app/(app)/play/[id]/actions.ts sa_leaveWaitingRoom",
  "app/(app)/play/[id]/actions.ts sa_joinSession",
  "app/(app)/play/[id]/actions.ts sa_getPlayScene",
  "app/(app)/play/[id]/actions.ts sa_getStoryChannel",
  "app/(app)/play/[id]/actions.ts sa_listChats",
  "app/(app)/play/[id]/actions.ts sa_leaveAsGuest",
  "app/(app)/(nav)/stories/actions.ts sa_getStorySession",
  "app/(app)/(nav)/stories/actions.ts sa_listStorySessions",
  "components/preferences/actions.ts sa_getUserPreferences",
  "app/(public)/join/[code]/actions.ts sa_joinByLink",
  "app/api/table/leave/route.ts POST",
]);

// Actions with no session to check: the join and invite pages before anyone
// is signed in, and the guest's sign-in itself, which checks the link
// instead.
const UNGATED_ACTIONS = new Set([
  "app/(public)/join/[code]/actions.ts sa_getJoinStory",
  "app/(public)/join/[code]/actions.ts sa_joinAsGuest",
  "app/(public)/invite/[token]/actions.ts sa_getInvitation",
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

// Each exported function with its body, up to the next export.
function actions(file: string): { name: string; body: string }[] {
  const text = readFileSync(file, "utf8");
  const isActions = /^["']use server["']/.test(text.trimStart());
  // The cron jobs answer to CRON_SECRET rather than to a session, and
  // Better Auth's own handler is configured in lib/auth.ts.
  const isRoute =
    file.endsWith("route.ts") && !/^app\/api\/(cron|auth)\//.test(relative(SRC, file));
  if (!isActions && !isRoute) return [];
  return text
    .split(/(?=^export async function )/m)
    .map((part) => ({ name: /^export async function (\w+)/.exec(part)?.[1], body: part }))
    .filter((part): part is { name: string; body: string } => part.name !== undefined);
}

describe("server actions and guests", () => {
  const found = sources(SRC).flatMap((file) =>
    actions(file).map((action) => ({ ...action, key: `${relative(SRC, file)} ${action.name}` })),
  );

  it("let a guest through requireUser() only where it is meant to", () => {
    const open = found
      .filter(({ key, body }) => /requireUser\(\)/.test(body) && !GUEST_ACTIONS.has(key))
      .map(({ key }) => key);
    expect(open).toEqual([]);
  });

  it("check who is asking in every action not named as ungated", () => {
    const ungated = found
      .filter(
        // requireAdmin() is requireAccount() and more (lib/authorize.ts).
        ({ key, body }) =>
          !/require(User|Account|Admin)\(\)/.test(body) && !UNGATED_ACTIONS.has(key),
      )
      .map(({ key }) => key);
    expect(ungated).toEqual([]);
  });

  it("names only actions that still exist", () => {
    const keys = new Set(found.map(({ key }) => key));
    const stale = [...GUEST_ACTIONS, ...UNGATED_ACTIONS].filter((key) => !keys.has(key));
    expect(stale).toEqual([]);
  });
});
