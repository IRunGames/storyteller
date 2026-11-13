import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SortingState, Updater } from "@tanstack/react-table";

import { renderWithProviders } from "@/test/render";
import type { StoryCardData } from "@/lib/stories";
import { StoryTable } from "./story-table";

const base: StoryCardData = {
  idStory: -15,
  title: "Vampire",
  summary: null,
  imageUrl: null,
  lastPlayed: new Date("2026-01-01T00:00:00Z"),
  systemName: "Vampire: The Masquerade",
  systemVersion: "5th",
  variant: null,
  isFavorite: false,
  isOwner: true,
  isPlayer: false,
  isPublic: false,
  isActive: true,
  isLookingForPlayers: false,
  storytellerName: "PalmDave",
  hasOpenSession: false,
  playerCount: 3,
  waitingCount: 0,
  presentCount: 0,
  sessionCount: 4,
  playMinutes: 150,
  buildSceneId: -7,
};
const kildealg: StoryCardData = {
  ...base,
  idStory: -16,
  title: "Kildealg",
  isOwner: false,
  storytellerName: "Tom",
  isFavorite: true,
  isActive: false,
  playerCount: 1,
  sessionCount: 0,
  playMinutes: 0,
};

function renderTable(
  sorting: SortingState = [],
  onSortingChange = mock.fn((_updater: Updater<SortingState>) => {}),
  onToggleFavorite = mock.fn((_story: StoryCardData, _isFavorite: boolean) => {}),
  pending: ReadonlySet<number> = new Set(),
) {
  renderWithProviders(
    <StoryTable
      stories={[base, kildealg]}
      sorting={sorting}
      onSortingChange={onSortingChange}
      onToggleFavorite={onToggleFavorite}
      pendingFavorites={pending}
    />,
  );
  return { onSortingChange, onToggleFavorite };
}

describe("StoryTable", () => {
  it("lists each story with its title menu, status, favorite, players, sessions and play time", async () => {
    const user = userEvent.setup();
    renderTable();

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Story",
      "Status",
      "Favorite",
      "Players",
      "Sessions",
      "Played",
    ]);
    const vampire = screen.getByRole("row", { name: "Vampire" });
    expect(within(vampire).getByText("Vampire: The Masquerade (5th)")).toBeInTheDocument();
    expect(within(vampire).getByText("Active")).toBeInTheDocument();
    expect(within(vampire).getByLabelText("3 players")).toHaveTextContent("3");
    expect(within(vampire).getByLabelText("4 sessions")).toHaveTextContent("4");
    expect(within(vampire).getByText("2.5 hours")).toBeInTheDocument();
    expect(within(vampire).getByRole("button", { name: "Add to Favorites" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Their own story says nothing of its storyteller.
    expect(within(vampire).queryByText(/Storyteller:/)).toBeNull();

    const other = screen.getByRole("row", { name: "Kildealg" });
    expect(within(other).getByText("Inactive")).toBeInTheDocument();
    expect(within(other).getByText("Storyteller: Tom")).toBeInTheDocument();
    expect(within(other).getByLabelText("1 player")).toBeInTheDocument();
    expect(within(other).getByText("—")).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: "Remove from Favorites" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The title is the story title menu.
    await user.click(within(vampire).getByRole("button", { name: "Vampire" }));
    expect(await screen.findByRole("menuitem", { name: "Build scenes" })).toHaveAttribute(
      "href",
      "/scenes/-7/live",
    );
  });

  it("sorts from every header, saying which way on the header cell", async () => {
    const user = userEvent.setup();
    const { onSortingChange } = renderTable([{ id: "favorite", desc: true }]);

    const favorite = screen.getByRole("columnheader", { name: "Favorite" });
    expect(favorite).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: "Story" })).not.toHaveAttribute("aria-sort");

    for (const name of ["Story", "Status", "Players", "Sessions", "Played"]) {
      await user.click(
        within(screen.getByRole("columnheader", { name })).getByRole("button", { name }),
      );
    }
    // Each press asks for its own column, the page holding the sort.
    const asked = onSortingChange.mock.calls.map((call) => {
      const updater = call.arguments[0];
      const next = typeof updater === "function" ? updater([]) : updater;
      return next[0]?.id;
    });
    expect(asked).toEqual(["title", "status", "players", "sessions", "played"]);
  });

  it("turns a heart, and leaves one in flight alone", async () => {
    const user = userEvent.setup();
    const { onToggleFavorite } = renderTable([], undefined, undefined, new Set([-16]));

    await user.click(
      within(screen.getByRole("row", { name: "Vampire" })).getByRole("button", {
        name: "Add to Favorites",
      }),
    );
    expect(onToggleFavorite.mock.calls[0].arguments[1]).toBe(true);
    const pending = within(screen.getByRole("row", { name: "Kildealg" })).getByRole("button", {
      name: "Remove from Favorites",
    });
    expect(pending).toHaveAttribute("aria-disabled", "true");
    await user.click(pending);
    expect(onToggleFavorite.mock.callCount()).toBe(1);
  });
});
