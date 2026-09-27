import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StorySessionDetail } from "@/lib/stories";

const detail: StorySessionDetail = {
  idStorySession: -3,
  number: 3,
  title: "Kildealg",
  status: "DONE",
  length: 395,
  imageLink: "https://rpg.irun.games/_astro/kildealg.webp",
  summary: "Morning at Dun Dwym brought strangers.",
  notes: "Dirdenach, the marked wizard.",
  lingeringQuestions: "Did King Glenys come back whole?",
  players: [
    { idUser: "u1", name: "PalmDave", image: null },
    { idUser: "u2", name: "PaulKhash", image: "https://x.test/pk.png" },
  ],
  // The action gives these to the storyteller only, so a fixture with none
  // stands for what anyone else is shown.
  scenes: [
    { idStoryScene: -15, title: "Strangers in the morning", status: "COMPLETE" },
    { idStoryScene: -16, title: "The king rode out before dawn", status: "COMPLETE" },
  ],
};

// The popover imports its server action itself, so the module is mocked
// before the dynamic import below loads it.
const sa_getStorySession = mock.fn<(id: number) => Promise<StorySessionDetail | null>>(
  async () => detail,
);

// The scenes fold colours each scene with the workflow, which the popover
// fetches for itself. Invented statuses, as in status-pill.test.tsx: what the
// database calls them is the database's business.
const sa_listStatusOptions = mock.fn(async () => [
  { key: "COMPLETE", label: "Complete", description: null, from: [] as string[] },
]);

let SessionInfoPopover: typeof import("./session-info-popover").SessionInfoPopover;

async function open(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: "Session info" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

describe("SessionInfoPopover", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_getStorySession },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions, sa_setRowStatus: async () => ({ ok: true }) },
    });
    ({ SessionInfoPopover } = await import("./session-info-popover"));
  });

  beforeEach(() => {
    sa_getStorySession.mock.resetCalls();
    sa_getStorySession.mock.mockImplementation(async () => detail);
    sa_listStatusOptions.mock.resetCalls();
  });

  it("fetches the session on open and shows its heading, image, length, players and summary", async () => {
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    expect(sa_getStorySession.mock.callCount()).toBe(0);

    const { dialog } = await open();

    await waitFor(() => expect(sa_getStorySession.mock.callCount()).toBe(1));
    expect(sa_getStorySession.mock.calls[0].arguments).toEqual([-3]);
    // Popover.Title is what the dialog is named after, not a heading of its own.
    expect(await screen.findByRole("dialog", { name: "3. Kildealg" })).toBeInTheDocument();
    // The image is decoration beside a heading that already names the
    // session, so it has no alt text and is found by its source among the
    // avatars, which are presentational too.
    const images = within(dialog).getAllByRole("presentation", { hidden: true });
    expect(images.map((image) => image.getAttribute("src"))).toContain(detail.imageLink);
    expect(within(dialog).getByText("6.6 hours")).toBeInTheDocument();
    expect(within(dialog).getByText("Morning at Dun Dwym brought strangers.")).toBeInTheDocument();
    const players = within(within(dialog).getByRole("list", { name: "Players" })).getAllByRole(
      "listitem",
    );
    // By text rather than textContent: the avatar's fallback initial sits in
    // the same item as the name.
    expect(players).toHaveLength(2);
    expect(within(players[0]).getByText("PalmDave")).toBeInTheDocument();
    expect(within(players[1]).getByText("PaulKhash")).toBeInTheDocument();
  });

  it("keeps the notes and lingering questions folded until asked", async () => {
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { user, dialog } = await open();
    await screen.findByRole("dialog", { name: "3. Kildealg" });

    const notes = within(dialog).getByText("Dirdenach, the marked wizard.");
    expect(notes).not.toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Notes" }));
    await waitFor(() => expect(notes).toBeVisible());

    const questions = within(dialog).getByText("Did King Glenys come back whole?");
    expect(questions).not.toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Lingering questions" }));
    await waitFor(() => expect(questions).toBeVisible());
  });

  it("leaves out what the session does not have", async () => {
    sa_getStorySession.mock.mockImplementation(async () => ({
      ...detail,
      title: null,
      status: "OPEN",
      length: null,
      imageLink: null,
      summary: null,
      notes: null,
      lingeringQuestions: null,
      players: [],
    }));
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { dialog } = await open();

    expect(await screen.findByRole("dialog", { name: "Session 3" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("presentation", { hidden: true })).not.toBeInTheDocument();
    expect(within(dialog).getByText("In progress")).toBeInTheDocument();
    expect(within(dialog).getByText("No players recorded.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Lingering questions" }),
    ).not.toBeInTheDocument();
  });

  it("says so inline when the session cannot be loaded", async () => {
    sa_getStorySession.mock.mockImplementation(async () => {
      throw new Error("offline");
    });
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { dialog } = await open();

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not load the session.",
    );
  });

  it("fetches once and reuses the answer when opened again", async () => {
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { user } = await open();
    await screen.findByRole("dialog", { name: "3. Kildealg" });

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await open(user);
    expect(await screen.findByRole("dialog", { name: "3. Kildealg" })).toBeInTheDocument();
    expect(sa_getStorySession.mock.callCount()).toBe(1);
  });

  it("folds the sitting's scenes away behind a count, and lists them opened", async () => {
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { user, dialog } = await open();

    const fold = await within(dialog).findByRole("button", { name: /Scenes \(2\)/ });
    // Folded to start with: a session ran through a dozen of them and the
    // panel is read for its summary first. The accordion keeps its content in
    // the DOM and hides it, so this is about what can be seen, not what is
    // rendered.
    expect(within(dialog).getByText("1. Strangers in the morning")).not.toBeVisible();

    await user.click(fold);
    // Numbered in the order they were played, first to last.
    await waitFor(() => {
      expect(within(dialog).getByText("1. Strangers in the morning")).toBeVisible();
    });
    expect(within(dialog).getByText("2. The king rode out before dawn")).toBeVisible();
    // Each one carries its status, which the panel does not offer to change.
    expect(within(dialog).getAllByText("Complete")).toHaveLength(2);
    expect(within(dialog).queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
  });

  it("has no scenes fold for a reader the action gives no scenes", async () => {
    sa_getStorySession.mock.mockImplementation(async () => ({ ...detail, scenes: [] }));
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { dialog } = await open();

    await within(dialog).findByText(detail.summary!);
    expect(within(dialog).queryByRole("button", { name: /Scenes/ })).not.toBeInTheDocument();
    // And it does not go asking for a workflow it has nothing to colour with.
    expect(sa_listStatusOptions.mock.callCount()).toBe(0);
  });
});
