// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. It runs invitations end to end:
// a storyteller's to a story (stories/actions.ts), an administrator's to the
// app (admin/invitations/actions.ts), and accepting either here. `before`
// makes the people and a story, all under @example.test; the invitations
// are only ever to this file's own addresses, and everything is removed
// again in `after`. Mail is never sent: @/lib/email is replaced.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const hasDb = Boolean(process.env.DATABASE_URL);
const OWNER_EMAIL = "invite-actions-owner@example.test";
const ADMIN_EMAIL = "invite-actions-admin@example.test";
const PLAYER_EMAIL = "invite-actions-player@example.test";
const GUEST_EMAIL = "invite-actions-guest@example.test";
// Addresses invited but never made into users; all of this file's.
const NEWCOMER = "invite-actions-newcomer@example.test";
const OTHER = "invite-actions-other@example.test";
const EMAILS = [OWNER_EMAIL, ADMIN_EMAIL, PLAYER_EMAIL, GUEST_EMAIL, NEWCOMER, OTHER];

// Who is asking; "" is a visitor with no session at all.
let caller = "";
const getSession = mock.fn(async () => (caller ? { user: { id: caller } } : null));
const sendEmail = mock.fn(async () => true);
// redirect() throws in Next to end the action; this one throws something the
// test can read the destination from.
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
const redirect = (to: string) => {
  throw new Redirected(to);
};

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];
let invite: typeof import("./actions");
let storyActions: typeof import("@/app/(app)/(nav)/stories/actions");
let adminActions: typeof import("@/app/(app)/(nav)/admin/invitations/actions");

let owner = "";
let admin = "";
let player = "";
let guest = "";
let story = 0;

describe("invitations", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    mock.module("@/lib/email", {
      namedExports: { sendEmail, appOrigin: () => "http://localhost:3000" },
    });
    mock.module("next/navigation", { namedExports: { redirect, notFound: redirect } });
    ({ db, schema: tables } = await import("@/db"));
    invite = await import("./actions");
    storyActions = await import("@/app/(app)/(nav)/stories/actions");
    adminActions = await import("@/app/(app)/(nav)/admin/invitations/actions");

    owner = await makeTestUser(db, tables, OWNER_EMAIL);
    admin = await makeTestUser(db, tables, ADMIN_EMAIL);
    player = await makeTestUser(db, tables, PLAYER_EMAIL);
    guest = await makeTestUser(db, tables, GUEST_EMAIL);
    await db.update(tables.user).set({ isAnonymous: true }).where(eq(tables.user.id, guest));
    [{ id: story }] = await db
      .insert(tables.stories)
      .values({ title: "Invite fixture", idCreatedByUser: owner })
      .returning({ id: tables.stories.idStory });
  });

  beforeEach(async () => {
    caller = "";
    sendEmail.mock.resetCalls();
    await db.delete(tables.invitations).where(inArray(tables.invitations.email, EMAILS));
    await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, story));
    await db.update(tables.user).set({ idUserType: -25 }).where(eq(tables.user.id, owner));
    await db.update(tables.user).set({ idUserType: -100 }).where(eq(tables.user.id, admin));
    await db.update(tables.user).set({ idUserType: -10 }).where(eq(tables.user.id, player));
  });

  after(async () => {
    if (!db) return;
    await db.delete(tables.invitations).where(inArray(tables.invitations.email, EMAILS));
    if (story) {
      await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, story));
      await db.delete(tables.stories).where(eq(tables.stories.idStory, story));
    }
    for (const email of [OWNER_EMAIL, ADMIN_EMAIL, PLAYER_EMAIL, GUEST_EMAIL]) {
      await removeTestUser(db, tables, email);
    }
    await db.$client.end();
  });

  const seats = () =>
    db
      .select({ idUser: tables.storyPlayers.idUser, isFromLink: tables.storyPlayers.isFromLink })
      .from(tables.storyPlayers)
      .where(eq(tables.storyPlayers.idStory, story));

  const userType = async (id: string) =>
    (
      await db.select({ t: tables.user.idUserType }).from(tables.user).where(eq(tables.user.id, id))
    )[0].t;

  async function storyInvite(email: string, send = false) {
    caller = owner;
    const result = await storyActions.sa_inviteToStory(story, { email }, send);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result;
  }

  async function accept(as: string, token: string) {
    caller = as;
    try {
      return await invite.sa_acceptInvitation(token);
    } catch (error) {
      if (error instanceof Redirected) return error.to;
      throw error;
    }
  }

  describe("a storyteller's invitation", () => {
    it("is made for the story's owner, with or without mail", async () => {
      const sent = await storyInvite(NEWCOMER.toUpperCase(), true);
      expect(sent.invitation.email).toBe(NEWCOMER);
      expect(sent.emailed).toBe(true);
      expect(sendEmail.mock.callCount()).toBe(1);

      const copied = await storyInvite(OTHER);
      expect(copied.emailed).toBe(false);
      expect(sendEmail.mock.callCount()).toBe(1);
      caller = owner;
      expect((await storyActions.sa_listStoryInvitations(story)).map((i) => i.email)).toEqual([
        OTHER,
        NEWCOMER,
      ]);
    });

    it("refuses anyone but the story's owner", async () => {
      caller = player;
      await expect(
        storyActions.sa_inviteToStory(story, { email: NEWCOMER }, false),
      ).rejects.toThrow();
    });

    it("refuses an email that already has one waiting, until it expires or is withdrawn", async () => {
      const first = await storyInvite(NEWCOMER);
      caller = owner;
      expect(await storyActions.sa_inviteToStory(story, { email: NEWCOMER }, false)).toEqual({
        ok: false,
        errors: { email: "That email already has an invitation waiting." },
      });

      await db
        .update(tables.invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(tables.invitations.idInvitation, first.invitation.idInvitation));
      const second = await storyInvite(NEWCOMER);

      caller = owner;
      await storyActions.sa_revokeStoryInvitation(story, second.invitation.idInvitation);
      expect((await storyInvite(NEWCOMER)).ok).toBe(true);
    });

    it("refuses someone already at the table", async () => {
      await db.insert(tables.storyPlayers).values({ idStory: story, idUser: player });
      caller = owner;
      const seated = await storyActions.sa_inviteToStory(story, { email: PLAYER_EMAIL }, false);
      const self = await storyActions.sa_inviteToStory(story, { email: OWNER_EMAIL }, false);
      expect(seated.ok).toBe(false);
      expect(self.ok).toBe(false);
    });

    it("is shown to anyone holding the link, and accepted by an account into a seat", async () => {
      const { invitation } = await storyInvite(NEWCOMER);
      expect(await invite.sa_getInvitation(invitation.token)).toMatchObject({
        email: NEWCOMER,
        story: { idStory: story, title: "Invite fixture" },
        userTypeName: null,
      });

      // The token is enough: the player's address is not the invited one.
      expect(await accept(player, invitation.token)).toBe(`/play/${story}`);
      expect(await seats()).toEqual([{ idUser: player, isFromLink: false }]);

      expect(await invite.sa_getInvitation(invitation.token)).toBeNull();
      expect(await accept(player, invitation.token)).toEqual({
        ok: false,
        error: "This invitation is no longer valid.",
      });
    });

    it("is not accepted by a guest, who must make an account first", async () => {
      const { invitation } = await storyInvite(NEWCOMER);
      await expect(accept(guest, invitation.token)).rejects.toThrow();
      expect(await seats()).toEqual([]);
    });

    it("does not seat someone twice, or the storyteller at all", async () => {
      await db.insert(tables.storyPlayers).values({ idStory: story, idUser: player });
      const first = await storyInvite(NEWCOMER);
      const second = await storyInvite(OTHER);
      expect(await accept(player, first.invitation.token)).toBe(`/play/${story}`);
      expect(await accept(owner, second.invitation.token)).toBe(`/play/${story}`);
      expect(await seats()).toEqual([{ idUser: player, isFromLink: false }]);
    });

    it("leads nowhere once withdrawn or expired", async () => {
      const withdrawn = await storyInvite(NEWCOMER);
      caller = owner;
      await storyActions.sa_revokeStoryInvitation(story, withdrawn.invitation.idInvitation);
      expect(await invite.sa_getInvitation(withdrawn.invitation.token)).toBeNull();

      const expired = await storyInvite(OTHER);
      await db
        .update(tables.invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(tables.invitations.idInvitation, expired.invitation.idInvitation));
      expect(await accept(player, expired.invitation.token)).toMatchObject({ ok: false });
    });
  });

  describe("an administrator's invitation", () => {
    async function appInvite(email: string, idUserType: number) {
      caller = admin;
      const result = await adminActions.sa_inviteToApp({ email, idUserType }, false);
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      return result.invitation;
    }

    it("is refused to anyone short of an administrator", async () => {
      caller = owner;
      await expect(
        adminActions.sa_inviteToApp({ email: NEWCOMER, idUserType: -15 }, false),
      ).rejects.toThrow();
      await expect(adminActions.sa_listInvitations()).rejects.toThrow();
    });

    it("only gives a paid player or a paid storyteller", async () => {
      caller = admin;
      const result = await adminActions.sa_inviteToApp(
        { email: NEWCOMER, idUserType: -100 },
        false,
      );
      expect(result).toMatchObject({ ok: false, errors: { idUserType: expect.any(String) } });
    });

    it("raises the account that accepts it, and never lowers one", async () => {
      const raise = await appInvite(NEWCOMER, -25);
      expect(raise).toMatchObject({ kind: "app", target: "Paid Storyteller", status: "pending" });
      expect(await invite.sa_getInvitation(raise.token)).toMatchObject({
        story: null,
        userTypeName: "Paid Storyteller",
      });
      expect(await accept(player, raise.token)).toBe("/home");
      expect(await userType(player)).toBe(-25);

      const lower = await appInvite(OTHER, -15);
      expect(await accept(admin, lower.token)).toBe("/home");
      expect(await userType(admin)).toBe(-100);
    });

    it("lists every invitation with its status, and refuses a second one to the same address", async () => {
      await appInvite(NEWCOMER, -15);
      await storyInvite(NEWCOMER);
      caller = admin;
      expect(
        (await adminActions.sa_inviteToApp({ email: NEWCOMER, idUserType: -15 }, false)).ok,
      ).toBe(false);

      const mine = (await adminActions.sa_listInvitations()).filter((i) => i.email === NEWCOMER);
      expect(mine.map((i) => [i.kind, i.status])).toEqual([
        ["story", "pending"],
        ["app", "pending"],
      ]);
    });

    it("edits a waiting invitation but not an accepted one", async () => {
      const waiting = await appInvite(NEWCOMER, -15);
      caller = admin;
      const edited = await adminActions.sa_updateInvitation(waiting.idInvitation, {
        email: OTHER,
        idUserType: "-25",
        expiresOn: "2099-01-01",
      });
      expect(edited).toMatchObject({
        ok: true,
        invitation: { email: OTHER, idUserType: -25, target: "Paid Storyteller" },
      });

      await accept(player, waiting.token);
      caller = admin;
      expect(
        await adminActions.sa_updateInvitation(waiting.idInvitation, {
          email: OTHER,
          idUserType: "-15",
          expiresOn: "2099-01-01",
        }),
      ).toMatchObject({ ok: false, errors: { root: expect.any(String) } });
    });

    it("deletes an invitation, and its link with it", async () => {
      const doomed = await appInvite(NEWCOMER, -15);
      caller = admin;
      expect(await adminActions.sa_deleteInvitation(doomed.idInvitation)).toEqual({ ok: true });
      expect(await invite.sa_getInvitation(doomed.token)).toBeNull();
      const left = await db
        .select()
        .from(tables.invitations)
        .where(and(eq(tables.invitations.idInvitation, doomed.idInvitation)));
      expect(left).toEqual([]);
    });
  });
});
