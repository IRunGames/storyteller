import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StorySceneDetail } from "@/lib/scenes";

// A line whose words run through more than one element — the date is its own
// <time> — read as a whole, as the eye reads it.
const line = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === "P" && element.textContent === text;
import type { StatusOption } from "@/lib/status";

// An invented workflow, as in status-pill.test.tsx: what the real statuses
// are called is the database's business and will change.
const options: StatusOption[] = [
  { key: "FIRST", label: "First", description: null, from: ["SECOND"] },
  { key: "SECOND", label: "Second", description: null, from: ["FIRST"] },
];

const detail: StorySceneDetail = {
  idStoryScene: -15,
  idStory: -4,
  idStorySession: -3,
  status: "SECOND",
  statusAt: new Date("2026-09-12T18:00:00Z"),
  sceneNumber: 1,
  length: 45,
  title: "Strangers in the morning",
  description: "A marked wizard and his man.\nDafydd, the shell and pearl seller.",
  imageLink: "https://rpg.irun.games/_astro/kildealg.webp",
  sessionNumber: 3,
  sessionHeading: "3. Kildealg",
  // Noon UTC, so the day is the same in whatever zone the tests run in.
  startedAt: new Date("2026-09-12T12:00:00Z"),
};

const sa_getStoryScene = mock.fn<(id: number) => Promise<StorySceneDetail | null>>(
  async () => detail,
);

let SceneInfoPopover: typeof import("./scene-info-popover").SceneInfoPopover;

async function open(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: "Scene info" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

describe("SceneInfoPopover", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_getStoryScene, sa_listStoryScenes: async () => [] },
    });
    mock.module("@/components/status/actions", {
      namedExports: {
        sa_setRowStatus: async (_table: string, _id: number, status: string) => ({
          ok: true,
          status,
        }),
        sa_listStatusOptions: async () => options,
      },
    });
    ({ SceneInfoPopover } = await import("./scene-info-popover"));
  });

  beforeEach(() => {
    sa_getStoryScene.mock.resetCalls();
    sa_getStoryScene.mock.mockImplementation(async () => detail);
  });

  const render = (canEdit = true) =>
    renderWithProviders(
      <SceneInfoPopover idStoryScene={-15} statusOptions={options} canEdit={canEdit} />,
    );

  it("fetches the scene on open, not before, and shows everything the card could not", async () => {
    render();
    expect(sa_getStoryScene.mock.callCount()).toBe(0);

    const { dialog } = await open();

    await waitFor(() => expect(sa_getStoryScene.mock.callCount()).toBe(1));
    expect(sa_getStoryScene.mock.calls[0].arguments).toEqual([-15]);
    // Popover.Title is what the dialog is named after.
    expect(await screen.findByRole("dialog", { name: detail.title })).toBeInTheDocument();
    // The picture is decoration beside a title that already names the scene,
    // so its alt is empty and it has no role to query by.
    expect(dialog.querySelector("img")).toHaveAttribute("src", detail.imageLink);
    // Where it was played, and how long it ran there.
    expect(
      await within(dialog).findByText(line("3. Kildealg · 45 minutes on Sep 12, 2026")),
    ).toBeInTheDocument();
    // The description keeps its line breaks, so it is matched a line at a time.
    expect(within(dialog).getByText(/A marked wizard and his man/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Dafydd, the shell and pearl seller/)).toBeInTheDocument();
  });

  it("says a scene has not been played rather than naming no sitting", async () => {
    sa_getStoryScene.mock.mockImplementation(async () => ({
      ...detail,
      idStorySession: null,
      sessionNumber: null,
      sessionHeading: null,
      statusAt: null,
      sceneNumber: null,
      length: null,
      imageLink: null,
      description: null,
    }));
    render();
    const { dialog } = await open();

    expect(await within(dialog).findByText("Not played yet.")).toBeInTheDocument();
    expect(within(dialog).getByText("Nothing written down yet.")).toBeInTheDocument();
    expect(dialog.querySelector("img")).toBeNull();
  });

  it("carries the status as a pill the storyteller can move", async () => {
    render();
    const { dialog } = await open();

    expect(await within(dialog).findByRole("button", { name: "Second" })).toBeInTheDocument();
  });

  it("shows the status without a menu to anyone who does not own the story", async () => {
    render(false);
    const { dialog } = await open();

    await within(dialog).findByText(/^3\. Kildealg/);
    expect(within(dialog).getByText("Second")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Second" })).not.toBeInTheDocument();
  });

  it("says so when the scene is gone, and when the action fails", async () => {
    sa_getStoryScene.mock.mockImplementation(async () => null);
    const { unmount } = render();
    const { dialog } = await open();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This scene is no longer here.",
    );
    unmount();

    sa_getStoryScene.mock.mockImplementation(async () => {
      throw new Error("network");
    });
    render();
    const second = await open();
    expect(await within(second.dialog).findByRole("alert")).toHaveTextContent(
      "Could not load the scene.",
    );
  });

  it("offers the scene on a page of its own, in a new tab", async () => {
    render();
    const { dialog } = await open();
    await screen.findByRole("dialog", { name: detail.title });

    const popout = within(dialog).getByRole("link", { name: "Open in a new tab" });
    expect(popout).toHaveAttribute("href", "/scenes/-15");
    expect(popout).toHaveAttribute("target", "_blank");
    expect(popout).toHaveAttribute("rel", "noopener noreferrer");
  });
});
