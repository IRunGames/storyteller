import { before, beforeEach, describe, it, mock } from "node:test";
import { useEffect } from "react";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { ElementKind, StoryElement } from "@/lib/elements";
import { scenePreviewPath, type StoryScene } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import type { StoryCardData, StorySession } from "@/lib/stories";
import type { JsonValue } from "@/lib/user-preference-schemas";

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
  waitingCount: 0,
  presentCount: 0,
};

const sessions: StorySession[] = [
  {
    idStorySession: 3,
    number: 2,
    title: "Kildealg",
    status: "risen",
    startedAt: new Date("2026-03-20T19:00:00Z"),
    length: 150,
    // Not the story's three: the row counts who came to this session.
    playerCount: 4,
  },
  {
    idStorySession: 2,
    number: 1,
    title: null,
    status: "called",
    startedAt: new Date("2026-03-13T19:00:00Z"),
    length: null,
    playerCount: 2,
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
    length: 45,
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
    length: null,
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
    length: null,
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

// Made up like the other workflows, for the same reason.
const elementStatusOptions: StatusOption[] = [
  { key: "noted", label: "Noted", description: null, from: ["used", "shelved"] },
  { key: "used", label: "Used", description: null, from: ["noted", "shelved"] },
  { key: "shelved", label: "Shelved", description: null, from: ["noted", "used"] },
];

// Two people and a place; the other kinds have none.
const elements: Record<ElementKind, StoryElement[]> = {
  PERSON: [
    {
      idElement: 1,
      status: "noted",
      name: "Aldric",
      title: "Magistrate",
      description: "Keeps the keys.",
    },
    { idElement: 2, status: "used", name: "The stranger", title: null, description: null },
  ],
  PLACE: [{ idElement: 3, status: "noted", name: "The vault", title: null, description: null }],
  THING: [],
  OTHER: [],
  EPHEMERA: [],
};

// The element columns search the database too; this answers the way
// elements.search_text would, for the one kind each column asks about.
const listElements = mock.fn(
  async (
    _idStory: number,
    kind: ElementKind,
    offset: number,
    query: string,
    statuses?: string[],
  ) => {
    if (offset > 0) return [];
    const needle = query.trim().toLowerCase();
    return elements[kind].filter(
      (element) =>
        (statuses === undefined || statuses.includes(element.status)) &&
        `${element.status} ${element.name} ${element.title ?? ""} ${element.description ?? ""}`
          .toLowerCase()
          .includes(needle),
    );
  },
);

const COLUMNS = [
  "Timeline",
  "Scenes",
  "Attachments",
  "People",
  "Places",
  "Things",
  "Other",
  "Ephemera",
];

// The board refreshes the page's counts once its dialog has created something.
const router = { push: mock.fn<(href: string) => void>(), refresh: mock.fn() };

const createScene = mock.fn(async () => ({ ok: true as const }));
const createElement = mock.fn(async () => ({ ok: true as const }));
// The Timeline's +: the session as the action makes it, titled as asked.
const createSession = mock.fn(async (_idStory: number, title: string) => ({
  ok: true as const,
  session: {
    idStorySession: 9,
    number: 3,
    title,
    // One of this workflow's, so the column's status pills let it through.
    status: firstSession.key,
    startedAt: new Date("2026-10-22T19:00:00Z"),
    length: null,
    playerCount: 0,
  },
}));

// The board keeps its columns in the storyteller's preferences; the action
// behind them is mocked, and each test hands the provider the map it starts
// from.
const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));
const PREFERENCE_KEY = `prep.board.${story.idStory}`;

let PrepBoard: typeof import("./prep-board").PrepBoard;
let UserPreferencesProvider: typeof import("@/components/preferences/user-preferences-provider").UserPreferencesProvider;

const column = (name: string) => screen.getByRole("region", { name });

// A scene card carries a status pill of its own, so a filter pill is looked
// up inside the group above the search box rather than anywhere in the column.
const filterPill = (title: string, label: string) =>
  within(within(column(title)).getByRole("group", { name: `Filter ${title} by status` })).getByRole(
    "button",
    { name: label },
  );

function renderBoard(preferences: Record<string, JsonValue> = {}) {
  return renderWithProviders(
    <UserPreferencesProvider preferences={preferences}>
      <PrepBoard
        story={story}
        sessions={sessions}
        scenes={scenes}
        elements={elements}
        counts={{
          Timeline: 88,
          Scenes: 12,
          People: 2,
          Places: 1,
          Things: 0,
          Other: 0,
          Ephemera: 0,
        }}
        sessionStatusOptions={sessionStatusOptions}
        sceneStatusOptions={sceneStatusOptions}
        elementStatusOptions={elementStatusOptions}
      />
    </UserPreferencesProvider>,
  );
}

// The board waits for a pause before saving, so a save is waited for rather
// than expected at once.
const lastSaved = async () => {
  await waitFor(() => expect(sa_setUserPreference.mock.callCount()).toBeGreaterThan(0), {
    timeout: 2000,
  });
  return sa_setUserPreference.mock.calls.at(-1)!.arguments[0];
};

describe("PrepBoard", () => {
  before(async () => {
    mock.module("next/navigation", { namedExports: { useRouter: () => router } });
    // The Timeline's list imports its server action itself; mocked so the
    // board renders without a database.
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: {
        sa_listStorySessions: async () => [],
        sa_getStorySession: async () => null,
        sa_createStorySession: createSession,
        sa_getSessionForEdit: async () => null,
      },
    });
    // The Attachments column loads and searches the story's attachments
    // itself and has a test file of its own; here it only has to show the
    // story it was pointed at and what its search box holds.
    mock.module("./prep-attachments", {
      namedExports: {
        PrepAttachments: function PrepAttachments({
          idStory,
          filter,
          showCovers,
          showAdd,
          onCountChange,
        }: {
          idStory: number;
          filter: string;
          showCovers: boolean;
          showAdd: boolean;
          onCountChange?: (count: number) => void;
        }) {
          // Reports a count once mounted, as the real field does once its
          // rows have loaded.
          useEffect(() => onCountChange?.(4), [onCountChange]);
          return (
            <p>
              Attachments of {idStory} matching &quot;{filter}&quot;
              {showCovers ? ", covers shown" : ", covers hidden"}
              {showAdd ? ", adding" : ""}
            </p>
          );
        },
      },
    });
    // The Scenes column searches the database rather than filtering the rows
    // in hand, so its action answers here the way story_scenes.search_text
    // would: a substring of the title, the description or the status.
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: {
        sa_listStoryScenes: listScenes,
        sa_countStoryScenes: async () => scenes.length,
        sa_listStoryElements: listElements,
        sa_getStoryScene: async () => null,
        // What the board's create dialog and its forms ask for.
        sa_listSceneSessionOptions: async () => [{ idStorySession: 3, label: "2. Kildealg" }],
        sa_createStoryScene: createScene,
        sa_updateStoryScene: async () => ({ ok: false, errors: {} }),
        sa_createElement: createElement,
        sa_updateElement: async () => ({ ok: false, errors: {} }),
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
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference },
    });
    ({ PrepBoard } = await import("./prep-board"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    listScenes.mock.resetCalls();
    listElements.mock.resetCalls();
    router.push.mock.resetCalls();
    router.refresh.mock.resetCalls();
    createScene.mock.resetCalls();
    createElement.mock.resetCalls();
    sa_setUserPreference.mock.resetCalls();
  });

  it("names the page after the story in one line, with the title linking back to it", () => {
    renderBoard();

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Library (Game Prep) for Vampire",
    });
    expect(within(heading).getByRole("link", { name: "Vampire" })).toHaveAttribute(
      "href",
      "/stories/-15",
    );
  });

  it("shows the columns in order, one per kind of element after Attachments, each with a button to add one of its kind", () => {
    renderBoard();

    const regions = screen.getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("data-column"))).toEqual(COLUMNS);
    for (const [title, singular] of [
      ["Timeline", "session"],
      ["Scenes", "scene"],
      ["Attachments", "attachment"],
      ["People", "person"],
      ["Places", "place"],
      ["Things", "thing"],
      ["Other", "element"],
      ["Ephemera", "ephemera"],
    ]) {
      expect(
        within(column(title)).getByRole("button", { name: `New ${singular}` }),
      ).toBeInTheDocument();
    }
  });

  it("makes a session from the Timeline's +, titled with the day, at the top with its panel open", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(within(column("Timeline")).getByRole("button", { name: "New session" }));

    await waitFor(() => expect(createSession.mock.callCount()).toBe(1));
    const [idStory, title] = createSession.mock.calls[0].arguments;
    expect(idStory).toBe(story.idStory);
    // The Play button's default: the storyteller's own day.
    expect(title).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4} session$/);
    const items = within(column("Timeline")).getAllByRole("listitem");
    expect(within(items[0]).getByText(`3. ${title}`)).toBeInTheDocument();
    expect(within(items[0]).getByRole("button", { name: `Edit 3. ${title}` })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("lists the sessions in the Timeline with date, player count and length", () => {
    renderBoard();

    const items = within(column("Timeline")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Mar 20, 2026")).toBeInTheDocument();
    // A person and a number, as the story card shows it: the digit is what is
    // seen, and "4 players" is the name it carries for anyone who cannot. The
    // session's own count, as its info panel lists them, not the story's.
    const players = within(items[0]).getByLabelText("4 players");
    expect(players).toHaveTextContent("4");
    expect(within(players).getByText("4 players")).toBeInTheDocument();
    expect(within(items[0]).getByText("2.5 hours")).toBeInTheDocument();
    // A session with no length yet says its status instead. The last status
    // of this workflow has nothing leading out of it, so its pill opens a
    // note saying so rather than a menu; the first has moves, so it is a menu.
    expect(within(items[0]).getByRole("button", { name: lastSession.label })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    expect(within(items[1]).queryByText(/hours?$/)).not.toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: firstSession.label })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
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
    await user.click(
      within(column("Attachments")).getByRole("button", { name: "Expand Attachments" }),
    );
    expect(column("Attachments")).toHaveAttribute("data-mode", "expanded");
    expect(column("Scenes")).toHaveAttribute("data-mode", "normal");

    await user.click(
      within(column("Attachments")).getByRole("button", { name: "Shrink Attachments" }),
    );
    expect(column("Attachments")).toHaveAttribute("data-mode", "normal");
  });

  it("hides a normal column behind a button above the columns, which brings it back", async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(screen.queryByRole("button", { name: "Show People" })).not.toBeInTheDocument();

    await user.click(within(column("People")).getByRole("button", { name: "Hide People" }));
    expect(screen.queryByRole("region", { name: "People" })).not.toBeInTheDocument();
    const regions = screen.getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("data-column"))).toEqual(
      COLUMNS.filter((title) => title !== "People"),
    );

    const show = screen.getByRole("button", { name: "Show People" });
    // Above the columns: the button comes before the first region in document order.
    expect(
      show.compareDocumentPosition(regions[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // On the heading's own row, after the title.
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.parentElement).toContainElement(show);
    expect(heading.compareDocumentPosition(show) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(show);
    expect(column("People")).toHaveAttribute("data-mode", "normal");
    expect(screen.queryByRole("button", { name: "Show People" })).not.toBeInTheDocument();
  });

  it("shows how many rows each column holds, Attachments as its column reports it", async () => {
    renderBoard();

    expect(within(column("Timeline")).getByText("(88)")).toBeInTheDocument();
    expect(within(column("Scenes")).getByText("(12)")).toBeInTheDocument();
    expect(within(column("People")).getByText("(2)")).toBeInTheDocument();
    expect(within(column("Places")).getByText("(1)")).toBeInTheDocument();
    expect(await within(column("Attachments")).findByText("(4)")).toBeInTheDocument();
  });

  it("lists each kind of element in its own column, with its status, and says so when a kind has none", () => {
    renderBoard();

    const people = within(column("People")).getAllByRole("listitem");
    expect(people).toHaveLength(2);
    expect(within(people[0]).getByText("Aldric")).toBeInTheDocument();
    expect(within(people[0]).getByText("Magistrate")).toBeInTheDocument();
    expect(within(people[0]).getByText("Keeps the keys.")).toBeInTheDocument();
    expect(within(people[1]).getByRole("button", { name: /Used/ })).toBeInTheDocument();

    expect(within(column("Places")).getByText("The vault")).toBeInTheDocument();
    expect(within(column("Things")).getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("searches one kind's elements in the database, for that kind alone", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.type(
      within(column("People")).getByRole("searchbox", { name: "Search People" }),
      "keys",
    );

    await waitFor(() => {
      expect(within(column("People")).getAllByRole("listitem")).toHaveLength(1);
    });
    expect(within(column("People")).getByText("Aldric")).toBeInTheDocument();
    expect(listElements.mock.calls.every((call) => call.arguments[1] === "PERSON")).toBe(true);
    // The Places column was not asked again and still holds its row.
    expect(within(column("Places")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("puts the story's attachments after Scenes, with the column's search box handed down", async () => {
    const user = userEvent.setup();
    renderBoard();

    const attachments = column("Attachments");
    expect(
      within(attachments).getByText(`Attachments of ${story.idStory} matching "", covers shown`),
    ).toBeInTheDocument();
    await user.type(
      within(attachments).getByRole("searchbox", { name: "Search Attachments" }),
      "map",
    );
    expect(
      within(attachments).getByText(`Attachments of ${story.idStory} matching "map", covers shown`),
    ).toBeInTheDocument();
  });

  it("puts a Covers pill over the Attachments search box, like the other columns' filters", async () => {
    const user = userEvent.setup();
    renderBoard();

    const group = within(column("Attachments")).getByRole("group", { name: "Filter Attachments" });
    const covers = within(group).getByRole("button", { name: "Covers" });
    expect(covers).toHaveAttribute("aria-pressed", "true");
    // Above the search box, as the status pills are.
    expect(
      covers.compareDocumentPosition(
        within(column("Attachments")).getByRole("searchbox", { name: "Search Attachments" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(covers);
    expect(covers).toHaveAttribute("aria-pressed", "false");
    expect(within(column("Attachments")).getByText(/covers hidden/)).toBeInTheDocument();
  });

  it("says over each filter pill whether its rows are being included or excluded", async () => {
    const user = userEvent.setup();
    renderBoard();

    const drafted = filterPill("Scenes", "Drafted");
    await user.hover(drafted);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Including Drafted");

    await user.click(drafted);
    expect(drafted).toHaveAttribute("aria-pressed", "false");
    await user.unhover(drafted);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await user.hover(drafted);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Excluding Drafted");
  });

  it("opens the attachment adder in the column with its +, and closes it again", async () => {
    const user = userEvent.setup();
    renderBoard();

    const plus = within(column("Attachments")).getByRole("button", { name: "New attachment" });
    expect(plus).toHaveAttribute("aria-expanded", "false");
    expect(within(column("Attachments")).queryByText(/adding/)).not.toBeInTheDocument();

    await user.click(plus);
    expect(plus).toHaveAttribute("aria-expanded", "true");
    expect(within(column("Attachments")).getByText(/, adding/)).toBeInTheDocument();
    // Its place is above the filters, under the + that opened it.
    const slot = within(column("Attachments")).getByTestId("attachment-adder");
    expect(
      slot.compareDocumentPosition(
        within(column("Attachments")).getByRole("group", { name: "Filter Attachments" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(plus);
    expect(plus).toHaveAttribute("aria-expanded", "false");
    expect(within(column("Attachments")).queryByTestId("attachment-adder")).not.toBeInTheDocument();
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
    const info = within(items[0]).getByRole("button", { name: "Scene info" });
    expect(info.querySelector(".lucide-info")).toBeInTheDocument();
    // The preview opens in a tab of its own, so the board stays put.
    const preview = within(items[0]).getByRole("link", { name: "Preview in a new tab" });
    expect(preview).toHaveAttribute("href", scenePreviewPath(scenes[0].idStoryScene));
    expect(preview).toHaveAttribute("target", "_blank");
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
    expect(within(column("People")).getAllByRole("listitem")).toHaveLength(2);

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
    const allButFirst = (count: number) => ["false", ...Array(count - 1).fill("true")];
    expect(bordered()).toEqual(allButFirst(COLUMNS.length));

    await user.click(within(column("Timeline")).getByRole("button", { name: "Hide Timeline" }));
    expect(bordered()).toEqual(allButFirst(COLUMNS.length - 1));
  });

  it("puts a pill for every status above the search box, all on, in every column with a workflow", () => {
    renderBoard();

    for (const [title, workflow] of [
      ["Timeline", sessionStatusOptions],
      ["Scenes", sceneStatusOptions],
      ["People", elementStatusOptions],
      ["Ephemera", elementStatusOptions],
    ] as const) {
      const group = within(column(title)).getByRole("group", {
        name: `Filter ${title} by status`,
      });
      const pills = within(group).getAllByRole("button");
      expect(pills.map((pill) => pill.textContent)).toEqual(workflow.map((option) => option.label));
      // Everything is shown until something is switched off.
      for (const pill of pills) expect(pill).toHaveAttribute("aria-pressed", "true");
    }
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

  it("writes a new scene in a dialog from the Scenes column's +, then has the column ask again", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(within(column("Scenes")).getByRole("button", { name: "New scene" }));
    const dialog = await screen.findByRole("dialog", { name: "New scene" });
    // The sittings are fetched as it opens, for the form's select.
    await within(dialog).findByRole("option", { name: "2. Kildealg" });
    expect(router.push.mock.callCount()).toBe(0);

    const before = listScenes.mock.callCount();
    await user.type(within(dialog).getByRole("textbox", { name: /Title/ }), "The ford");
    await user.click(within(dialog).getByRole("button", { name: "Create scene" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New scene" })).not.toBeInTheDocument(),
    );
    expect(createScene.mock.callCount()).toBe(1);
    expect(router.refresh.mock.callCount()).toBe(1);
    await waitFor(() => expect(listScenes.mock.callCount()).toBeGreaterThan(before));
  });

  it("starts a new element as the kind of the column whose + opened it", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(within(column("Places")).getByRole("button", { name: "New place" }));
    const dialog = await screen.findByRole("dialog", { name: "New place" });
    expect(within(dialog).getByRole("combobox", { name: /Kind/ })).toHaveValue("PLACE");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New place" })).not.toBeInTheDocument(),
    );
    expect(createElement.mock.callCount()).toBe(0);
  });

  it("has the column of the kind chosen ask again once an element is created", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(within(column("People")).getByRole("button", { name: "New person" }));
    const dialog = await screen.findByRole("dialog", { name: "New person" });
    // Changed on the way: it is the Things column that has a new row.
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Kind/ }), "Thing");
    await user.type(within(dialog).getByRole("textbox", { name: /^Name/ }), "The silver blade");
    await user.click(within(dialog).getByRole("button", { name: "Create element" }));

    await waitFor(() => expect(createElement.mock.callCount()).toBe(1));
    await waitFor(() =>
      expect(listElements.mock.calls.some((call) => call.arguments[1] === "THING")).toBe(true),
    );
    expect(listElements.mock.calls.some((call) => call.arguments[1] === "PERSON")).toBe(false);
  });

  it("offers an edit on every element card", () => {
    renderBoard();
    const [first] = within(column("People")).getAllByRole("listitem");
    expect(within(first).getByRole("link", { name: "Edit element" })).toHaveAttribute(
      "href",
      "/elements/1/edit",
    );
  });

  it("offers an edit on every scene card but a completed one", () => {
    renderWithProviders(
      <UserPreferencesProvider preferences={{}}>
        <PrepBoard
          story={story}
          sessions={sessions}
          scenes={[scenes[0], { ...scenes[1], status: "COMPLETE" }]}
          elements={elements}
          counts={{}}
          sessionStatusOptions={sessionStatusOptions}
          sceneStatusOptions={sceneStatusOptions}
          elementStatusOptions={elementStatusOptions}
        />
      </UserPreferencesProvider>,
    );

    const [open, done] = within(column("Scenes")).getAllByRole("listitem");
    const edit = within(open).getByRole("link", { name: "Edit scene" });
    // The live-edit page, rather than the form.
    expect(edit).toHaveAttribute("href", `/scenes/${scenes[0].idStoryScene}/live`);
    // In a tab of its own, so the board stays where it was.
    expect(edit).toHaveAttribute("target", "_blank");
    expect(within(done).queryByRole("link", { name: "Edit scene" })).not.toBeInTheDocument();
  });

  it("offers an expanded column both Shrink and Hide, and Hide folds it straight into a button", async () => {
    const user = userEvent.setup();
    renderBoard();

    // At its usual width a column has no shrink, only hide.
    expect(
      within(column("Scenes")).queryByRole("button", { name: "Shrink Scenes" }),
    ).not.toBeInTheDocument();

    await user.click(within(column("Scenes")).getByRole("button", { name: "Expand Scenes" }));
    const shrink = within(column("Scenes")).getByRole("button", { name: "Shrink Scenes" });
    // Expand's arrows turned inward.
    expect(shrink.querySelector(".lucide-minimize-2")).toBeInTheDocument();
    const hide = within(column("Scenes")).getByRole("button", { name: "Hide Scenes" });
    expect(hide.querySelector(".lucide-minimize")).toBeInTheDocument();

    await user.click(hide);
    expect(screen.queryByRole("region", { name: "Scenes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Scenes" }));
    // Brought back at its usual width, not expanded.
    expect(column("Scenes")).toHaveAttribute("data-mode", "normal");
  });

  it("saves which columns are hidden or expanded, for this story", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(within(column("People")).getByRole("button", { name: "Hide People" }));
    await user.click(within(column("Scenes")).getByRole("button", { name: "Expand Scenes" }));

    expect(await lastSaved()).toEqual({
      key: PREFERENCE_KEY,
      value: { modes: { Scenes: "expanded", People: "hidden" }, filters: {} },
    });
  });

  it("saves what is typed into a search box once the typing stops, not once per key", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.type(
      within(column("Timeline")).getByRole("searchbox", { name: "Search Timeline" }),
      "kild",
    );

    expect(await lastSaved()).toEqual({
      key: PREFERENCE_KEY,
      value: { modes: {}, filters: { Timeline: { query: "kild", off: [] } } },
    });
    expect(sa_setUserPreference.mock.callCount()).toBe(1);
  });

  it("saves the statuses switched off in a column", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(filterPill("Scenes", lastScene.label));

    expect(await lastSaved()).toEqual({
      key: PREFERENCE_KEY,
      value: { modes: {}, filters: { Scenes: { query: "", off: [lastScene.key] } } },
    });
  });

  it("asks again once a restored filter is changed, including back to everything", async () => {
    const user = userEvent.setup();
    renderBoard({
      [PREFERENCE_KEY]: { modes: {}, filters: { Scenes: { query: "", off: [firstScene.key] } } },
    });

    await user.click(filterPill("Scenes", firstScene.label));
    await waitFor(() =>
      expect(listScenes.mock.calls.at(-1)?.arguments[3]).toEqual(
        sceneStatusOptions.map((option) => option.key),
      ),
    );
  });

  it("opens as it was left: columns, search boxes and pills", async () => {
    renderBoard({
      [PREFERENCE_KEY]: {
        modes: { Places: "expanded", People: "hidden" },
        filters: {
          Timeline: { query: "kild", off: [] },
          Scenes: { query: "", off: [firstScene.key] },
        },
      },
    });

    expect(screen.queryByRole("region", { name: "People" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show People" })).toBeInTheDocument();
    expect(column("Places")).toHaveAttribute("data-mode", "expanded");
    expect(
      within(column("Timeline")).getByRole("searchbox", { name: "Search Timeline" }),
    ).toHaveValue("kild");
    expect(filterPill("Scenes", firstScene.label)).toHaveAttribute("aria-pressed", "false");
    expect(filterPill("Scenes", lastScene.label)).toHaveAttribute("aria-pressed", "true");
    // The page loaded each column's first page already narrowed to the
    // stored filter, so no column asks the database again on opening, and
    // opening the board is not a change, so nothing is saved either.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(listScenes.mock.callCount()).toBe(0);
    expect(listElements.mock.callCount()).toBe(0);
    expect(sa_setUserPreference.mock.callCount()).toBe(0);
  });
});
