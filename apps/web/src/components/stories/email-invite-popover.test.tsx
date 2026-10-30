import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { InviteToStoryResult, StoryInvitation } from "@/app/(app)/(nav)/stories/actions";

const waiting: StoryInvitation = {
  idInvitation: 3,
  email: "waiting@example.test",
  token: "waitingToken0000000000000",
  expiresAt: new Date("2099-01-01T00:00:00Z"),
};

const sa_listStoryInvitations = mock.fn(async (): Promise<StoryInvitation[]> => [waiting]);
const sa_inviteToStory = mock.fn(
  async (
    _idStory: number,
    input: { email: string },
    send: boolean,
  ): Promise<InviteToStoryResult> => ({
    ok: true,
    invitation: {
      ...waiting,
      idInvitation: 4,
      email: input.email,
      token: "newToken0000000000000000",
    },
    emailed: send,
  }),
);
const sa_revokeStoryInvitation = mock.fn(async () => ({ ok: true }));

let EmailInvitePopover: typeof import("./email-invite-popover").EmailInvitePopover;

async function openPopover() {
  const u = userEvent.setup();
  renderWithProviders(
    <>
      <EmailInvitePopover idStory={7} />
      <Toaster />
    </>,
  );
  await u.click(screen.getByRole("button", { name: "Invite by Email" }));
  const dialog = await screen.findByRole("dialog", { name: "Invite by email" });
  // Focus moves into the popover a beat after it appears; typing before
  // then is lost (invite-players-popover.test.tsx).
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  return { u, dialog };
}

describe("EmailInvitePopover", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_inviteToStory, sa_listStoryInvitations, sa_revokeStoryInvitation },
    });
    ({ EmailInvitePopover } = await import("./email-invite-popover"));
  });

  beforeEach(() => {
    sa_inviteToStory.mock.resetCalls();
    sa_revokeStoryInvitation.mock.resetCalls();
  });

  afterEach(() => toaster.remove());

  it("lists the invitations still waiting", async () => {
    const { dialog } = await openPopover();
    const list = await within(dialog).findByRole("list", { name: "Waiting invitations" });
    expect(within(list).getByText("waiting@example.test")).toBeInTheDocument();
  });

  it("sends an invitation to the address typed, and lists it", async () => {
    const { u, dialog } = await openPopover();
    await u.type(within(dialog).getByLabelText(/email/i), "new@example.test");
    await u.click(within(dialog).getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(sa_inviteToStory.mock.callCount()).toBe(1));
    expect(sa_inviteToStory.mock.calls[0].arguments).toEqual([
      7,
      { email: "new@example.test" },
      true,
    ]);
    expect(await screen.findByText("Invitation sent to new@example.test.")).toBeInTheDocument();
    expect(within(dialog).getByText("new@example.test")).toBeInTheDocument();
  });

  it("shows the action's refusal on the field", async () => {
    sa_inviteToStory.mock.mockImplementationOnce(async () => ({
      ok: false,
      errors: { email: "That email already has an invitation waiting." },
    }));
    const { u, dialog } = await openPopover();
    await u.type(within(dialog).getByLabelText(/email/i), "waiting@example.test");
    await u.click(within(dialog).getByRole("button", { name: "Copy link" }));

    expect(
      await within(dialog).findByText("That email already has an invitation waiting."),
    ).toBeInTheDocument();
  });

  it("withdraws a waiting invitation", async () => {
    const { u, dialog } = await openPopover();
    await u.click(
      await within(dialog).findByRole("button", {
        name: "Withdraw the invitation to waiting@example.test",
      }),
    );
    await waitFor(() => expect(sa_revokeStoryInvitation.mock.callCount()).toBe(1));
    expect(sa_revokeStoryInvitation.mock.calls[0].arguments).toEqual([7, 3]);
    await waitFor(() =>
      expect(within(dialog).queryByText("waiting@example.test")).not.toBeInTheDocument(),
    );
  });
});
