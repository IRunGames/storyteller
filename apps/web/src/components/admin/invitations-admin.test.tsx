import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { AdminInvitation } from "@/app/(app)/(nav)/admin/invitations/actions";

const row = (over: Partial<AdminInvitation>): AdminInvitation => ({
  idInvitation: 1,
  kind: "app",
  email: "one@example.test",
  token: "tokenOne0000000000000000",
  target: "Paid Player",
  idUserType: -15,
  inviter: "Admin",
  createdAt: new Date("2026-10-01T12:00:00Z"),
  expiresAt: new Date("2099-01-01T12:00:00Z"),
  status: "pending",
  acceptedBy: null,
  ...over,
});

const rows = [
  row({}),
  row({
    idInvitation: 2,
    kind: "story",
    email: "two@example.test",
    target: "The Hollow Crown",
    idUserType: null,
    inviter: "Storyteller",
    createdAt: new Date("2026-10-02T12:00:00Z"),
  }),
  row({
    idInvitation: 3,
    email: "three@example.test",
    target: "Paid Storyteller",
    status: "accepted",
    acceptedBy: "Three",
    createdAt: new Date("2026-10-03T12:00:00Z"),
  }),
];

const sa_inviteToApp = mock.fn(async () => ({ ok: true, invitation: row({}), emailed: true }));
const sa_updateInvitation = mock.fn(async () => ({ ok: true, invitation: row({}) }));
const sa_resendInvitation = mock.fn(async () => ({ ok: true }));
const sa_deleteInvitation = mock.fn(async () => ({ ok: true }));

let InvitationsAdmin: typeof import("./invitations-admin").InvitationsAdmin;

function bodyEmails() {
  const table = screen.getByRole("table", { name: "Invitations" });
  const [, body] = within(table).getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((tr) => within(tr).getAllByRole("cell")[0].textContent);
}

describe("InvitationsAdmin", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/admin/invitations/actions", {
      namedExports: {
        sa_inviteToApp,
        sa_updateInvitation,
        sa_resendInvitation,
        sa_deleteInvitation,
      },
    });
    ({ InvitationsAdmin } = await import("./invitations-admin"));
  });

  beforeEach(() => {
    sa_deleteInvitation.mock.resetCalls();
    renderWithProviders(
      <>
        <InvitationsAdmin initial={rows} />
        <Toaster />
      </>,
    );
  });

  afterEach(() => toaster.remove());

  it("lists every invitation, newest first", () => {
    expect(bodyEmails()).toEqual(["three@example.test", "two@example.test", "one@example.test"]);
  });

  it("narrows the list by search, kind and status", async () => {
    const u = userEvent.setup();
    await u.type(screen.getByRole("searchbox", { name: "Search invitations" }), "hollow");
    expect(bodyEmails()).toEqual(["two@example.test"]);

    await u.clear(screen.getByRole("searchbox", { name: "Search invitations" }));
    await u.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "app");
    expect(bodyEmails()).toEqual(["three@example.test", "one@example.test"]);

    await u.selectOptions(screen.getByRole("combobox", { name: "Status" }), "accepted");
    expect(bodyEmails()).toEqual(["three@example.test"]);
  });

  it("sorts by a header", async () => {
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Email" }));
    const sorted = bodyEmails();
    expect(sorted).toEqual([...sorted].sort());
    expect(sorted).toHaveLength(3);
  });

  it("deletes an invitation once confirmed", async () => {
    const u = userEvent.setup();
    await u.click(
      screen.getByRole("button", { name: "Delete the invitation to two@example.test" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await u.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(sa_deleteInvitation.mock.callCount()).toBe(1));
    expect(sa_deleteInvitation.mock.calls[0].arguments).toEqual([2]);
    await waitFor(() => expect(bodyEmails()).toEqual(["three@example.test", "one@example.test"]));
  });

  it("will not edit an accepted invitation", () => {
    expect(
      screen.getByRole("button", { name: "Edit the invitation to three@example.test" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
