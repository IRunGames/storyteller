import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SortingState, Updater } from "@tanstack/react-table";

import { renderWithProviders } from "@/test/render";
import { currentUser } from "@/test/mocks";
import type { StoryCardData } from "@/lib/stories";
import type { CurrentUser } from "@/lib/current-user";
import { UserProvider } from "@/components/auth/user-provider";
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
  who: CurrentUser = currentUser(),
) {
  renderWithProviders(
    <UserProvider user={who}>
      <StoryTable
        stories={[base, kildealg]}
        sorting={sorting}
        onSortingChange={onSortingChange}
        onToggleFavorite={onToggleFavorite}
        pendingFavorites={pending}
      />
    </UserProvider>,
  );
  return { onSortingChange, onToggleFavorite };
}

describe("StoryTable", () => {
  it("lists each story with its title menu, status, favorite, players, sessions and play time", async () => {
    const user = userEvent.setup();
    renderTable();

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Story",
      "System",
      "Status",
      "Favorite",
      "Players",
      "Sessions",
      "Played",
      "Last played",
    ]);
    const vampire = screen.getByRole("row", { name: "Vampire" });
    // The game is a column of its own, after the title.
    const [, systemCell] = within(vampire).getAllByRole("cell");
    expect(systemCell).toHaveTextContent("Vampire: The Masquerade (5th)");
    // Last played is the instant, day and time, machine-readable in the time
    // element; the reader's own story is not tinted.
    expect(within(vampire).getByRole("time")).toHaveAttribute(
      "dateTime",
      "2026-01-01T00:00:00.000Z",
    );
    expect(vampire).not.toHaveAttribute("data-plays");
    // A story the reader plays in rather than runs is tinted.
    expect(screen.getByRole("row", { name: "Kildealg" })).toHaveAttribute("data-plays", "true");
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

    // The storyteller's own story's status is a menu with the other state;
    // another's is the same pill with nothing to press.
    expect(within(vampire).getByRole("button", { name: "Active" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
    const other = screen.getByRole("row", { name: "Kildealg" });
    expect(within(other).getByText("Inactive")).toBeInTheDocument();
    expect(within(other).queryByRole("button", { name: "Inactive" })).toBeNull();
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
      "/stories/-15/scenes",
    );
  });

  it("lets an administrator retire or bring back a story they do not run", () => {
    renderTable(undefined, undefined, undefined, undefined, currentUser({ idUserType: -100 }));
    const other = screen.getByRole("row", { name: "Kildealg" });
    expect(within(other).getByRole("button", { name: "Inactive" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("sorts from every header, saying which way on the header cell", async () => {
    const user = userEvent.setup();
    const { onSortingChange } = renderTable([{ id: "favorite", desc: true }]);

    const favorite = screen.getByRole("columnheader", { name: "Favorite" });
    expect(favorite).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: "Story" })).not.toHaveAttribute("aria-sort");

    for (const name of [
      "Story",
      "System",
      "Status",
      "Players",
      "Sessions",
      "Played",
      "Last played",
    ]) {
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
    expect(asked).toEqual([
      "title",
      "system",
      "status",
      "players",
      "sessions",
      "played",
      "lastPlayed",
    ]);
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
