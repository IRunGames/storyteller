import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { StoryPlayer } from "@/lib/stories";

const player: StoryPlayer = { idUser: "u1", name: "PalmDave", image: null };

const sa_removeStoryPlayer = mock.fn<
  (idStory: number, idUser: string) => Promise<{ ok: boolean; error?: string }>
>(async () => ({ ok: true }));

let RemovePlayerButton: typeof import("./remove-player-button").RemovePlayerButton;

describe("RemovePlayerButton", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_removeStoryPlayer },
    });
    ({ RemovePlayerButton } = await import("./remove-player-button"));
  });

  beforeEach(() => {
    sa_removeStoryPlayer.mock.resetCalls();
    sa_removeStoryPlayer.mock.mockImplementation(async () => ({ ok: true }));
    toaster.remove();
  });

  function render(onRemoved = () => {}) {
    return renderWithProviders(
      <>
        <RemovePlayerButton idStory={-1} player={player} onRemoved={onRemoved} />
        <Toaster />
      </>,
    );
  }

  const open = async (user = userEvent.setup()) => {
    await user.click(screen.getByRole("button", { name: "Remove PalmDave" }));
    return { user, dialog: await screen.findByRole("alertdialog") };
  };

  it("asks before it does anything", async () => {
    render();
    expect(sa_removeStoryPlayer.mock.callCount()).toBe(0);

    const { dialog } = await open();

    // An alertdialog, not a panel: it is a decision to confirm.
    expect(
      await screen.findByRole("alertdialog", { name: "Remove PalmDave?" }),
    ).toBeInTheDocument();
    // And it says what else goes with them.
    expect(within(dialog).getByText(/favorite of it/)).toBeInTheDocument();
    expect(sa_removeStoryPlayer.mock.callCount()).toBe(0);
  });

  it("does nothing on cancel", async () => {
    let removed = 0;
    render(() => (removed += 1));
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(sa_removeStoryPlayer.mock.callCount()).toBe(0);
    expect(removed).toBe(0);
  });

  it("removes the player on confirm, tells the list, and says so", async () => {
    let removed = 0;
    render(() => (removed += 1));
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(sa_removeStoryPlayer.mock.callCount()).toBe(1));
    expect(sa_removeStoryPlayer.mock.calls[0].arguments).toEqual([-1, "u1"]);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(removed).toBe(1);
    expect(await screen.findByText("PalmDave is no longer a player.")).toBeInTheDocument();
  });

  it("keeps the dialog open with an inline error when the action refuses", async () => {
    sa_removeStoryPlayer.mock.mockImplementation(async () => ({
      ok: false,
      error: "The storyteller cannot be removed from their own story.",
    }));
    let removed = 0;
    render(() => (removed += 1));
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The storyteller cannot be removed from their own story.",
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(removed).toBe(0);
  });

  it("says so in the dialog when the action throws", async () => {
    sa_removeStoryPlayer.mock.mockImplementation(async () => {
      throw new Error("network");
    });
    render();
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "They could not be removed. Try again.",
    );
  });
});
