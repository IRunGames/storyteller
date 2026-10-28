import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";

const sa_suspendInactiveSession = mock.fn(
  async (_idStory: number, _idStorySession: number, _answered: boolean) => ({
    ok: true as const,
    status: "SUSPENDED",
  }),
);
const onSuspended = mock.fn((_status: string) => {});

const MINUTE = 60_000;

let InactivityCheck: typeof import("./inactivity-check").InactivityCheck;

// Only the interval and the clock are faked: the hook reads both, and the
// dialog's own timers keep running as they would.
function wait(ms: number) {
  act(() => mock.timers.tick(ms));
}

function renderCheck(isPlaying = true) {
  return renderWithProviders(
    <InactivityCheck
      idStory={7}
      idStorySession={2}
      isPlaying={isPlaying}
      onSuspended={onSuspended}
    />,
  );
}

describe("InactivityCheck", () => {
  before(async () => {
    mock.module("@/app/(app)/run/[id]/actions", { namedExports: { sa_suspendInactiveSession } });
    ({ InactivityCheck } = await import("./inactivity-check"));
  });

  beforeEach(() => {
    mock.timers.enable({ apis: ["setInterval", "Date"], now: 1_700_000_000_000 });
    sa_suspendInactiveSession.mock.resetCalls();
    onSuspended.mock.resetCalls();
  });

  afterEach(() => mock.timers.reset());

  it("asks after twenty quiet minutes, and not before", async () => {
    renderCheck();

    wait(19 * MINUTE);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    wait(1 * MINUTE);

    expect(
      await screen.findByRole("alertdialog", { name: "Are you still playing?" }),
    ).toBeInTheDocument();
  });

  it("starts the wait again on any activity at the table", async () => {
    renderCheck();

    wait(15 * MINUTE);
    fireEvent.pointerMove(document.body);
    wait(15 * MINUTE);

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("carries on when the storyteller is still playing", async () => {
    renderCheck();
    wait(20 * MINUTE);

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Yes, still playing" }));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
    wait(10 * MINUTE);

    expect(sa_suspendInactiveSession.mock.callCount()).toBe(0);
  });

  it("suspends the session when the storyteller says they are not playing", async () => {
    renderCheck();
    wait(20 * MINUTE);

    fireEvent.click(await screen.findByRole("button", { name: "No, suspend the session" }));

    await waitFor(() => expect(onSuspended.mock.callCount()).toBe(1));
    expect(sa_suspendInactiveSession.mock.calls[0].arguments).toEqual([7, 2, true]);
    expect(onSuspended.mock.calls[0].arguments).toEqual(["SUSPENDED"]);
  });

  it("suspends the session when nobody answers, whatever moves meanwhile", async () => {
    renderCheck();
    wait(20 * MINUTE);
    await screen.findByRole("alertdialog");

    fireEvent.pointerMove(document.body);
    wait(5 * MINUTE);

    await waitFor(() => expect(onSuspended.mock.callCount()).toBe(1));
    expect(sa_suspendInactiveSession.mock.calls[0].arguments).toEqual([7, 2, false]);
  });

  it("watches nothing while the session is not being played", () => {
    renderCheck(false);
    wait(60 * MINUTE);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sa_suspendInactiveSession.mock.callCount()).toBe(0);
  });
});
