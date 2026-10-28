// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. A guest and an account, both
// test users under @example.test, and two stories: one only the guest sits
// at, one both do. Everything is removed again in `after`.
import { after, before, describe, it } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const OWNER_EMAIL = "guests-owner@example.test";
const GUEST_EMAIL = "guests-guest@example.test";
const ACCOUNT_EMAIL = "guests-account@example.test";
const hasDb = Boolean(process.env.DATABASE_URL);

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];
let moveGuestToUser: typeof import("./guests").moveGuestToUser;

let owner = "";
let guest = "";
let account = "";
let onlyGuest = 0;
let both = 0;

describe("moveGuestToUser", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    ({ db, schema: tables } = await import("@/db"));
    ({ moveGuestToUser } = await import("./guests"));
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
    for (const email of [GUEST_EMAIL, ACCOUNT_EMAIL, OWNER_EMAIL]) {
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
    await db
      .insert(tables.chats)
      .values([
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

    await moveGuestToUser(guest, account);

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
});
