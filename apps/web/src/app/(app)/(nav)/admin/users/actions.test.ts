// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes four people under
// @example.test, one of each status and type the page filters on; every
// query here searches for this file's own addresses, so whoever else is in
// the database never changes an answer. Everything is removed in `after`.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, sql } from "drizzle-orm";
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
    await db.update(tables.user).set({ status: "INACTIVE" }).where(eq(tables.user.id, retired));
    caller = admin;
  });

  after(async () => {
    // The admin goes last: the rows it changed the status of name it in
    // id_updated_by_user, whose foreign key holds it back until they are gone.
    for (const email of [...EMAILS].reverse()) await removeTestUser(db, tables, email);
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

  // The status tests come after the listing ones, since they move the player
  // fixture about and put it back only at the end.
  it("lists the four statuses of the users workflow in its order", async () => {
    const options = await actions.sa_listUserStatusOptions();
    expect(options.map((option) => option.key)).toEqual([
      "ACTIVE",
      "INACTIVE",
      "SUSPENDED",
      "LOCKED",
    ]);
    caller = player;
    try {
      await expect(actions.sa_listUserStatusOptions()).rejects.toThrow();
      await expect(actions.sa_setUserStatus(admin, "LOCKED")).rejects.toThrow();
    } finally {
      caller = admin;
    }
  });

  it("refuses the administrator's own row, a guest and a status the workflow lacks", async () => {
    expect(await actions.sa_setUserStatus(admin, "LOCKED")).toEqual({
      ok: false,
      error: "You cannot change your own status.",
    });
    const [guest] = await db
      .select({ id: tables.user.id })
      .from(tables.user)
      .where(eq(tables.user.email, GUEST_EMAIL));
    expect(await actions.sa_setUserStatus(guest.id, "LOCKED")).toEqual({
      ok: false,
      error: "That account's status cannot be changed.",
    });
    expect(await actions.sa_setUserStatus(player, "BANNED")).toEqual({
      ok: false,
      error: "Banned is not a status of this workflow.",
    });
    await expect(actions.sa_setUserStatus("not-a-uuid", "LOCKED")).rejects.toThrow();
  });

  it("moves an account along the workflow, recording who did it, and refuses a move it lacks", async () => {
    expect(await actions.sa_setUserStatus(player, "SUSPENDED")).toEqual({
      ok: true,
      status: "suspended",
    });
    const [row] = await db
      .select({
        status: tables.user.status,
        idUpdatedByUser: tables.user.idUpdatedByUser,
        // The log the transition trigger appends to; not a column the app
        // declares, since nothing but this test reads it.
        log: sql<{ userId: string | null; activityData: Record<string, string> }[]>`activity_log`,
      })
      .from(tables.user)
      .where(eq(tables.user.id, player));
    expect(row.status).toBe("SUSPENDED");
    expect(row.idUpdatedByUser).toBe(admin);
    const entry = row.log.at(-1);
    expect(entry?.userId).toBe(admin);
    expect(entry?.activityData).toMatchObject({
      previous_status: "ACTIVE",
      new_status: "SUSPENDED",
    });

    // Nothing but active leads to inactive.
    expect(await actions.sa_setUserStatus(player, "INACTIVE")).toEqual({
      ok: false,
      error: "Suspended cannot move to inactive.",
    });
    // The same status again is not a move, and not an error either.
    expect(await actions.sa_setUserStatus(player, "SUSPENDED")).toEqual({
      ok: true,
      status: "suspended",
    });
    expect(
      (await actions.sa_listUsers(ours({ statuses: ["suspended"] }))).rows.map((r) => r.email),
    ).toEqual([PLAYER_EMAIL]);

    expect(await actions.sa_setUserStatus(player, "ACTIVE")).toEqual({
      ok: true,
      status: "active",
    });
  });
  it("gives an account another type, recording who did it, and refuses its own row, a guest and a type that is not one", async () => {
    expect(await actions.sa_setUserType(admin, -10)).toEqual({
      ok: false,
      error: "You cannot change your own type.",
    });
    const [guest] = await db
      .select({ id: tables.user.id })
      .from(tables.user)
      .where(eq(tables.user.email, GUEST_EMAIL));
    expect(await actions.sa_setUserType(guest.id, -20)).toEqual({
      ok: false,
      error: "That account's type cannot be changed.",
    });
    expect(await actions.sa_setUserType(player, -999)).toEqual({
      ok: false,
      error: "That is not an account type.",
    });
    await expect(actions.sa_setUserType("not-a-uuid", -20)).rejects.toThrow();
    caller = player;
    try {
      await expect(actions.sa_setUserType(player, -20)).rejects.toThrow();
    } finally {
      caller = admin;
    }

    expect(await actions.sa_setUserType(player, -20)).toEqual({
      ok: true,
      idUserType: -20,
      userTypeName: "Unpaid Storyteller",
    });
    const [row] = await db
      .select({ idUserType: tables.user.idUserType, idUpdatedByUser: tables.user.idUpdatedByUser })
      .from(tables.user)
      .where(eq(tables.user.id, player));
    expect(row).toEqual({ idUserType: -20, idUpdatedByUser: admin });
    expect(
      (await actions.sa_listUsers(ours({ idUserTypes: [-20] }))).rows.map((r) => r.email),
    ).toEqual([PLAYER_EMAIL]);

    // The same type again is not a change, and not an error either.
    expect(await actions.sa_setUserType(player, -20)).toMatchObject({ ok: true, idUserType: -20 });
    expect(await actions.sa_setUserType(player, -25)).toMatchObject({ ok: true, idUserType: -25 });
  });
});
