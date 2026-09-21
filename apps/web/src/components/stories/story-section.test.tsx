import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StoryCardData } from "@/lib/stories";
import { StorySection } from "./story-section";

function stories(count: number, from = 1): StoryCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    idGame: from + i,
    gameTitle: `Story ${from + i}`,
    summary: null,
    imageUrl: null,
    lastPlayed: new Date("2026-01-01T00:00:00Z"),
    systemName: null,
    systemVersion: null,
    variant: null,
    isFavorite: false,
    isOwner: false,
    isActive: true,
  }));
}

const noop = () => {};
const none: ReadonlySet<number> = new Set();

function renderSection(overrides: Partial<Parameters<typeof StorySection>[0]> = {}) {
  return renderWithProviders(
    <StorySection
      title="My Stories"
      stories={stories(3)}
      hasMore={false}
      isLoadingMore={false}
      onMore={noop}
      onToggleFavorite={noop}
      pendingFavorites={none}
      {...overrides}
    />,
  );
}

describe("StorySection", () => {
  it("shows an empty state when there are no stories", () => {
    renderSection({ stories: [] });

    expect(screen.getByRole("region", { name: "My Stories" })).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("renders a card per story and no More button when there is nothing more", () => {
    renderSection();

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("shows More when asked and reports the click", async () => {
    const user = userEvent.setup();
    const onMore = mock.fn();
    renderSection({ hasMore: true, onMore });

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(onMore.mock.callCount()).toBe(1);
  });

  it("keeps More visible but disabled while loading", () => {
    renderSection({ hasMore: true, isLoadingMore: true });

    expect(screen.getByRole("button", { name: "More" })).toBeDisabled();
  });

  it("passes heart clicks up with the story and the requested state", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = mock.fn<(s: StoryCardData, next: boolean) => void>();
    renderSection({ onToggleFavorite });

    await user.click(screen.getAllByRole("button", { name: "Add to Favorites" })[1]);
    expect(onToggleFavorite.mock.calls[0].arguments[0].idGame).toBe(2);
    expect(onToggleFavorite.mock.calls[0].arguments[1]).toBe(true);
  });

  it("disables only the hearts that are pending", () => {
    renderSection({ pendingFavorites: new Set([2]) });

    const hearts = screen.getAllByRole("button", { name: "Add to Favorites" });
    expect(hearts[0]).not.toHaveAttribute("aria-disabled", "true");
    expect(hearts[1]).toHaveAttribute("aria-disabled", "true");
    expect(hearts[2]).not.toHaveAttribute("aria-disabled", "true");
  });
});
