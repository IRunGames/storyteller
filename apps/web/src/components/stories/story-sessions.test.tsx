import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { SESSIONS_PAGE_SIZE, type StorySession } from "@/lib/stories";

function sessions(count: number, from = 1): StorySession[] {
  return Array.from({ length: count }, (_, i) => ({
    idStorySession: from + i,
    number: from + i,
    title: `Session ${from + i} title`,
    status: "done",
    startedAt: new Date(`2026-03-${String(20 - i).padStart(2, "0")}T19:00:00Z`),
    length: 90 + i * 30,
  }));
}

// The component imports its server action itself, so the module is mocked
// before the dynamic import below loads it.
const sa_listStorySessions = mock.fn<(idStory: number, offset: number) => Promise<StorySession[]>>(
  async () => [],
);

let StorySessions: typeof import("./story-sessions").StorySessions;

describe("StorySessions", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_listStorySessions, sa_getStorySession: async () => null },
    });
    ({ StorySessions } = await import("./story-sessions"));
  });

  beforeEach(() => {
    sa_listStorySessions.mock.resetCalls();
    sa_listStorySessions.mock.mockImplementation(async () => []);
  });

  it("lists each session's date and length in hours", () => {
    renderWithProviders(<StorySessions idStory={7} initial={sessions(2)} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Mar 20, 2026")).toBeInTheDocument();
    expect(within(items[0]).getByText("1.5 hours")).toBeInTheDocument();
    expect(within(items[1]).getByText("Mar 19, 2026")).toBeInTheDocument();
    expect(within(items[1]).getByText("2 hours")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("adds the player count to each row when given one", () => {
    const { unmount } = renderWithProviders(
      <StorySessions idStory={7} initial={sessions(2)} playerCount={3} />,
    );

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("3 players")).toBeInTheDocument();
    expect(within(items[1]).getByText("3 players")).toBeInTheDocument();
    unmount();

    renderWithProviders(<StorySessions idStory={7} initial={sessions(1)} playerCount={1} />);
    expect(screen.getByText("1 player")).toBeInTheDocument();
  });

  it("keeps only the rows whose text matches the filter, and says so when none do", () => {
    const rows = [{ ...sessions(1)[0], status: "open" as const, length: null }, ...sessions(2, 2)];
    const { rerender } = renderWithProviders(
      <StorySessions idStory={7} initial={rows} playerCount={3} filter="progress" />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("In progress")).toBeInTheDocument();

    rerender(<StorySessions idStory={7} initial={rows} playerCount={3} filter="2 hours" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("2 hours")).toBeInTheDocument();

    rerender(<StorySessions idStory={7} initial={rows} playerCount={3} filter="3 players" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    rerender(<StorySessions idStory={7} initial={rows} playerCount={3} filter="nothing" />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("keeps the More button while a filter hides every loaded row", () => {
    renderWithProviders(
      <StorySessions idStory={7} initial={sessions(SESSIONS_PAGE_SIZE)} filter="nothing" />,
    );

    expect(screen.getByText("No matches.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("leads each row with its number and title only when asked, and searches them then", () => {
    const { unmount } = renderWithProviders(<StorySessions idStory={7} initial={sessions(2)} />);
    expect(screen.queryByText("1. Session 1 title")).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<StorySessions idStory={7} initial={sessions(2)} showTitles />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("1. Session 1 title")).toBeInTheDocument();
    expect(within(items[1]).getByText("2. Session 2 title")).toBeInTheDocument();
  });

  it("falls back to the number alone for an untitled session", () => {
    renderWithProviders(
      <StorySessions idStory={7} initial={[{ ...sessions(1)[0], title: null }]} showTitles />,
    );
    expect(screen.getByText("Session 1")).toBeInTheDocument();
  });

  it("matches the filter against the title only while it is shown", () => {
    const { rerender } = renderWithProviders(
      <StorySessions idStory={7} initial={sessions(2)} filter="2 title" />,
    );
    expect(screen.getByText("No matches.")).toBeInTheDocument();

    rerender(<StorySessions idStory={7} initial={sessions(2)} filter="2 title" showTitles />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("2. Session 2 title")).toBeInTheDocument();
  });

  it("shows the status instead of a length for a session that is not done", () => {
    renderWithProviders(
      <StorySessions
        idStory={7}
        initial={[
          { ...sessions(1)[0], status: "open", length: null },
          { ...sessions(1, 2)[0], status: "suspended", length: null },
          { ...sessions(1, 3)[0], status: "resumed", length: null },
        ]}
      />,
    );

    // A resumed session is being played just like an open one, so it reads
    // the same.
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("In progress")).toBeInTheDocument();
    expect(within(items[1]).getByText("Suspended")).toBeInTheDocument();
    expect(within(items[2]).getByText("In progress")).toBeInTheDocument();
    expect(screen.queryByText(/hour/)).not.toBeInTheDocument();
  });

  it("says so when there are no sessions yet", () => {
    renderWithProviders(<StorySessions idStory={7} initial={[]} />);

    expect(screen.getByText("No sessions yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("loads the next five after a full page, until a short page comes back", async () => {
    const user = userEvent.setup();
    sa_listStorySessions.mock.mockImplementation(async (_idStory, offset) =>
      offset === SESSIONS_PAGE_SIZE ? sessions(2, SESSIONS_PAGE_SIZE + 1) : [],
    );
    renderWithProviders(<StorySessions idStory={7} initial={sessions(SESSIONS_PAGE_SIZE)} />);

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() => expect(sa_listStorySessions.mock.callCount()).toBe(1));
    expect(sa_listStorySessions.mock.calls[0].arguments).toEqual([7, SESSIONS_PAGE_SIZE]);
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(SESSIONS_PAGE_SIZE + 2),
    );
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("keeps the More button when a full page comes back", async () => {
    const user = userEvent.setup();
    sa_listStorySessions.mock.mockImplementation(async (_idStory, offset) =>
      sessions(SESSIONS_PAGE_SIZE, offset + 1),
    );
    renderWithProviders(<StorySessions idStory={7} initial={sessions(SESSIONS_PAGE_SIZE)} />);

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(SESSIONS_PAGE_SIZE * 2),
    );
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More" }));
    await waitFor(() => expect(sa_listStorySessions.mock.callCount()).toBe(2));
    expect(sa_listStorySessions.mock.calls[1].arguments).toEqual([7, SESSIONS_PAGE_SIZE * 2]);
  });

  it("leaves the list and the button alone when loading more fails", async () => {
    const user = userEvent.setup();
    sa_listStorySessions.mock.mockImplementation(async () => {
      throw new Error("offline");
    });
    renderWithProviders(<StorySessions idStory={7} initial={sessions(SESSIONS_PAGE_SIZE)} />);

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() => expect(sa_listStorySessions.mock.callCount()).toBe(1));
    expect(screen.getAllByRole("listitem")).toHaveLength(SESSIONS_PAGE_SIZE);
    await waitFor(() => expect(screen.getByRole("button", { name: "More" })).toBeEnabled());
  });
});
