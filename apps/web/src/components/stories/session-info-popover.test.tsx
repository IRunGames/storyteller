import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StorySessionDetail } from "@/lib/stories";

// A line whose words run through more than one element — the date is its own
// <time> — read as a whole, as the eye reads it.
const line = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === "P" && element.textContent === text;

const detail: StorySessionDetail = {
  idStorySession: -3,
  // Noon UTC, so the day is the same in whatever zone the tests run in.
  startedAt: new Date("2026-09-12T12:00:00Z"),
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
  isStoryteller: true,
};

// The popover imports its server action itself, so the module is mocked
// before the dynamic import below loads it.
const sa_getStorySession = mock.fn<(id: number) => Promise<StorySessionDetail | null>>(
  async () => detail,
);

// The session's pill and the scenes fold each take their workflow, which the
// popover fetches for itself. Invented statuses, as in status-pill.test.tsx:
// what the database calls them is the database's business.
const sa_listStatusOptions = mock.fn(async (table: string) =>
  table === "story_sessions"
    ? [
        { key: "OPEN", label: "Open", description: null, from: [] as string[] },
        { key: "DONE", label: "Done", description: null, from: ["OPEN"] },
        { key: "SHELVED", label: "Shelved", description: null, from: ["DONE"] },
      ]
    : [{ key: "COMPLETE", label: "Complete", description: null, from: [] as string[] }],
);

const sa_setRowStatus = mock.fn(async (_table: string, _id: number, status: string) => ({
  ok: true as const,
  status,
}));

// The pill's menu items take a pointer move before a click; see status-pill.test.tsx.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

// The scene info button on each scene row loads that scene for itself.
const sa_getStoryScene = mock.fn(async (idStoryScene: number) => ({
  idStoryScene,
  idStorySession: -3,
  status: "COMPLETE",
  statusAt: null,
  sceneNumber: 1,
  length: 45,
  title: "Strangers in the morning",
  description: "Three riders at the gate.",
  imageLink: null,
  sessionNumber: 3,
  sessionHeading: "3. Kildealg",
  startedAt: null,
}));

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
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_getStoryScene },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions, sa_setRowStatus },
    });
    ({ SessionInfoPopover } = await import("./session-info-popover"));
  });

  beforeEach(() => {
    sa_getStorySession.mock.resetCalls();
    sa_getStorySession.mock.mockImplementation(async () => detail);
    sa_listStatusOptions.mock.resetCalls();
    sa_setRowStatus.mock.resetCalls();
    sa_getStoryScene.mock.resetCalls();
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
    // The length, then the day it was opened.
    expect(await within(dialog).findByText(line("6.6 hours on Sep 12, 2026"))).toBeInTheDocument();
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
    // No length until the session is done; the pill says where it has got to.
    expect(within(dialog).getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/hours/)).not.toBeInTheDocument();
    // The day it was opened stands on its own.
    expect(await within(dialog).findByText(line("on Sep 12, 2026"))).toBeInTheDocument();
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
    // And it does not go asking for a scene workflow it has nothing to colour with.
    expect(sa_listStatusOptions.mock.calls.map((call) => call.arguments[0])).toEqual([
      "story_sessions",
    ]);
  });

  it("offers the session on a page of its own, in a new tab", async () => {
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { dialog } = await open();
    await screen.findByRole("dialog", { name: "3. Kildealg" });

    const popout = within(dialog).getByRole("link", { name: "Open in a new tab" });
    expect(popout).toHaveAttribute("href", "/sessions/-3");
    expect(popout).toHaveAttribute("target", "_blank");
  });

  it("opens a scene's own panel from its row, over the session's", async () => {
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { user, dialog } = await open();
    await user.click(await within(dialog).findByRole("button", { name: /Scenes \(2\)/ }));

    const [first] = within(dialog)
      .getAllByRole("listitem")
      .filter((item) => item.textContent?.includes("Strangers in the morning"));
    await user.click(within(first).getByRole("button", { name: "Scene info" }));

    const scene = await screen.findByRole("dialog", { name: "Strangers in the morning" });
    expect(await within(scene).findByText("Three riders at the gate.")).toBeInTheDocument();
    expect(sa_getStoryScene.mock.calls[0].arguments).toEqual([-15]);
    // The session's panel stays open underneath.
    expect(screen.getByRole("dialog", { name: "3. Kildealg" })).toBeInTheDocument();
  });

  it("lets the storyteller move the session's status from its pill, and tells the row", async () => {
    const changed: string[] = [];
    renderWithProviders(
      <SessionInfoPopover idStorySession={-3} onStatusChanged={(status) => changed.push(status)} />,
    );
    const { user, dialog } = await open();

    await user.click(await within(dialog).findByRole("button", { name: "Done" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Shelved"]);
    await choose(user, items[0]);

    await waitFor(() => expect(within(dialog).getByText("Shelved")).toBeInTheDocument());
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["story_sessions", -3, "SHELVED"]);
    expect(changed).toEqual(["SHELVED"]);
  });

  it("shows the session's status without a menu to anyone but the storyteller", async () => {
    sa_getStorySession.mock.mockImplementation(async () => ({
      ...detail,
      notes: null,
      lingeringQuestions: null,
      scenes: [],
      isStoryteller: false,
    }));
    renderWithProviders(<SessionInfoPopover idStorySession={-3} />);
    const { dialog } = await open();

    expect(await within(dialog).findByText("Done")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });
});
