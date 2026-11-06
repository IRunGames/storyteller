import { beforeEach, describe, it } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import { DeleteButton, type DeleteOutcome } from "./delete-button";

type Props = Partial<Parameters<typeof DeleteButton>[0]>;

describe("DeleteButton", () => {
  beforeEach(() => toaster.remove());

  function render(
    props: Props = {},
    onDelete: () => DeleteOutcome | Promise<DeleteOutcome> = async () => ({ ok: true }),
  ) {
    return renderWithProviders(
      <>
        <DeleteButton thing="The vault" label="Delete scene" onDelete={onDelete} {...props} />
        <Toaster />
      </>,
    );
  }

  const open = async (name = "Delete scene") => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name }));
    return { user, dialog: await screen.findByRole("dialog") };
  };

  it("asks first, with the standard words, and does nothing on cancel", async () => {
    let calls = 0;
    render({}, async () => {
      calls += 1;
      return { ok: true };
    });
    const { user, dialog } = await open();

    expect(screen.getByRole("dialog", { name: "Delete The vault?" })).toBeInTheDocument();
    expect(
      within(dialog).getByText("The vault will be deleted. This cannot be undone."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls).toBe(0);
  });

  it("deletes on confirm, closes, tells the caller, and says so", async () => {
    let deleted = 0;
    render({ onDeleted: () => (deleted += 1) });
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleted).toBe(1);
    expect(await screen.findByText("The vault has been deleted.")).toBeInTheDocument();
  });

  it("keeps the dialog open with the refusal, or a standard line when the call throws", async () => {
    let deleted = 0;
    render({ onDeleted: () => (deleted += 1) }, async () => ({ ok: false, error: "Not yours." }));
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Not yours.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(deleted).toBe(0);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("says so in the dialog when the call throws", async () => {
    render({}, async () => {
      throw new Error("network");
    });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The vault could not be deleted. Try again.",
    );
  });

  it("takes another verb, its own words, a warning and a harder confirm", async () => {
    render({
      thing: "PalmDave",
      label: "Remove PalmDave",
      verb: "Remove",
      confirmText: "Remove anyway",
      warning: "They are mid-session.",
      children: "They can be invited back.",
      done: "PalmDave is no longer a player.",
    });
    const { user, dialog } = await open("Remove PalmDave");

    expect(screen.getByRole("dialog", { name: "Remove PalmDave?" })).toBeInTheDocument();
    expect(within(dialog).getByText("They are mid-session.")).toBeInTheDocument();
    expect(within(dialog).getByText("They can be invited back.")).toBeInTheDocument();
    expect(within(dialog).queryByText(/cannot be undone/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove anyway" }));
    expect(await screen.findByText("PalmDave is no longer a player.")).toBeInTheDocument();
  });

  it("can be a full button rather than an icon", async () => {
    render({ trigger: "button", label: "Delete element" });
    expect(screen.getByRole("button", { name: "Delete element" })).toHaveTextContent(
      "Delete element",
    );
  });

  it("takes a plain callback, and keeps quiet when told there is nothing to announce", async () => {
    let removed = 0;
    render({ done: null, verb: "Remove" }, () => {
      removed += 1;
    });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(dialog).not.toBeVisible());
    expect(removed).toBe(1);
    expect(screen.queryByText(/has been deleted/)).not.toBeInTheDocument();
  });
});
