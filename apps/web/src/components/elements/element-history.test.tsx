import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { ElementHistoryPage } from "./actions";

const row = (n: number) => ({
  idStoryScene: n,
  title: `Scene ${n}`,
  status: "COMPLETE",
  sessionHeading: `1. Kildealg`,
  at: `2026-10-${String(20 - n).padStart(2, "0")}T12:00:00.000Z`,
});
const pages: ElementHistoryPage[] = [
  { rows: [1, 2, 3, 4, 5].map(row), hasMore: true },
  { rows: [6, 7].map(row), hasMore: false },
];
const sa_listElementHistory = mock.fn(
  async (
    _story: number,
    _element: number,
    _except: number | null,
    offset: number,
  ): Promise<ElementHistoryPage | null> => pages[offset / 5] ?? { rows: [], hasMore: false },
);

let ElementHistory: typeof import("./element-history").ElementHistory;

describe("ElementHistory", () => {
  before(async () => {
    mock.module("./actions", { namedExports: { sa_listElementHistory } });
    ({ ElementHistory } = await import("./element-history"));
  });

  beforeEach(() => {
    sa_listElementHistory.mock.resetCalls();
    sa_listElementHistory.mock.mockImplementation(
      async (_s, _e, _x, offset) => pages[offset / 5] ?? { rows: [], hasMore: false },
    );
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("opens from its chevron to the scenes the element was in, five at a time, and loads more", async () => {
    const u = userEvent.setup();
    renderWithProviders(<ElementHistory idStory={7} idElement={5} idStoryScene={3} />);

    // Closed to start: the heading and its chevron, nothing asked for yet.
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    const chevron = screen.getByRole("button", { name: "History" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(sa_listElementHistory.mock.callCount()).toBe(0);

    await u.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    const list = await screen.findByRole("list", { name: "History" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("Scene 1"),
      expect.stringContaining("Scene 2"),
      expect.stringContaining("Scene 3"),
      expect.stringContaining("Scene 4"),
      expect.stringContaining("Scene 5"),
    ]);
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("1. Kildealg");
    expect(sa_listElementHistory.mock.calls[0].arguments).toEqual([7, 5, 3, 0]);

    await u.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(7));
    expect(sa_listElementHistory.mock.calls[1].arguments).toEqual([7, 5, 3, 5]);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

    // Closed again, and open again from what it had.
    await u.click(chevron);
    expect(screen.queryByRole("list", { name: "History" })).toBeNull();
    await u.click(chevron);
    expect(
      within(await screen.findByRole("list", { name: "History" })).getAllByRole("listitem"),
    ).toHaveLength(7);
    expect(sa_listElementHistory.mock.callCount()).toBe(2);
  });

  it("says when the element has been in no other scene", async () => {
    sa_listElementHistory.mock.mockImplementation(async () => ({ rows: [], hasMore: false }));
    const u = userEvent.setup();
    renderWithProviders(<ElementHistory idStory={7} idElement={5} idStoryScene={3} />);

    await u.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText("Not in any other scene yet.")).toBeInTheDocument();
  });
});
