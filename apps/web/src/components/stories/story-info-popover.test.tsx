import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StoryCardData } from "@/lib/stories";

const story: StoryCardData = {
  idStory: -15,
  title: "Vampire",
  summary: "A city of the dead.",
  imageUrl: "https://rpg.irun.games/images/vampire.jpg",
  // Noon UTC, so the day is the same in whatever zone the tests run in.
  lastPlayed: new Date("2026-09-12T12:00:00Z"),
  systemName: "Vampire: The Masquerade",
  systemVersion: "5th",
  variant: null,
  isFavorite: false,
  isOwner: false,
  isActive: true,
  isLookingForPlayers: false,
  storytellerName: "Paul Stafford",
  hasOpenSession: false,
  playerCount: 3,
  waitingCount: 0,
  presentCount: 0,
};

// The popover imports its server action itself, so the module is mocked
// before the dynamic import below loads it.
const sa_getStory = mock.fn<(id: number) => Promise<StoryCardData | null>>(async () => story);

let StoryInfoPopover: typeof import("./story-info-popover").StoryInfoPopover;

describe("StoryInfoPopover", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", { namedExports: { sa_getStory } });
    ({ StoryInfoPopover } = await import("./story-info-popover"));
  });

  beforeEach(() => {
    sa_getStory.mock.resetCalls();
    sa_getStory.mock.mockImplementation(async () => story);
  });

  it("loads the story on first open and shows what the story page lists", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryInfoPopover idStory={-15} />);

    // Nothing is fetched until the button is pressed.
    expect(sa_getStory.mock.callCount()).toBe(0);
    await user.click(screen.getByRole("button", { name: "Story info" }));

    const panel = await screen.findByRole("dialog", { name: "Vampire" });
    expect(sa_getStory.mock.calls[0].arguments).toEqual([-15]);
    await waitFor(() => expect(panel).toHaveTextContent("A city of the dead."));
    expect(panel).toHaveTextContent("Vampire: The Masquerade (5th)");
    expect(panel).toHaveTextContent("Storyteller: Paul Stafford");
    expect(panel).toHaveTextContent("3 players");
    expect(panel).toHaveTextContent("Last played:");
    // The story's own page, in a new tab so the table stays where it is.
    const popout = within(panel).getByRole("link", { name: "Open in a new tab" });
    expect(popout).toHaveAttribute("href", "/stories/-15");
    expect(popout).toHaveAttribute("target", "_blank");
  });

  it("says so when the story is gone", async () => {
    sa_getStory.mock.mockImplementation(async () => null);
    const user = userEvent.setup();
    renderWithProviders(<StoryInfoPopover idStory={-15} />);

    await user.click(screen.getByRole("button", { name: "Story info" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This story is no longer here.");
  });
});
