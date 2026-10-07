import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";

const sa_activateStory = mock.fn<(idStory: number) => Promise<{ ok: boolean; error?: string }>>(
  async () => ({ ok: true }),
);
const refresh = mock.fn();

let StoryUnavailableDialog: typeof import("./story-unavailable-dialog").StoryUnavailableDialog;

const base = { idStory: 7, title: "Kildealg", isOwner: true, isActive: true, isArchived: false };

describe("StoryUnavailableDialog", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { useRouter: () => ({ push: mock.fn(), replace: mock.fn(), refresh }) },
    });
    mock.module("@/app/(app)/play/[id]/actions", { namedExports: { sa_activateStory } });
    ({ StoryUnavailableDialog } = await import("./story-unavailable-dialog"));
  });

  beforeEach(() => {
    sa_activateStory.mock.resetCalls();
    sa_activateStory.mock.mockImplementation(async () => ({ ok: true }));
    refresh.mock.resetCalls();
    toaster.remove();
  });

  function render(story: typeof base) {
    return renderWithProviders(
      <>
        <StoryUnavailableDialog story={story} />
        <Toaster />
      </>,
    );
  }

  it("offers the storyteller of an inactive story the edit form and making it active", async () => {
    render({ ...base, isActive: false });
    const dialog = await screen.findByRole("alertdialog", { name: "Kildealg is not active" });

    expect(within(dialog).getByRole("link", { name: "Edit story" })).toHaveAttribute(
      "href",
      "/stories/7/edit",
    );
    expect(within(dialog).getByRole("button", { name: "Make active" })).toBeInTheDocument();
    // Nothing to dismiss it with: there is no table behind it.
    expect(within(dialog).queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("makes the story active and refreshes the page into the table", async () => {
    const user = userEvent.setup();
    render({ ...base, isActive: false });
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: "Make active" }));

    await waitFor(() => expect(refresh.mock.callCount()).toBe(1));
    expect(sa_activateStory.mock.calls[0].arguments).toEqual([7]);
    expect(await screen.findByText("Kildealg is active.")).toBeInTheDocument();
  });

  it("keeps a refusal in the dialog", async () => {
    sa_activateStory.mock.mockImplementation(async () => ({ ok: false, error: "Not yours." }));
    const user = userEvent.setup();
    render({ ...base, isActive: false });
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: "Make active" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Not yours.");
    expect(refresh.mock.callCount()).toBe(0);
  });

  it("offers only the edit form for an archived story, even an inactive one", async () => {
    render({ ...base, isActive: false, isArchived: true });
    const dialog = await screen.findByRole("alertdialog", { name: "Kildealg is archived" });

    expect(within(dialog).getByRole("link", { name: "Edit story" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Make active" })).not.toBeInTheDocument();
  });

  it("tells a player why, without offering what only the storyteller can do", async () => {
    render({ ...base, isOwner: false, isActive: false });
    const dialog = await screen.findByRole("alertdialog");

    expect(within(dialog).getByText(/no table to join/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Edit story" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Make active" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Back to Play" })).toHaveAttribute(
      "href",
      "/play",
    );
  });
});
