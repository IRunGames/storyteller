import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StoryCardData, StorySession } from "@/lib/stories";

const story: StoryCardData = {
  idStory: -15,
  title: "Vampire",
  summary: null,
  imageUrl: null,
  lastPlayed: new Date("2015-06-25T12:00:00Z"),
  systemName: null,
  systemVersion: null,
  variant: null,
  isFavorite: false,
  isOwner: true,
  isActive: true,
  storytellerName: null,
  hasOpenSession: false,
  playerCount: 3,
};

const sessions: StorySession[] = [
  {
    idStorySession: 3,
    number: 2,
    title: "Kildealg",
    status: "done",
    startedAt: new Date("2026-03-20T19:00:00Z"),
    length: 150,
  },
  {
    idStorySession: 2,
    number: 1,
    title: null,
    status: "open",
    startedAt: new Date("2026-03-13T19:00:00Z"),
    length: null,
  },
];

const COLUMNS = ["Timeline", "Scenes", "Characters", "Enemies", "Resources"];

let PrepBoard: typeof import("./prep-board").PrepBoard;

const column = (name: string) => screen.getByRole("region", { name });

function renderBoard() {
  return renderWithProviders(<PrepBoard story={story} sessions={sessions} />);
}

describe("PrepBoard", () => {
  before(async () => {
    // The Timeline's list imports its server action itself; mocked so the
    // board renders without a database.
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_listStorySessions: async () => [], sa_getStorySession: async () => null },
    });
    ({ PrepBoard } = await import("./prep-board"));
  });

  it("names the page after the story in one line, with the title linking back to it", () => {
    renderBoard();

    const heading = screen.getByRole("heading", { level: 1, name: "Preparing Vampire" });
    expect(within(heading).getByRole("link", { name: "Vampire" })).toHaveAttribute(
      "href",
      "/stories/-15",
    );
  });

  it("shows the five columns in order, with a button to add one of its kind on all but the Timeline", () => {
    renderBoard();

    const regions = screen.getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("data-column"))).toEqual(COLUMNS);
    // A session begins at the table, through Play now, so the Timeline
    // has nothing to add from here.
    expect(
      within(column("Timeline")).queryByRole("button", { name: "New session" }),
    ).not.toBeInTheDocument();
    for (const [title, singular] of [
      ["Scenes", "scene"],
      ["Characters", "character"],
      ["Enemies", "enemy"],
      ["Resources", "resource"],
    ]) {
      expect(
        within(column(title)).getByRole("button", { name: `New ${singular}` }),
      ).toBeInTheDocument();
    }
  });

  it("lists the sessions in the Timeline with date, player count and length", () => {
    renderBoard();

    const items = within(column("Timeline")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Mar 20, 2026")).toBeInTheDocument();
    expect(within(items[0]).getByText("3 players")).toBeInTheDocument();
    expect(within(items[0]).getByText("2.5 hours")).toBeInTheDocument();
    expect(within(items[1]).getByText("In progress")).toBeInTheDocument();
  });

  it("leads each Timeline row with its number and title, and offers only to hide the column", () => {
    renderBoard();

    const items = within(column("Timeline")).getAllByRole("listitem");
    expect(within(items[0]).getByText("2. Kildealg")).toBeInTheDocument();
    expect(within(items[1]).getByText("Session 1")).toBeInTheDocument();

    // The Timeline is already wide enough for its rows, so there is no
    // expand button, and the other columns keep theirs.
    expect(
      within(column("Timeline")).queryByRole("button", { name: "Expand Timeline" }),
    ).not.toBeInTheDocument();
    expect(
      within(column("Timeline")).getByRole("button", { name: "Hide Timeline" }),
    ).toBeInTheDocument();
    expect(
      within(column("Scenes")).getByRole("button", { name: "Expand Scenes" }),
    ).toBeInTheDocument();
  });

  it("expands one column at a time to two thirds of the width, and shrinks it back", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(within(column("Scenes")).getByRole("button", { name: "Expand Scenes" }));
    expect(column("Scenes")).toHaveAttribute("data-mode", "expanded");
    // An expanded column offers only the way back down.
    expect(
      within(column("Scenes")).queryByRole("button", { name: "Expand Scenes" }),
    ).not.toBeInTheDocument();

    // Two thirds each would not fit, so expanding another returns the first.
    await user.click(within(column("Enemies")).getByRole("button", { name: "Expand Enemies" }));
    expect(column("Enemies")).toHaveAttribute("data-mode", "expanded");
    expect(column("Scenes")).toHaveAttribute("data-mode", "normal");

    await user.click(within(column("Enemies")).getByRole("button", { name: "Shrink Enemies" }));
    expect(column("Enemies")).toHaveAttribute("data-mode", "normal");
  });

  it("hides a normal column behind a button above the columns, which brings it back", async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(screen.queryByRole("button", { name: "Show Characters" })).not.toBeInTheDocument();

    await user.click(within(column("Characters")).getByRole("button", { name: "Hide Characters" }));
    expect(screen.queryByRole("region", { name: "Characters" })).not.toBeInTheDocument();
    const regions = screen.getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("data-column"))).toEqual([
      "Timeline",
      "Scenes",
      "Enemies",
      "Resources",
    ]);

    const show = screen.getByRole("button", { name: "Show Characters" });
    // Above the columns: the button comes before the first region in document order.
    expect(
      show.compareDocumentPosition(regions[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(show);
    expect(column("Characters")).toHaveAttribute("data-mode", "normal");
    expect(screen.queryByRole("button", { name: "Show Characters" })).not.toBeInTheDocument();
  });

  it("filters a column's rows by its own search box, leaving the others alone", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.type(
      within(column("Scenes")).getByRole("searchbox", { name: "Search Scenes" }),
      "vau",
    );

    const scenes = within(column("Scenes")).getAllByRole("listitem");
    expect(scenes).toHaveLength(1);
    expect(within(scenes[0]).getByText("The vault")).toBeInTheDocument();
    expect(within(column("Characters")).getAllByRole("listitem")).toHaveLength(3);

    await user.type(
      within(column("Scenes")).getByRole("searchbox", { name: "Search Scenes" }),
      "x",
    );
    expect(within(column("Scenes")).queryByRole("list")).not.toBeInTheDocument();
    expect(within(column("Scenes")).getByText("No matches.")).toBeInTheDocument();
  });

  it("filters the Timeline by what its rows say", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.type(
      within(column("Timeline")).getByRole("searchbox", { name: "Search Timeline" }),
      "mar 13",
    );

    const items = within(column("Timeline")).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText("Mar 13, 2026")).toBeInTheDocument();
  });

  it("draws a boundary before every visible column but the first", async () => {
    const user = userEvent.setup();
    renderBoard();

    const bordered = () =>
      screen.getAllByRole("region").map((region) => region.getAttribute("data-bordered"));
    expect(bordered()).toEqual(["false", "true", "true", "true", "true"]);

    await user.click(within(column("Timeline")).getByRole("button", { name: "Hide Timeline" }));
    expect(bordered()).toEqual(["false", "true", "true", "true"]);
  });
});
