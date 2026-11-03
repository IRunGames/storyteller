import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { StatusOption } from "@/lib/status";
import type { UserStatus } from "@/lib/user-types";

// The Users Status Workflow as seeded (db/seeds/seed_s_statuses.sql), since
// the chip's statuses are the app's own UserStatus words upper-cased and a
// made-up workflow could not be. What matters is its shape: active leads
// everywhere, only active leads to inactive, and the three switched-off
// statuses lead back to active.
const options: StatusOption[] = [
  { key: "ACTIVE", label: "Active", description: null, from: ["INACTIVE", "SUSPENDED", "LOCKED"] },
  { key: "INACTIVE", label: "Inactive", description: null, from: ["ACTIVE"] },
  {
    key: "SUSPENDED",
    label: "Suspended",
    description: null,
    from: ["ACTIVE", "INACTIVE", "LOCKED"],
  },
  { key: "LOCKED", label: "Locked", description: null, from: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
];

const ID = "01a0b60c-0000-7000-8000-000000000001";

const sa_setUserStatus = mock.fn<
  (idUser: string, status: string) => Promise<{ ok: boolean; status?: UserStatus; error?: string }>
>(async (_id, status) => ({ ok: true, status: status.toLowerCase() as UserStatus }));

// Zag only selects the highlighted item, and on open it sets its input
// modality to "virtual", which makes items ignore a single synthetic hover.
// The same nudge loop status-pill.test.tsx uses: keep moving the pointer
// until the highlight has rendered, then click.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

let UserStatusChip: typeof import("./user-status-chip").UserStatusChip;

describe("UserStatusChip", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/admin/users/actions", { namedExports: { sa_setUserStatus } });
    ({ UserStatusChip } = await import("./user-status-chip"));
  });

  beforeEach(() => {
    sa_setUserStatus.mock.resetCalls();
    sa_setUserStatus.mock.mockImplementation(async (_id, status) => ({
      ok: true,
      status: status.toLowerCase() as UserStatus,
    }));
    toaster.remove();
  });

  afterEach(cleanup);

  const chip = (status: UserStatus, readOnly = false, onChanged?: (status: UserStatus) => void) =>
    renderWithProviders(
      <>
        <UserStatusChip
          idUser={ID}
          status={status}
          options={options}
          readOnly={readOnly}
          onChanged={onChanged}
        />
        <Toaster />
      </>,
    );

  it("shows the status under the workflow's label, lower-case word and all", () => {
    chip("suspended", true);

    const pill = screen.getByText("Suspended");
    expect(pill).toHaveAttribute("data-status", "suspended");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("never opens for a guest, who is deleted rather than switched off", () => {
    chip("guest");

    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers exactly the moves the workflow allows out of the status", async () => {
    const user = userEvent.setup();
    chip("suspended");

    await user.click(screen.getByRole("button", { name: "Suspended" }));

    const items = await screen.findAllByRole("menuitem");
    // Only active leads to inactive, so a suspended account is offered
    // active and locked, in workflow order.
    expect(items.map((item) => item.textContent)).toEqual(["Active", "Locked"]);
  });

  it("moves back to active with one click, showing it at once and reporting it", async () => {
    const user = userEvent.setup();
    const changed: UserStatus[] = [];
    chip("locked", false, (status) => changed.push(status));

    await user.click(screen.getByRole("button", { name: "Locked" }));
    const items = await screen.findAllByRole("menuitem");
    await choose(user, items[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Active" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sa_setUserStatus.mock.calls[0].arguments).toEqual([ID, "ACTIVE"]);
    expect(changed).toEqual(["active"]);
  });

  it("asks before a move out of active, and only Confirm moves it", async () => {
    const user = userEvent.setup();
    chip("active");

    await user.click(screen.getByRole("button", { name: "Active" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Inactive", "Suspended", "Locked"]);
    await choose(user, items[1]);

    const ask = await screen.findByRole("dialog", { name: "Suspend this account?" });
    expect(sa_setUserStatus.mock.callCount()).toBe(0);
    expect(screen.getByRole("button", { name: "Active" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // The popover's content stays mounted once opened; closing hides it.
    await waitFor(() => expect(ask).not.toBeVisible());
    expect(sa_setUserStatus.mock.callCount()).toBe(0);

    await user.click(screen.getByRole("button", { name: "Active" }));
    await choose(user, (await screen.findAllByRole("menuitem"))[1]);
    await screen.findByRole("dialog", { name: "Suspend this account?" });
    await user.click(screen.getByRole("button", { name: "Suspend" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Suspended" })).toBeInTheDocument();
    });
    expect(sa_setUserStatus.mock.calls[0].arguments).toEqual([ID, "SUSPENDED"]);
  });

  it("puts the old status back when the action refuses, and says why", async () => {
    sa_setUserStatus.mock.mockImplementation(async () => ({
      ok: false,
      error: "That status changed while you were looking; try again.",
    }));
    const user = userEvent.setup();
    chip("inactive");

    await user.click(screen.getByRole("button", { name: "Inactive" }));
    const items = await screen.findAllByRole("menuitem");
    await choose(user, items[0]);

    await waitFor(() => {
      expect(
        screen.getByText("That status changed while you were looking; try again."),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Inactive" })).toBeInTheDocument();
  });

  it("puts the old status back when the action throws", async () => {
    sa_setUserStatus.mock.mockImplementation(async () => {
      throw new Error("network");
    });
    const user = userEvent.setup();
    chip("inactive");

    await user.click(screen.getByRole("button", { name: "Inactive" }));
    const items = await screen.findAllByRole("menuitem");
    await choose(user, items[0]);

    await waitFor(() => {
      expect(screen.getByText("That status could not be changed.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Inactive" })).toBeInTheDocument();
  });
});
