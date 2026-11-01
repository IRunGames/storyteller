// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes four people under
// @example.test, one of each status and type the page filters on; every
// query here searches for this file's own addresses, so whoever else is in
// the database never changes an answer. Everything is removed in `after`.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { defaultUserListQuery, type UserListQuery } from "@/lib/user-list-schemas";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const hasDb = Boolean(process.env.DATABASE_URL);
const ADMIN_EMAIL = "users-actions-admin@example.test";
const PLAYER_EMAIL = "users-actions-player@example.test";
const GUEST_EMAIL = "users-actions-guest@example.test";
const RETIRED_EMAIL = "users-actions-retired@example.test";
const EMAILS = [ADMIN_EMAIL, PLAYER_EMAIL, GUEST_EMAIL, RETIRED_EMAIL];
// What search_text of every fixture, and nothing else, contains.
const OURS = "users-actions-";

let caller = "";
const getSession = mock.fn(async () => (caller ? { user: { id: caller } } : null));

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];
let actions: typeof import("./actions");

let admin = "";
let player = "";

const ALL_TYPES = [-10, -15, -20, -25, -100];

function ours(over: Partial<UserListQuery> = {}): UserListQuery {
  return { ...defaultUserListQuery(ALL_TYPES), search: OURS, ...over };
}

describe("admin users actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    admin = await makeTestUser(db, tables, ADMIN_EMAIL);
    player = await makeTestUser(db, tables, PLAYER_EMAIL);
    const guest = await makeTestUser(db, tables, GUEST_EMAIL);
    const retired = await makeTestUser(db, tables, RETIRED_EMAIL);
    await db.update(tables.user).set({ idUserType: -100 }).where(eq(tables.user.id, admin));
    await db
      .update(tables.user)
      .set({ idUserType: -25, nickName: "Zebra" })
      .where(eq(tables.user.id, player));
    await db.update(tables.user).set({ isAnonymous: true }).where(eq(tables.user.id, guest));
    await db.update(tables.user).set({ isActive: false }).where(eq(tables.user.id, retired));
    caller = admin;
  });

  after(async () => {
    for (const email of EMAILS) await removeTestUser(db, tables, email);
  });

  it("is refused to anyone short of an administrator", async () => {
    caller = player;
    try {
      await expect(actions.sa_listUsers(ours())).rejects.toThrow();
      await expect(actions.sa_listUserTypes()).rejects.toThrow();
    } finally {
      caller = admin;
    }
  });

  it("lists every type, least powerful first", async () => {
    expect((await actions.sa_listUserTypes()).map((type) => type.idUserType)).toEqual(ALL_TYPES);
  });

  it("finds the fixtures by search, with their type names and statuses", async () => {
    const page = await actions.sa_listUsers(ours({ sortBy: "email", sortDesc: false }));
    expect(page.total).toBe(4);
    expect(page.rows.map((row) => [row.email, row.userTypeName, row.status])).toEqual([
      [ADMIN_EMAIL, "Administrator", "active"],
      [GUEST_EMAIL, "Unpaid Player", "guest"],
      [PLAYER_EMAIL, "Paid Storyteller", "active"],
      [RETIRED_EMAIL, "Unpaid Player", "inactive"],
    ]);
  });

  it("searches the nickname too, and reads % as a character", async () => {
    expect(
      (await actions.sa_listUsers(ours({ search: "zebra" }))).rows.map((r) => r.email),
    ).toEqual([PLAYER_EMAIL]);
    expect((await actions.sa_listUsers(ours({ search: "zeb%ra" }))).total).toBe(0);
  });

  it("hides the statuses and types left unpressed", async () => {
    const guests = await actions.sa_listUsers(ours({ statuses: ["guest"] }));
    expect(guests.rows.map((r) => r.email)).toEqual([GUEST_EMAIL]);

    const storytellers = await actions.sa_listUsers(ours({ idUserTypes: [-25] }));
    expect(storytellers.rows.map((r) => r.email)).toEqual([PLAYER_EMAIL]);

    expect(await actions.sa_listUsers(ours({ statuses: [] }))).toEqual({ rows: [], total: 0 });
  });

  it("pages, counting the whole query", async () => {
    const second = await actions.sa_listUsers(ours({ page: 1 }));
    expect(second).toEqual({ rows: [], total: 4 });
  });

  it("refuses a query it does not understand", async () => {
    await expect(actions.sa_listUsers(ours({ pageSize: 7 as never }))).rejects.toThrow();
  });
});
