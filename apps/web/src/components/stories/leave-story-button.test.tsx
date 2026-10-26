import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";

const sa_leaveStory = mock.fn<
  (idStory: number) => Promise<{ ok: true } | { ok: false; error: string }>
>(async () => ({ ok: true }));
const router = { refresh: mock.fn<() => void>() };

let LeaveStoryButton: typeof import("./leave-story-button").LeaveStoryButton;

describe("LeaveStoryButton", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", { namedExports: { sa_leaveStory } });
    mock.module("next/navigation", { namedExports: { useRouter: () => router } });
    ({ LeaveStoryButton } = await import("./leave-story-button"));
  });

  beforeEach(() => {
    sa_leaveStory.mock.resetCalls();
    sa_leaveStory.mock.mockImplementation(async () => ({ ok: true }));
    router.refresh.mock.resetCalls();
  });

  afterEach(() => toaster.remove());

  function render(onLeft = () => {}) {
    return renderWithProviders(
      <>
        <LeaveStoryButton idStory={-4} onLeft={onLeft} />
        <Toaster />
      </>,
    );
  }

  const open = async (user = userEvent.setup()) => {
    const button = screen.getByRole("button", { name: "Leave game" });
    await user.click(button);
    return {
      user,
      button,
      popover: await screen.findByRole("dialog", { name: "Leave this game?" }),
    };
  };

  it("is a round button with the exit icon", () => {
    render();
    const button = screen.getByRole("button", { name: "Leave game" });
    expect(button.querySelector(".lucide-log-out")).toBeInTheDocument();
  });

  it("asks first, saying a new invitation is needed to come back", async () => {
    render();
    const { popover } = await open();

    expect(within(popover).getByText(/Are you sure/)).toBeInTheDocument();
    expect(within(popover).getByText(/invited again/)).toBeInTheDocument();
    expect(sa_leaveStory.mock.callCount()).toBe(0);
  });

  it("does nothing on cancel", async () => {
    let left = 0;
    render(() => (left += 1));
    const { user, popover } = await open();

    await user.click(within(popover).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sa_leaveStory.mock.callCount()).toBe(0);
    expect(left).toBe(0);
  });

  it("leaves on confirm, tells the list, refreshes the page and says so", async () => {
    let left = 0;
    render(() => (left += 1));
    const { user, popover } = await open();

    await user.click(within(popover).getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(sa_leaveStory.mock.callCount()).toBe(1));
    expect(sa_leaveStory.mock.calls[0].arguments).toEqual([-4]);
    await waitFor(() => expect(left).toBe(1));
    expect(router.refresh.mock.callCount()).toBe(1);
    expect(await screen.findByText("You have left the game.")).toBeInTheDocument();
  });

  it("says why when the action refuses, and stays seated", async () => {
    sa_leaveStory.mock.mockImplementation(async () => ({
      ok: false,
      error: "You are not a player of this story.",
    }));
    let left = 0;
    render(() => (left += 1));
    const { user, popover } = await open();

    await user.click(within(popover).getByRole("button", { name: "Leave" }));

    expect(await within(popover).findByRole("alert")).toHaveTextContent(
      "You are not a player of this story.",
    );
    expect(left).toBe(0);
    expect(router.refresh.mock.callCount()).toBe(0);
  });
});
