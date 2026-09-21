import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

const getSession = mock.fn<() => Promise<{ user: { id: string } } | null>>();
const findFirst = mock.fn<(args: unknown) => Promise<unknown>>();

const activeUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul",
  email: "storyteller@irun.games",
  isActive: true,
};

let requireUser: typeof import("./authorize").requireUser;
let UnauthorizedError: typeof import("./authorize").UnauthorizedError;

describe("requireUser", () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    mock.module("@/db", {
      namedExports: {
        db: { query: { user: { findFirst } } },
        schema: { user: { id: "id_user" } },
      },
    });
    ({ requireUser, UnauthorizedError } = await import("./authorize"));
  });

  beforeEach(() => {
    getSession.mock.resetCalls();
    findFirst.mock.resetCalls();
  });

  it("rejects when there is no session", async () => {
    getSession.mock.mockImplementation(async () => null);

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(findFirst.mock.callCount()).toBe(0);
  });

  it("rejects when the session user has no row", async () => {
    getSession.mock.mockImplementation(async () => ({ user: { id: activeUser.id } }));
    findFirst.mock.mockImplementation(async () => undefined);

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects an inactive user", async () => {
    getSession.mock.mockImplementation(async () => ({ user: { id: activeUser.id } }));
    findFirst.mock.mockImplementation(async () => ({ ...activeUser, isActive: false }));

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns the database row for an active user", async () => {
    getSession.mock.mockImplementation(async () => ({ user: { id: activeUser.id } }));
    findFirst.mock.mockImplementation(async () => activeUser);

    await expect(requireUser()).resolves.toEqual(activeUser);
    expect(findFirst.mock.callCount()).toBe(1);
  });
});
