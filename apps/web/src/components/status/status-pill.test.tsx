import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { StatusOption } from "@/lib/status";

// The workflow here is invented, and deliberately not one of the workflows in
// seed_s_statuses.sql. Real statuses live in the database and will change; the
// pill is handed whichever ones it is given, so these cases say what it does
// with a workflow rather than what the current workflows happen to contain.
// Upper case, as stored keys are.
//
// Its shape is what matters: MIDDLE can be reached from either side, LAST only
// from MIDDLE and nothing can be reached from LAST, so LAST is the end of the
// workflow. FIRST and LAST do not lead to each other at all, which is what
// shows the menu to be the workflow's list and not simply every status.
const options: StatusOption[] = [
  { key: "FIRST", label: "First", description: null, from: ["MIDDLE"] },
  { key: "MIDDLE", label: "Middle", description: null, from: ["FIRST"] },
  { key: "LAST", label: "Last", description: null, from: ["MIDDLE"] },
];
const [first, middle, last] = options;

const sa_setRowStatus = mock.fn<
  (
    table: string,
    id: number,
    status: string,
  ) => Promise<{ ok: boolean; status?: string; error?: string }>
>(async (_table, _id, status) => ({ ok: true, status }));

// Zag only selects the highlighted item, and on open it sets its input
// modality to "virtual", which makes items ignore a single synthetic hover.
// The same nudge loop app-header.test.tsx uses for the account menu: keep
// moving the pointer until the highlight has rendered, then click.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

let StatusPill: typeof import("./status-pill").StatusPill;

describe("StatusPill", () => {
  before(async () => {
    mock.module("./actions", { namedExports: { sa_setRowStatus } });
    ({ StatusPill } = await import("./status-pill"));
  });

  beforeEach(() => {
    sa_setRowStatus.mock.resetCalls();
    sa_setRowStatus.mock.mockImplementation(async (_table, _id, status) => ({ ok: true, status }));
    toaster.remove();
  });

  const pill = (status: string, canEdit = true, onChanged?: (status: string) => void) =>
    renderWithProviders(
      <>
        <StatusPill
          table="story_scenes"
          id={7}
          status={status}
          options={options}
          canEdit={canEdit}
          onChanged={onChanged}
        />
        <Toaster />
      </>,
    );

  it("shows the status under the workflow's own label", () => {
    pill(middle.key, false);

    expect(screen.getByText(middle.label)).toBeInTheDocument();
  });

  it("gives every status the same pill, whatever its place in the workflow", () => {
    // No ramp: a pill says which status a row holds with the word, not with a
    // shade, so the first and the last are drawn alike.
    const { unmount } = pill(first.key, false);
    const firstPill = screen.getByText(first.label);
    expect(firstPill).toHaveAttribute("data-status", first.key);
    const firstClass = firstPill.className;
    unmount();

    pill(last.key, false);
    expect(screen.getByText(last.label)).toHaveAttribute("class", firstClass);
  });

  it("is not a menu for someone who does not own the thing", () => {
    pill(first.key, false);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is not a menu when the workflow leads nowhere out of the status", () => {
    pill(last.key);

    // Nothing lists LAST among the statuses it can be reached from, so there
    // is no move to offer and the pill stays plain text however it is owned.
    expect(screen.getByText(last.label)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers exactly the statuses the workflow allows out of this one", async () => {
    const user = userEvent.setup();
    pill(first.key);

    await user.click(screen.getByRole("button", { name: first.label }));

    const items = await screen.findAllByRole("menuitem");
    // Only MIDDLE lists FIRST among the statuses it can be reached from, so
    // LAST is not on offer and neither is FIRST itself.
    expect(items.map((item) => item.textContent)).toEqual([middle.label]);
  });

  it("moves the row and says so, showing the new status at once", async () => {
    const user = userEvent.setup();
    const changed: string[] = [];
    pill(middle.key, true, (status) => changed.push(status));

    await user.click(screen.getByRole("button", { name: middle.label }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([first.label, last.label]);
    await choose(user, items[1]);

    await waitFor(() => {
      expect(screen.getByText(last.label)).toBeInTheDocument();
    });
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["story_scenes", 7, last.key]);
    expect(changed).toEqual([last.key]);
  });

  it("puts the old status back when the action refuses, and says why", async () => {
    sa_setRowStatus.mock.mockImplementation(async () => ({
      ok: false,
      error: "That is not yours to change.",
    }));
    const user = userEvent.setup();
    pill(middle.key);

    await user.click(screen.getByRole("button", { name: middle.label }));
    const items = await screen.findAllByRole("menuitem");
    await choose(user, items[0]);

    await waitFor(() => {
      expect(screen.getByText("That is not yours to change.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: middle.label })).toBeInTheDocument();
  });

  it("puts the old status back when the action throws", async () => {
    sa_setRowStatus.mock.mockImplementation(async () => {
      throw new Error("network");
    });
    const user = userEvent.setup();
    pill(middle.key);

    await user.click(screen.getByRole("button", { name: middle.label }));
    const items = await screen.findAllByRole("menuitem");
    await choose(user, items[0]);

    await waitFor(() => {
      expect(screen.getByText("That status could not be changed.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: middle.label })).toBeInTheDocument();
  });
});
