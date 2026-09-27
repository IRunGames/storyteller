import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StoryScene } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
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
    status: "risen",
    startedAt: new Date("2026-03-20T19:00:00Z"),
    length: 150,
  },
  {
    idStorySession: 2,
    number: 1,
    title: null,
    status: "called",
    startedAt: new Date("2026-03-13T19:00:00Z"),
    length: null,
  },
];

// The workflows the board is handed. They are made up rather than copied from
// seed_s_statuses.sql on purpose: the statuses live in the database and will
// change, and what is under test here is that a column shows the status it is
// given and offers the moves that workflow allows, whatever they are called.
// The one shape that matters is that the session workflow has a last status
// nothing leads out of, and the scene workflow does not.
const sceneStatusOptions: StatusOption[] = [
  { key: "drafted", label: "Drafted", description: null, from: ["running", "spent"] },
  { key: "running", label: "Running", description: null, from: ["drafted", "spent"] },
  { key: "spent", label: "Spent", description: null, from: ["drafted", "running"] },
];
const sessionStatusOptions: StatusOption[] = [
  { key: "called", label: "Called", description: null, from: [] },
  { key: "sitting", label: "Sitting", description: null, from: ["called"] },
  { key: "risen", label: "Risen", description: null, from: ["called", "sitting"] },
];
const [firstScene, , lastScene] = sceneStatusOptions;
const [firstSession, , lastSession] = sessionStatusOptions;

const scenes: StoryScene[] = [
  {
    idStoryScene: 5,
    idStorySession: 3,
    status: lastScene.key,
    statusAt: new Date("2026-03-20T19:30:00Z"),
    sceneNumber: 1,
    title: "The vault",
    description: "A door of old iron.",
    sessionNumber: 2,
    sessionHeading: "2. Kildealg",
  },
  {
    idStoryScene: 4,
    idStorySession: 3,
    status: "running",
    statusAt: new Date("2026-03-20T20:00:00Z"),
    // Still being played, so it has no number yet.
    sceneNumber: null,
    title: "The feast",
    description: null,
    sessionNumber: 2,
    sessionHeading: "2. Kildealg",
  },
  {
    idStoryScene: 3,
    idStorySession: null,
    status: firstScene.key,
    // Never stamped and never played: the card shows no date and no sitting.
    statusAt: null,
    sceneNumber: null,
    title: "The arrival",
    description: null,
    sessionNumber: null,
    sessionHeading: null,
  },
];

// The Scenes column searches the database rather than filtering the rows in
// hand, so this answers the way story_scenes.search_text and the status
// filter would: a substring of the title, the description or the status, and
// only the statuses still switched on.
const listScenes = mock.fn(
  async (_idStory: number, offset: number, query: string, statuses?: string[]) => {
    if (offset > 0) return [];
    const needle = query.trim().toLowerCase();
    return scenes.filter(
      (scene) =>
        (statuses === undefined || statuses.includes(scene.status)) &&
        `${scene.status} ${scene.title} ${scene.description ?? ""}`.toLowerCase().includes(needle),
    );
  },
);

const COLUMNS = ["Timeline", "Scenes", "Characters", "Enemies", "Resources"];

let PrepBoard: typeof import("./prep-board").PrepBoard;

const column = (name: string) => screen.getByRole("region", { name });

// A scene card carries a status pill of its own, so a filter pill is looked
// up inside the group above the search box rather than anywhere in the column.
const filterPill = (title: string, label: string) =>
  within(within(column(title)).getByRole("group", { name: `Filter ${title} by status` })).getByRole(
    "button",
    { name: label },
  );

function renderBoard() {
  return renderWithProviders(
    <PrepBoard
      story={story}
      sessions={sessions}
      scenes={scenes}
      counts={{ Timeline: 88, Scenes: 12 }}
      sessionStatusOptions={sessionStatusOptions}
      sceneStatusOptions={sceneStatusOptions}
    />,
  );
}

describe("PrepBoard", () => {
  before(async () => {
    // The Timeline's list imports its server action itself; mocked so the
    // board renders without a database.
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_listStorySessions: async () => [], sa_getStorySession: async () => null },
    });
    // The Scenes column searches the database rather than filtering the rows
    // in hand, so its action answers here the way story_scenes.search_text
    // would: a substring of the title, the description or the status.
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: {
        sa_listStoryScenes: listScenes,
        sa_countStoryScenes: async () => scenes.length,
        sa_getStoryScene: async () => null,
      },
    });
    mock.module("@/components/status/actions", {
      namedExports: {
        sa_listStatusOptions: async () => [],
        sa_setRowStatus: async (_table: string, _id: number, status: string) => ({
          ok: true,
          status,
        }),
      },
    });
    ({ PrepBoard } = await import("./prep-board"));
  });

  beforeEach(() => {
    listScenes.mock.resetCalls();
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
    // A person and a number, as the story card shows it: the digit is what is
    // seen, and "3 players" is the name it carries for anyone who cannot.
    const players = within(items[0]).getByLabelText("3 players");
    expect(players).toHaveTextContent("3");
    expect(within(players).getByText("3 players")).toBeInTheDocument();
    expect(within(items[0]).getByText("2.5 hours")).toBeInTheDocument();
    // A session with no length yet says its status instead. The last status
    // of this workflow has nothing leading out of it, so its pill is not a
    // menu; the first has moves, so it is.
    expect(within(items[0]).getByText(lastSession.label)).toBeInTheDocument();
    expect(
      within(items[0]).queryByRole("button", { name: lastSession.label }),
    ).not.toBeInTheDocument();
    expect(within(items[1]).queryByText(/hours?$/)).not.toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: firstSession.label })).toBeInTheDocument();
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

  it("shows how many rows a column holds, and nothing for the columns still on stand-ins", () => {
    renderBoard();

    expect(within(column("Timeline")).getByText("(88)")).toBeInTheDocument();
    expect(within(column("Scenes")).getByText("(12)")).toBeInTheDocument();
    for (const title of ["Characters", "Enemies", "Resources"]) {
      expect(within(column(title)).queryByText(/^\(\d+\)$/)).not.toBeInTheDocument();
    }
  });

  it("lists the story's scenes with their status", () => {
    renderBoard();

    const items = within(column("Scenes")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    // Finished, so the card leads with which scene of the sitting it was.
    expect(within(items[0]).getByText("1. The vault")).toBeInTheDocument();
    // Not finished, so no number before it.
    expect(within(items[1]).getByText("The feast")).toBeInTheDocument();
    expect(within(items[0]).getByText("A door of old iron.")).toBeInTheDocument();
    expect(within(items[0]).getByRole("button", { name: lastScene.label })).toBeInTheDocument();
    expect(within(items[2]).getByRole("button", { name: firstScene.label })).toBeInTheDocument();
  });

  it("names the sitting between the status and the date, with its full name behind it", async () => {
    const user = userEvent.setup();
    renderBoard();

    const items = within(column("Scenes")).getAllByRole("listitem");
    // "Session 2" on the card, with the sitting's full name behind it, so the
    // column stays narrow without losing which sitting it was.
    const session = within(items[0]).getByRole("button", { name: "Session 2" });
    expect(within(items[0]).queryByText("2. Kildealg")).not.toBeInTheDocument();

    await user.hover(session);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("2. Kildealg");

    // A scene that has not been played says nothing at all there.
    expect(within(items[2]).queryByRole("button", { name: /Session/ })).not.toBeInTheDocument();
  });

  it("searches scenes in the database, leaving the other columns to filter their own rows", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.type(
      within(column("Scenes")).getByRole("searchbox", { name: "Search Scenes" }),
      "vau",
    );

    // The search waits out the keystrokes before it asks, so the rows arrive
    // a beat later.
    await waitFor(() => {
      expect(within(column("Scenes")).getAllByRole("listitem")).toHaveLength(1);
    });
    expect(within(column("Scenes")).getByText("1. The vault")).toBeInTheDocument();
    expect(within(column("Characters")).getAllByRole("listitem")).toHaveLength(3);

    await user.type(
      within(column("Scenes")).getByRole("searchbox", { name: "Search Scenes" }),
      "x",
    );
    await waitFor(() => {
      expect(within(column("Scenes")).getByText("No matches.")).toBeInTheDocument();
    });
    expect(within(column("Scenes")).queryByRole("list")).not.toBeInTheDocument();
  });

  it("finds a scene by a word only its status carries", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.type(
      within(column("Scenes")).getByRole("searchbox", { name: "Search Scenes" }),
      firstScene.key,
    );

    await waitFor(() => {
      expect(within(column("Scenes")).getAllByRole("listitem")).toHaveLength(1);
    });
    expect(within(column("Scenes")).getByText("The arrival")).toBeInTheDocument();
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

  it("puts a pill for every status above the search box, all on, and none on a column with no workflow", () => {
    renderBoard();

    for (const [title, workflow] of [
      ["Timeline", sessionStatusOptions],
      ["Scenes", sceneStatusOptions],
    ] as const) {
      const group = within(column(title)).getByRole("group", {
        name: `Filter ${title} by status`,
      });
      const pills = within(group).getAllByRole("button");
      expect(pills.map((pill) => pill.textContent)).toEqual(workflow.map((option) => option.label));
      // Everything is shown until something is switched off.
      for (const pill of pills) expect(pill).toHaveAttribute("aria-pressed", "true");
    }

    // Characters and the rest have no statuses, so they have no pills.
    expect(
      within(column("Characters")).queryByRole("group", { name: /Filter/ }),
    ).not.toBeInTheDocument();
  });

  it("switching a status off takes its Timeline rows out, and switching it back brings them in", async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(within(column("Timeline")).getAllByRole("listitem")).toHaveLength(2);

    // The two sessions hold the workflow's first and last statuses.
    const pill = filterPill("Timeline", lastSession.label);
    await user.click(pill);

    expect(pill).toHaveAttribute("aria-pressed", "false");
    const rows = within(column("Timeline")).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Session 1")).toBeInTheDocument();

    await user.click(pill);
    expect(within(column("Timeline")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("asks the database again with the statuses still on when a Scenes pill is switched off", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(filterPill("Scenes", lastScene.label));

    await waitFor(() => {
      expect(listScenes.mock.callCount()).toBeGreaterThan(0);
    });
    const [, offset, query, statuses] = listScenes.mock.calls.at(-1)!.arguments;
    expect(offset).toBe(0);
    expect(query).toBe("");
    // The one switched off is gone; the others keep the workflow's order.
    expect(statuses).toEqual(
      sceneStatusOptions.filter((option) => option.key !== lastScene.key).map((o) => o.key),
    );

    await waitFor(() => {
      expect(within(column("Scenes")).queryByText("1. The vault")).not.toBeInTheDocument();
    });
  });

  it("says nothing matches when every status is switched off", async () => {
    const user = userEvent.setup();
    renderBoard();

    for (const option of sceneStatusOptions) {
      await user.click(filterPill("Scenes", option.label));
    }

    await waitFor(() => {
      expect(within(column("Scenes")).getByText("No matches.")).toBeInTheDocument();
    });
  });
});
