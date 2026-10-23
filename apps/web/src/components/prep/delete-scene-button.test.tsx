import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";

const sa_deleteStoryScene = mock.fn<
  (idStoryScene: number) => Promise<{ ok: true } | { ok: false; error: string }>
>(async () => ({ ok: true }));

let DeleteSceneButton: typeof import("./delete-scene-button").DeleteSceneButton;

describe("DeleteSceneButton", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_deleteStoryScene },
    });
    ({ DeleteSceneButton } = await import("./delete-scene-button"));
  });

  beforeEach(() => {
    sa_deleteStoryScene.mock.resetCalls();
    sa_deleteStoryScene.mock.mockImplementation(async () => ({ ok: true }));
    toaster.remove();
  });

  function render({
    complete = false,
    sessionHeading = null as string | null,
    onDeleted = () => {},
  } = {}) {
    return renderWithProviders(
      <>
        <DeleteSceneButton
          idStoryScene={-7}
          title="The vault"
          complete={complete}
          sessionHeading={sessionHeading}
          onDeleted={onDeleted}
        />
        <Toaster />
      </>,
    );
  }

  const open = async (user = userEvent.setup()) => {
    await user.click(screen.getByRole("button", { name: "Delete scene" }));
    return { user, dialog: await screen.findByRole("alertdialog") };
  };

  it("asks before it does anything", async () => {
    render();
    const { dialog } = await open();

    expect(
      await screen.findByRole("alertdialog", { name: "Delete The vault?" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
    // A scene still to play is only preparation, so there is no word about
    // a session.
    expect(within(dialog).queryByText(/already been played/)).not.toBeInTheDocument();
    expect(sa_deleteStoryScene.mock.callCount()).toBe(0);
  });

  it("warns that a completed scene is part of a session it was played in, and still allows it", async () => {
    let deleted = 0;
    render({ complete: true, sessionHeading: "2. Kildealg", onDeleted: () => (deleted += 1) });
    const { user, dialog } = await open();

    expect(within(dialog).getByText(/already been played/)).toHaveTextContent("2. Kildealg");
    expect(within(dialog).getByRole("button", { name: "Delete anyway" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete anyway" }));

    await waitFor(() => expect(sa_deleteStoryScene.mock.callCount()).toBe(1));
    expect(sa_deleteStoryScene.mock.calls[0].arguments).toEqual([-7]);
    await waitFor(() => expect(deleted).toBe(1));
  });

  it("does nothing on cancel", async () => {
    let deleted = 0;
    render({ onDeleted: () => (deleted += 1) });
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(sa_deleteStoryScene.mock.callCount()).toBe(0);
    expect(deleted).toBe(0);
  });

  it("deletes the scene on confirm, tells the column, and says so", async () => {
    let deleted = 0;
    render({ onDeleted: () => (deleted += 1) });
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(sa_deleteStoryScene.mock.callCount()).toBe(1));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(deleted).toBe(1);
    expect(await screen.findByText("The vault has been deleted.")).toBeInTheDocument();
  });

  it("keeps the dialog open with an inline error when the action refuses", async () => {
    sa_deleteStoryScene.mock.mockImplementation(async () => ({
      ok: false,
      error: "That scene is not one of your story's.",
    }));
    let deleted = 0;
    render({ onDeleted: () => (deleted += 1) });
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That scene is not one of your story's.",
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(deleted).toBe(0);
  });

  it("says so in the dialog when the action throws", async () => {
    sa_deleteStoryScene.mock.mockImplementation(async () => {
      throw new Error("network");
    });
    render();
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The scene could not be deleted. Try again.",
    );
  });
});
