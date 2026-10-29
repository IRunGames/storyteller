// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. A guest and an account, both
// test users under @example.test, and two stories: one only the guest sits
// at, one both do. Everything is removed again in `after`; the tests that
// delete guests delete only guests this file made.
import { after, before, describe, it } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const OWNER_EMAIL = "guests-owner@example.test";
const GUEST_EMAIL = "guests-guest@example.test";
const ACCOUNT_EMAIL = "guests-account@example.test";
// The guests the deleting tests seat; a failed test can leave them behind.
const SEATED_EMAILS = [
  "guests-leaving@example.test",
  "guests-at-session@example.test",
  "guests-lapsed@example.test",
  "guests-live@example.test",
  "guests-fresh@example.test",
  "guests-elsewhere@example.test",
];
const hasDb = Boolean(process.env.DATABASE_URL);

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];
let guests: typeof import("./guests");

let owner = "";
let guest = "";
let account = "";
let onlyGuest = 0;
let both = 0;

describe("guests", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    ({ db, schema: tables } = await import("@/db"));
    guests = await import("./guests");
    owner = await makeTestUser(db, tables, OWNER_EMAIL);
    guest = await makeTestUser(db, tables, GUEST_EMAIL);
    account = await makeTestUser(db, tables, ACCOUNT_EMAIL);
    await db.update(tables.user).set({ isAnonymous: true }).where(eq(tables.user.id, guest));

    [{ id: onlyGuest }, { id: both }] = await db
      .insert(tables.stories)
      .values([
        { title: "Guests fixture — the guest's", idCreatedByUser: owner },
        { title: "Guests fixture — both", idCreatedByUser: owner },
      ])
      .returning({ id: tables.stories.idStory });
  });

  after(async () => {
    if (!db) return;
    if (onlyGuest || both) {
      const ids = [onlyGuest, both];
      await db.delete(tables.chats).where(inArray(tables.chats.idStory, ids));
      await db.delete(tables.sessionPlayers).where(inArray(tables.sessionPlayers.idStory, ids));
      await db.delete(tables.storyPlayers).where(inArray(tables.storyPlayers.idStory, ids));
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, ids));
    }
    for (const email of [...SEATED_EMAILS, GUEST_EMAIL, ACCOUNT_EMAIL, OWNER_EMAIL]) {
      await removeTestUser(db, tables, email);
    }
    await db.$client.end();
  });

  it("hands the guest's seats, presence and lines to the account, so the guest can be deleted", async () => {
    await db.insert(tables.storyPlayers).values([
      { idStory: onlyGuest, idUser: guest, isFromLink: true },
      { idStory: both, idUser: guest, isFromLink: true },
      { idStory: both, idUser: account },
    ]);
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: both, idCreatedByUser: owner })
      .returning({ id: tables.storySessions.idStorySession });
    await db.insert(tables.sessionPlayers).values([
      { idStory: onlyGuest, idCreatedByUser: guest, idUpdatedByUser: guest },
      {
        idStory: both,
        idStorySession: session.id,
        idCreatedByUser: guest,
        idUpdatedByUser: guest,
      },
      {
        idStory: both,
        idStorySession: session.id,
        idCreatedByUser: account,
        idUpdatedByUser: account,
      },
    ]);
    await db.insert(tables.chats).values([
      {
        idStory: both,
        chatText: "Hello from a guest",
        idCreatedByUser: guest,
        idUpdatedByUser: guest,
      },
    ]);
    await db.insert(tables.userPreferences).values({
      idUser: guest,
      preferences: {},
      idCreatedByUser: guest,
      idUpdatedByUser: guest,
    });

    await guests.moveGuestToUser(guest, account);

    const seats = await db
      .select({
        idStory: tables.storyPlayers.idStory,
        idUser: tables.storyPlayers.idUser,
        isFromLink: tables.storyPlayers.isFromLink,
      })
      .from(tables.storyPlayers)
      .where(inArray(tables.storyPlayers.idStory, [onlyGuest, both]))
      .orderBy(tables.storyPlayers.idStory);
    // The guest's seat at a story the account already had is dropped for
    // the account's own; the other comes across with its link mark.
    expect(seats).toEqual([
      { idStory: onlyGuest, idUser: account, isFromLink: true },
      { idStory: both, idUser: account, isFromLink: false },
    ]);

    const presence = await db
      .select({
        idStory: tables.sessionPlayers.idStory,
        who: tables.sessionPlayers.idCreatedByUser,
      })
      .from(tables.sessionPlayers)
      .where(inArray(tables.sessionPlayers.idStory, [onlyGuest, both]))
      .orderBy(tables.sessionPlayers.idStory);
    expect(presence).toEqual([
      { idStory: onlyGuest, who: account },
      { idStory: both, who: account },
    ]);

    const [line] = await db
      .select({ by: tables.chats.idCreatedByUser, editedBy: tables.chats.idUpdatedByUser })
      .from(tables.chats)
      .where(eq(tables.chats.idStory, both));
    expect(line).toEqual({ by: account, editedBy: account });

    // What the anonymous plugin does next: nothing holds the guest back.
    await db.delete(tables.user).where(eq(tables.user.id, guest));
  });

  // A guest of this file's, made afresh: seated at the guest's story, at a
  // session of it, and with preferences, everything deleteGuests clears.
  async function seatedGuest(email: string, status = "PRESENT") {
    const id = await makeTestUser(db, tables, email);
    await db.update(tables.user).set({ isAnonymous: true }).where(eq(tables.user.id, id));
    await db
      .insert(tables.storyPlayers)
      .values({ idStory: onlyGuest, idUser: id, isFromLink: true });
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: onlyGuest, idCreatedByUser: owner })
      .returning({ id: tables.storySessions.idStorySession });
    await db.insert(tables.sessionPlayers).values({
      idStory: onlyGuest,
      idStorySession: session.id,
      status,
      idCreatedByUser: id,
      idUpdatedByUser: id,
    });
    await db.insert(tables.userPreferences).values({
      idUser: id,
      preferences: {},
      idCreatedByUser: id,
      idUpdatedByUser: id,
    });
    return { id, idStorySession: session.id };
  }

  const exists = async (id: string) =>
    (await db.select({ id: tables.user.id }).from(tables.user).where(eq(tables.user.id, id)))
      .length > 0;

  it("deletes a guest with their seats and presence, and names the tables they were at", async () => {
    const seated = await seatedGuest("guests-leaving@example.test");

    expect(await guests.deleteGuests([seated.id])).toEqual([onlyGuest]);

    expect(await exists(seated.id)).toBe(false);
    const left = await db
      .select({ id: tables.sessionPlayers.idSessionPlayer })
      .from(tables.sessionPlayers)
      .where(eq(tables.sessionPlayers.idStorySession, seated.idStorySession));
    expect(left).toEqual([]);
  });

  it("never deletes someone with an account", async () => {
    expect(await guests.deleteGuests([account])).toEqual([]);
    expect(await exists(account)).toBe(true);
  });

  it("takes every guest out of a story, deleting only those seated nowhere else", async () => {
    const only = await seatedGuest("guests-at-session@example.test");
    const elsewhere = await seatedGuest("guests-elsewhere@example.test", "LEFT");
    await db.insert(tables.storyPlayers).values({ idStory: both, idUser: elsewhere.id });
    // The account holds the seat the first test moved to it.

    expect(await guests.removeGuestsFromStory(onlyGuest)).toEqual({
      wasPresent: true,
      deleted: [only.id],
    });

    expect(await exists(only.id)).toBe(false);
    expect(await exists(elsewhere.id)).toBe(true);
    const seats = await db
      .select({ idStory: tables.storyPlayers.idStory, idUser: tables.storyPlayers.idUser })
      .from(tables.storyPlayers)
      .where(inArray(tables.storyPlayers.idUser, [elsewhere.id, account]))
      .orderBy(tables.storyPlayers.idStory, tables.storyPlayers.idUser);
    expect(seats).toContainEqual({ idStory: onlyGuest, idUser: account });
    expect(seats.filter((seat) => seat.idUser === elsewhere.id)).toEqual([
      { idStory: both, idUser: elsewhere.id },
    ]);
    await guests.deleteGuests([elsewhere.id]);
  });

  it("takes out only the guests named, when some are", async () => {
    const leaving = await seatedGuest("guests-leaving@example.test");
    const staying = await seatedGuest("guests-live@example.test");

    expect((await guests.removeGuestsFromStory(onlyGuest, [leaving.id])).deleted).toEqual([
      leaving.id,
    ]);
    expect(await exists(staying.id)).toBe(true);
    await guests.deleteGuests([staying.id]);
  });

  it("marks a guest away from the table, and tells away from present", async () => {
    const seated = await seatedGuest("guests-fresh@example.test");
    expect(await guests.isGuestAway(onlyGuest, seated.id)).toBe(false);

    expect(await guests.markGuestAway(onlyGuest, seated.id)).toBe(true);
    expect(await guests.isGuestAway(onlyGuest, seated.id)).toBe(true);
    // Already away: nothing left to mark.
    expect(await guests.markGuestAway(onlyGuest, seated.id)).toBe(false);
    await guests.deleteGuests([seated.id]);
  });

  it("counts a guest as lapsed once a day old with no session left", async () => {
    const lapsed = await seatedGuest("guests-lapsed@example.test");
    const live = await seatedGuest("guests-live@example.test");
    const fresh = await seatedGuest("guests-fresh@example.test");
    const dayOld = new Date(Date.now() - 2 * 86_400_000);
    await db
      .update(tables.user)
      .set({ createdAt: dayOld })
      .where(inArray(tables.user.id, [lapsed.id, live.id]));
    await db.insert(tables.session).values([
      {
        userId: lapsed.id,
        token: "guests-test-expired",
        expiresAt: new Date(Date.now() - 60_000),
        updatedAt: new Date(),
      },
      {
        userId: live.id,
        token: "guests-test-live",
        expiresAt: new Date(Date.now() + 86_400_000),
        updatedAt: new Date(),
      },
    ]);

    const found = await guests.lapsedGuests();
    expect(found).toContain(lapsed.id);
    expect(found).not.toContain(live.id);
    expect(found).not.toContain(fresh.id);
    expect(found).not.toContain(account);
    await guests.deleteGuests([lapsed.id, live.id, fresh.id]);
  });
});
