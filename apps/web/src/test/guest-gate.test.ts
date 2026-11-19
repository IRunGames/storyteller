// A guest, who came in by a story's join link with no account, holds a real
// session, so every server action is open to them unless it says otherwise:
// an action is a POST anyone with a cookie can make, whatever the pages show.
// requireAccount() is what says otherwise (lib/authorize.ts).
//
// This test parses every "use server" module and the API routes and fails
// when an exported action passes a guest through requireUser() without
// being named below, or does not open with a gate without being named
// either. The gate has to be the first statement: anything before it, a
// parse of the input say, runs for whoever asks, and a stale cookie for a
// deactivated account would reach it. So a new action is closed to guests,
// and gated before it does anything, unless someone decides here otherwise.
import { describe, it } from "node:test";
import { expect } from "expect";
import ts from "typescript";
import {
  exportedFunctions,
  hasDirective,
  lineOf,
  parse,
  sourceFiles,
  type ExportedFunction,
  type Source,
} from "./source-scan";

// What a guest's pages call: the display table and its waiting room read
// the story, the scene, the sessions, the chat and the live channel, and
// keep the guest's presence, and say when the guest leaves or their page
// goes; the (app) layout reads their preferences. Nothing here writes
// anything but the guest's own seat and presence.
const GUEST_ACTIONS = new Set([
  "components/play/actions.ts sa_getPlayStory",
  "components/play/actions.ts sa_waitForSession",
  "components/play/actions.ts sa_leaveWaitingRoom",
  "components/play/actions.ts sa_joinSession",
  "components/play/actions.ts sa_getPlayScene",
  "components/play/actions.ts sa_getStoryChannel",
  "components/play/actions.ts sa_listChats",
  "components/play/actions.ts sa_leaveAsGuest",
  "components/stories/actions.ts sa_getStorySession",
  "components/stories/actions.ts sa_getStorySessionNeighbours",
  "components/stories/actions.ts sa_listStorySessions",
  "components/preferences/actions.ts sa_getUserPreferences",
  "app/(public)/join/[code]/actions.ts sa_joinByLink",
  // A visitor who already holds a session, a guest's included, is seated as
  // sa_joinByLink seats them, through the same helper, so the session is
  // read with requireUser() once the link has been checked.
  "app/(public)/join/[code]/actions.ts sa_joinAsGuest",
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

const GATES = new Set(["requireUser", "requireAccount", "requireAdmin"]);

/** The gate a statement calls, when it is `await requireX()` bare or assigned to a const. */
function gateOf(statement: ts.Statement | undefined): string | null {
  if (!statement) return null;
  let expression: ts.Expression | undefined;
  if (ts.isExpressionStatement(statement)) expression = statement.expression;
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations;
    expression = declaration?.initializer;
  }
  if (!expression || !ts.isAwaitExpression(expression)) return null;
  const call = expression.expression;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  return GATES.has(call.expression.text) ? call.expression.text : null;
}

/** Whether the gate is called anywhere in the body, as a comment never could be. */
function callsGate(fn: ExportedFunction, gate: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === gate
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  for (const statement of fn.statements) visit(statement);
  return found;
}

type Action = ExportedFunction & { isRoute: boolean };

function actions(source: Source): Action[] {
  const isActions = hasDirective(source, "use server");
  // The cron jobs answer to CRON_SECRET rather than to a session, and
  // Better Auth's own handler is configured in lib/auth.ts.
  const isRoute = source.path.endsWith("route.ts") && !/^app\/api\/(cron|auth)\//.test(source.path);
  if (!isActions && !isRoute) return [];
  return exportedFunctions(source).map((fn) => ({ ...fn, isRoute }));
}

describe("server actions and guests", () => {
  const found = sourceFiles().flatMap((file) => {
    const source = parse(file);
    return actions(source).map((action) => ({
      ...action,
      key: `${source.path} ${action.name}`,
      where: `${source.path}:${lineOf(source, action.node)}`,
    }));
  });

  it("finds the actions", () => {
    expect(found.length).toBeGreaterThan(100);
  });

  it("let a guest through requireUser() only where it is meant to", () => {
    const open = found
      .filter((action) => callsGate(action, "requireUser") && !GUEST_ACTIONS.has(action.key))
      .map(({ key }) => key);
    expect(open).toEqual([]);
  });

  it("open with the gate, as their first statement, in every action not named as ungated", () => {
    const late = found
      .filter(
        (action) =>
          !action.isRoute &&
          !UNGATED_ACTIONS.has(action.key) &&
          gateOf(action.statements[0]) === null,
      )
      .map(({ key, where }) => `${key} (${where})`);
    expect(late).toEqual([]);
  });

  // A route handler reads the request first and answers a status code rather
  // than throwing, so its gate sits inside a try or, for the upload route,
  // inside the callback @vercel/blob runs before it issues a token. It still
  // has to be called somewhere in the handler.
  it("call a gate somewhere in every route handler", () => {
    const ungated = found
      .filter(
        (action) =>
          action.isRoute &&
          !UNGATED_ACTIONS.has(action.key) &&
          ![...GATES].some((gate) => callsGate(action, gate)),
      )
      .map(({ key, where }) => `${key} (${where})`);
    expect(ungated).toEqual([]);
  });

  it("names only actions that still exist", () => {
    const keys = new Set(found.map(({ key }) => key));
    const stale = [...GUEST_ACTIONS, ...UNGATED_ACTIONS].filter((key) => !keys.has(key));
    expect(stale).toEqual([]);
  });
});
