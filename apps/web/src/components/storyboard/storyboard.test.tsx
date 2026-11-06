import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { PlayScene } from "@/lib/play-scene";
import type {
  Storyboard as StoryboardData,
  StoryboardScenesPage,
  StoryboardSessionsPage,
} from "@/lib/storyboard";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -10,
  isAnonymous: false,
};

const docks: PlayScene = {
  idStorySession: null,
  scene: {
    idStoryScene: 3,
    title: "The docks",
    status: "COMPLETE",
    text: { description: "Fog on the water.", notes: null },
  },
  tags: ["scene", "elements"],
  coverUrl: "https://x.test/docks.png",
  items: [
    {
      element: {
        idElement: 5,
        idStory: 7,
        kind: "PERSON",
        status: "READY",
        initialName: "A hooded figure",
        name: "Zed",
        title: "Harbourmaster",
        description: "Keeps the docks.",
        notes: null,
        imageUrl: null,
        url: null,
        urlText: null,
        tags: [],
        pendingAt: null,
        readyAt: null,
        inactiveAt: null,
        createdAt: "2026-10-13T10:00:00.000Z",
        updatedAt: "2026-10-13T10:00:00.000Z",
      },
      sceneElement: {
        idSceneElement: 11,
        idStoryScene: 3,
        idElement: 5,
        status: "READY",
        tags: ["scene"],
        elementShowing: "initial_name",
        showInfo: true,
        url: null,
        urlText: null,
        readyAt: null,
        invisibleAt: null,
        tappedAt: null,
        disabledAt: null,
        createdAt: "2026-10-13T10:00:00.000Z",
        updatedAt: "2026-10-13T10:00:00.000Z",
      },
    },
  ],
};

const board: StoryboardData = {
  idStory: 7,
  title: "Psychoneira",
  imageUrl: "https://x.test/cover.jpg",
  isStoryteller: false,
  sessions: [
    {
      idStorySession: 21,
      number: 1,
      title: "Kildealg",
      status: "DONE",
      startedAt: new Date("2026-10-05T12:00:00Z"),
      summary: "The company reached the abbey.",
      notes: "Zed owes us a favour.",
      lingeringQuestions: null,
      scenes: [
        {
          idStoryScene: 2,
          title: "The abbey",
          description: null,
          notes: null,
          status: "COMPLETE",
          imageUrl: null,
          sceneNumber: 1,
          length: 45,
        },
        {
          idStoryScene: 3,
          title: "The docks",
          description: "Fog on the water.",
          notes: "Bring the lantern.",
          status: "COMPLETE",
          imageUrl: "https://x.test/docks.png",
          sceneNumber: 2,
          length: 90,
        },
      ],
    },
    {
      idStorySession: 22,
      number: 2,
      title: null,
      status: "DONE",
      startedAt: new Date("2026-10-12T12:00:00Z"),
      summary: null,
      notes: null,
      lingeringQuestions: null,
      scenes: [],
    },
  ],
  moreSessions: false,
  unplayed: [],
  moreUnplayed: false,
};

const tellersBoard: StoryboardData = {
  ...board,
  isStoryteller: true,
  sessions: [
    ...board.sessions,
    {
      idStorySession: 23,
      number: 3,
      title: "Lindisfarne",
      status: "OPEN",
      startedAt: new Date("2026-10-19T12:00:00Z"),
      summary: null,
      notes: null,
      lingeringQuestions: "Who lit the beacon?",
      scenes: [
        {
          idStoryScene: 4,
          title: "The ford",
          description: null,
          notes: null,
          status: "ACTIVE",
          imageUrl: null,
          sceneNumber: null,
          length: null,
        },
      ],
    },
  ],
  unplayed: [
    {
      idStoryScene: 5,
      title: "The crossing",
      description: "A toll bridge.",
      notes: null,
      status: "PENDING",
      imageUrl: null,
      sceneNumber: null,
      length: null,
    },
  ],
};

const statusOptions = [
  { key: "PENDING", label: "Pending", description: null, from: null },
  { key: "ACTIVE", label: "Active", description: null, from: null },
  { key: "COMPLETE", label: "Complete", description: null, from: null },
];

const sa_getStoryboardScene = mock.fn(
  async (_idStoryScene: number): Promise<PlayScene | null> => docks,
);
const sa_getStoryboardSessions = mock.fn(async (): Promise<StoryboardSessionsPage | null> => ({
  sessions: [],
  more: false,
}));
const sa_getStoryboardUnplayed = mock.fn(async (): Promise<StoryboardScenesPage | null> => ({
  scenes: [],
  more: false,
}));

const sa_getSessionForEdit = mock.fn(async (idStorySession: number) => ({
  idStorySession,
  idStory: 7,
  status: "DONE",
  values: { title: "", summary: "", notes: "", lingeringQuestions: "" },
  scenes: [],
}));
const sa_updateStorySession = mock.fn(async (_id: number, values: { title: string | null }) => ({
  ok: true as const,
  title: values.title,
}));
const sa_deleteStorySession = mock.fn(async (_id: number) => ({ ok: true as const }));
const sa_setLiveSceneText = mock.fn(
  async (
    _idStory: number,
    _idStoryScene: number,
    values: { title: string; description: string; notes: string },
  ) => ({
    ok: true as const,
    text: { description: values.description || null, notes: values.notes || null },
    title: values.title,
  }),
);
const sa_setSceneText = mock.fn(
  async (
    _idStory: number,
    _idStoryScene: number,
    values: { description: string; notes: string },
  ) => ({
    ok: true as const,
    text: { description: values.description || null, notes: values.notes || null },
  }),
);

let Storyboard: typeof import("./storyboard").Storyboard;

describe("Storyboard", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/[id]/storyboard/actions", {
      namedExports: { sa_getStoryboardScene, sa_getStoryboardSessions, sa_getStoryboardUnplayed },
    });
    // The pills reach for the players' table's actions and the element
    // history's; neither is called from a read-only board, so each is
    // mocked empty and a stray call fails loudly.
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: {
        sa_setPlaySceneText: mock.fn(),
        sa_setPlayElementNotes: mock.fn(),
        sa_untapPlaySceneElement: mock.fn(),
      },
    });
    mock.module("@/components/elements/actions", {
      namedExports: { sa_listElementHistory: mock.fn(async () => ({ rows: [], hasMore: false })) },
    });
    // The storyteller's two pencils: the band's opens the Timeline's session
    // panel, the card's the table's scene panel, each over its own actions.
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_getSessionForEdit, sa_updateStorySession, sa_deleteStorySession },
    });
    mock.module("@/app/(app)/scenes/[id]/live/actions", {
      namedExports: { sa_setLiveSceneText, sa_setLiveSceneSession: mock.fn() },
    });
    mock.module("@/app/(app)/run/[id]/actions", { namedExports: { sa_setSceneText } });
    // The session panel's cover pictures have test files of their own.
    mock.module("@/components/uploads/attachment-list-field", {
      namedExports: { AttachmentListField: () => <p>Pictures</p> },
    });
    mock.module("@/components/uploads/story-attachment-picker", {
      namedExports: { StoryAttachmentPicker: () => <p>Picker</p> },
    });
    ({ Storyboard } = await import("./storyboard"));
  });

  beforeEach(() => {
    sa_getStoryboardScene.mock.resetCalls();
    sa_getStoryboardScene.mock.mockImplementation(async () => docks);
    sa_getStoryboardSessions.mock.resetCalls();
    sa_getStoryboardUnplayed.mock.resetCalls();
    sa_getSessionForEdit.mock.resetCalls();
    sa_updateStorySession.mock.resetCalls();
    sa_deleteStorySession.mock.resetCalls();
    sa_setLiveSceneText.mock.resetCalls();
    sa_setSceneText.mock.resetCalls();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // The lanes alone: an open write-up is a region too, named "About …".
  function lanes() {
    return screen
      .getAllByRole("region")
      .filter((region) => !region.getAttribute("aria-label")?.startsWith("About "));
  }

  function render(data: StoryboardData = board) {
    return renderWithProviders(
      <UserProvider user={user}>
        <Storyboard board={data} sceneStatusOptions={statusOptions} />
      </UserProvider>,
    );
  }

  it("puts the story's doors beside its name: the story page for anyone, the library and Edit story for the storyteller", () => {
    render(tellersBoard);
    expect(screen.getByRole("link", { name: "Story" })).toHaveAttribute("href", "/stories/7");
    expect(screen.getByRole("link", { name: "Library: Full Story Resources" })).toHaveAttribute(
      "href",
      "/libraries/7",
    );
    expect(screen.getByRole("link", { name: "Edit story" })).toHaveAttribute(
      "href",
      "/stories/7/edit",
    );
    cleanup();

    render();
    expect(screen.getByRole("link", { name: "Story" })).toHaveAttribute("href", "/stories/7");
    expect(screen.queryByRole("link", { name: /Library/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit story" })).not.toBeInTheDocument();
  });

  it("lays the sittings side by side, each a band over its scenes in play order, on the story's cover", () => {
    render();

    expect(screen.getByRole("heading", { level: 1, name: "Psychoneira" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Psychoneira" })).toHaveAttribute("href", "/stories/7");
    expect(screen.getByTestId("storyboard-backdrop").style.backgroundImage).toContain(
      "https://x.test/cover.jpg",
    );

    const sittings = lanes();
    expect(sittings.map((region) => region.getAttribute("aria-label"))).toEqual([
      "1. Kildealg",
      "Session 2",
    ]);
    const cards = within(sittings[0]).getAllByRole("article");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "The abbey",
      "The docks",
    ]);
    // A sitting with nothing to show still has its band, and says so.
    expect(within(sittings[1]).getByText("No scenes to show.")).toBeInTheDocument();
  });

  it("shows a sitting's write-up above its scenes, folds it away from the info button on its band, and offers none where nothing was written", async () => {
    const u = userEvent.setup();
    render();

    const sittings = lanes();
    const info = within(sittings[0]).getByRole("button", { name: "About 1. Kildealg" });
    // Open from the start.
    expect(info).toHaveAttribute("aria-expanded", "true");
    const panel = within(sittings[0]).getByRole("region", { name: "About 1. Kildealg" });
    expect(within(panel).getByText("Summary")).toBeInTheDocument();
    expect(within(panel).getByText("The company reached the abbey.")).toBeInTheDocument();
    expect(within(panel).getByText("Notes")).toBeInTheDocument();
    expect(within(panel).getByText("Zed owes us a favour.")).toBeInTheDocument();
    // Nothing was asked, so the heading is left out rather than left empty.
    expect(within(panel).queryByText("Lingering questions")).not.toBeInTheDocument();
    // Above the scenes: the panel comes before the first card.
    const card = within(sittings[0]).getByRole("article", { name: "The abbey" });
    expect(panel.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The info button folds it away; the fold closes after a frame, once
    // Collapsible has seen there is no exit animation to wait for.
    await u.click(info);
    await waitFor(() => expect(info).toHaveAttribute("aria-expanded", "false"));
    expect(within(sittings[0]).queryByText("Zed owes us a favour.")).not.toBeInTheDocument();

    expect(
      within(sittings[1]).queryByRole("button", { name: "About Session 2" }),
    ).not.toBeInTheDocument();
  });

  it("makes each card from the scene's picture, its title, its place and length, its words and its status, with no link away", () => {
    render();

    const card = screen.getByRole("article", { name: "The docks" });
    expect(within(card).getByTestId("scene-cover").style.backgroundImage).toContain(
      "https://x.test/docks.png",
    );
    expect(within(card).getByRole("heading", { level: 3, name: "The docks" })).toBeInTheDocument();
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(within(card).getByText("Scene 2 · 1.5 hours")).toBeInTheDocument();
    expect(within(card).getByText("Fog on the water.")).toBeInTheDocument();
    expect(within(card).getByText("Complete")).toBeInTheDocument();
    // Closed, the table's notes are not on the face.
    expect(within(card).queryByText("Bring the lantern.")).not.toBeInTheDocument();

    const abbey = screen.getByRole("article", { name: "The abbey" });
    expect(within(abbey).getByText("Scene 1 · 45 minutes")).toBeInTheDocument();
  });

  it("opens a card in place on a touch, with its whole description and the table's notes, and closes it on another", async () => {
    const u = userEvent.setup();
    render();

    const card = screen.getByRole("article", { name: "The docks" });
    const title = within(card).getByRole("button", { name: "The docks" });
    expect(title).toHaveAttribute("aria-expanded", "false");

    // A touch anywhere on the face, not only the title.
    await u.click(within(card).getByText("Fog on the water."));
    expect(title).toHaveAttribute("aria-expanded", "true");
    expect(within(card).getByText("Notes")).toBeInTheDocument();
    expect(within(card).getByText("Bring the lantern.")).toBeInTheDocument();

    await u.click(title);
    expect(title).toHaveAttribute("aria-expanded", "false");
    expect(within(card).queryByText("Bring the lantern.")).not.toBeInTheDocument();

    // A scene with no notes opens without the heading.
    const abbey = screen.getByRole("article", { name: "The abbey" });
    await u.click(within(abbey).getByRole("button", { name: "The abbey" }));
    expect(within(abbey).queryByText("Notes")).not.toBeInTheDocument();
  });

  it("gives the storyteller every sitting, a scene not finished yet unnumbered, and the unplayed scenes in a grid at the end", () => {
    render(tellersBoard);

    const regions = lanes();
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      "1. Kildealg",
      "Session 2",
      "3. Lindisfarne",
      "Not yet played",
    ]);
    const ford = within(regions[2]).getByRole("article", { name: "The ford" });
    expect(within(ford).queryByText(/^Scene/)).not.toBeInTheDocument();
    expect(within(ford).getByText("Active")).toBeInTheDocument();
    // The open sitting's band says it is still in progress.
    expect(within(regions[2]).getByText("In progress")).toBeInTheDocument();

    const grid = regions[3];
    expect(within(grid).getByRole("article", { name: "The crossing" })).toBeInTheDocument();
  });

  it("shows a player no unplayed grid", () => {
    render();
    expect(screen.queryByRole("region", { name: "Not yet played" })).not.toBeInTheDocument();
  });

  it("grows a card open under its face with the scene's elements in their stacks, as the players' pills show them, and puts them away again", async () => {
    const u = userEvent.setup();
    render();

    const card = screen.getByRole("article", { name: "The docks" });
    const elements = within(card).getByRole("button", { name: "Elements" });
    expect(elements).toHaveAttribute("aria-expanded", "false");
    expect(within(card).queryByRole("region", { name: "Play space" })).not.toBeInTheDocument();

    await u.click(elements);
    expect(elements).toHaveAttribute("aria-expanded", "true");
    expect(sa_getStoryboardScene.mock.calls[0]?.arguments).toEqual([3]);
    // Inside the card, below its face: the space comes after the card's title.
    const space = await within(card).findByRole("region", { name: "Play space" });
    const title = within(card).getByRole("heading", { level: 3, name: "The docks" });
    expect(title.compareDocumentPosition(space) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The scene's stacks, one per tag, with the pill labelled as the
    // storyteller chose to show it.
    const stack = await within(space).findByRole("region", { name: "scene" });
    expect(within(stack).getByText("A hooded figure")).toBeInTheDocument();
    expect(within(stack).getByText("Harbourmaster")).toBeInTheDocument();
    expect(within(space).getByRole("region", { name: "elements" })).toBeInTheDocument();
    expect(within(space).getByText("Nothing here yet.")).toBeInTheDocument();
    // The card's face says the title; the space does not say it again.
    expect(within(space).queryByText("The docks")).not.toBeInTheDocument();
    // The scene's cover, full size, behind an eye in the panel's corner:
    // the same dialog a pill's thumbnail opens.
    await u.click(within(card).getByRole("button", { name: "Show cover" }));
    const cover = await screen.findByRole("dialog", { name: "The docks" });
    expect(within(cover).getByRole("img", { name: "The docks" })).toHaveAttribute(
      "src",
      "https://x.test/docks.png",
    );
    // The dialog takes focus a moment after it opens; an Escape before then
    // goes to the page and closes nothing, and the dialog still holds the
    // page when the card is clicked.
    await waitFor(() => expect(cover.contains(document.activeElement)).toBe(true));
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "The docks" })).toBeNull());
    // The other cards are untouched.
    expect(
      within(screen.getByRole("article", { name: "The abbey" })).queryByRole("region", {
        name: "Play space",
      }),
    ).not.toBeInTheDocument();

    await u.click(elements);
    expect(elements).toHaveAttribute("aria-expanded", "false");
    expect(within(card).queryByRole("region", { name: "Play space" })).not.toBeInTheDocument();
  });

  it("offers no eye for a scene without a cover", async () => {
    const u = userEvent.setup();
    sa_getStoryboardScene.mock.mockImplementation(async () => ({ ...docks, coverUrl: null }));
    render();

    const card = screen.getByRole("article", { name: "The abbey" });
    await u.click(within(card).getByRole("button", { name: "Elements" }));
    await within(card).findByRole("region", { name: "scene" });
    expect(within(card).queryByRole("button", { name: "Show cover" })).not.toBeInTheDocument();
  });

  it("says so when the scene cannot be loaded", async () => {
    const u = userEvent.setup();
    sa_getStoryboardScene.mock.mockImplementation(async () => null);
    render();

    const card = screen.getByRole("article", { name: "The abbey" });
    await u.click(within(card).getByRole("button", { name: "Elements" }));
    await waitFor(() =>
      expect(within(card).getByRole("alert")).toHaveTextContent(
        "This scene cannot be shown right now.",
      ),
    );
  });

  it("widens a card from the button in its corner and narrows it again", async () => {
    const u = userEvent.setup();
    render();

    // hidden: the button is for screens from md up, and jsdom's viewport is
    // narrower.
    const card = screen.getByRole("article", { name: "The docks" });
    const expand = within(card).getByRole("button", { name: "Expand The docks", hidden: true });
    expect(expand).toHaveAttribute("aria-pressed", "false");

    await u.click(expand);
    const shrink = within(card).getByRole("button", { name: "Shrink The docks", hidden: true });
    expect(shrink).toHaveAttribute("aria-pressed", "true");
    expect(
      within(card).queryByRole("button", { name: "Expand The docks", hidden: true }),
    ).not.toBeInTheDocument();

    await u.click(shrink);
    expect(
      within(card).getByRole("button", { name: "Expand The docks", hidden: true }),
    ).toBeInTheDocument();
  });

  it("fetches the sittings before the first from a More button at the start, and puts them before it", async () => {
    const u = userEvent.setup();
    sa_getStoryboardSessions.mock.mockImplementation(async () => ({
      sessions: [
        {
          idStorySession: 20,
          number: 0,
          title: "Prologue",
          status: "DONE",
          startedAt: new Date("2026-09-28T12:00:00Z"),
          summary: null,
          notes: null,
          lingeringQuestions: null,
          scenes: [],
        },
      ],
      more: false,
    }));
    render({ ...board, moreSessions: true });

    const more = screen.getByRole("button", { name: "Earlier sessions" });
    // Before the first lane.
    expect(
      more.compareDocumentPosition(lanes()[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await u.click(more);
    // From the oldest sitting on the board.
    expect(sa_getStoryboardSessions.mock.calls[0]?.arguments).toEqual([
      7,
      { number: 1, idStorySession: 21 },
    ]);
    await waitFor(() =>
      expect(lanes().map((region) => region.getAttribute("aria-label"))).toEqual([
        "0. Prologue",
        "1. Kildealg",
        "Session 2",
      ]),
    );
    // Nothing earlier, so no button.
    expect(screen.queryByRole("button", { name: "Earlier sessions" })).not.toBeInTheDocument();
  });

  it("fetches the next of the unplayed scenes from a More button after the grid, and says so when that fails", async () => {
    const u = userEvent.setup();
    sa_getStoryboardUnplayed.mock.mockImplementation(async () => ({
      scenes: [
        {
          idStoryScene: 6,
          title: "The tower",
          description: null,
          notes: null,
          status: "PENDING",
          imageUrl: null,
          sceneNumber: null,
          length: null,
        },
      ],
      more: true,
    }));
    render({ ...tellersBoard, moreUnplayed: true });

    const grid = screen.getByRole("region", { name: "Not yet played" });
    const more = within(grid).getByRole("button", { name: "More unplayed scenes" });
    await u.click(more);
    // From after the scenes the grid holds.
    expect(sa_getStoryboardUnplayed.mock.calls[0]?.arguments).toEqual([7, 1]);
    await within(grid).findByRole("article", { name: "The tower" });
    expect(within(grid).getByRole("article", { name: "The crossing" })).toBeInTheDocument();
    // Still more, so the button stays; a failure to fetch them is said.
    sa_getStoryboardUnplayed.mock.mockImplementation(async () => null);
    await u.click(within(grid).getByRole("button", { name: "More unplayed scenes" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("More could not be loaded right now."),
    );
  });

  it("says when there is nothing on the board yet", () => {
    render({ ...board, sessions: [], unplayed: [] });
    expect(screen.getByText("No scenes have been played yet.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("gives the storyteller a pencil on each band that opens the Timeline's session panel in a popover, and shows the write-up as saved", async () => {
    const u = userEvent.setup();
    render(tellersBoard);

    const lane = screen.getByRole("region", { name: "Session 2" });
    // Nothing written, so no info button; the pencil is there all the same.
    expect(within(lane).queryByRole("button", { name: "About Session 2" })).not.toBeInTheDocument();
    const pencil = within(lane).getByRole("button", { name: "Edit Session 2" });
    expect(pencil).toHaveAttribute("aria-expanded", "false");
    await u.click(pencil);
    const panel = await screen.findByRole("dialog", { name: "Session 2" });
    expect(pencil).toHaveAttribute("aria-expanded", "true");
    expect(sa_getSessionForEdit.mock.calls[0]?.arguments).toEqual([22]);
    const summary = await within(panel).findByRole("textbox", { name: "Summary (optional)" });
    await u.type(within(panel).getByRole("textbox", { name: "Title (optional)" }), "Whitby");
    await u.type(summary, "They crossed the moor.");
    await u.click(within(panel).getByRole("button", { name: "Save session" }));

    await waitFor(() => expect(sa_updateStorySession.mock.callCount()).toBe(1));
    expect(sa_updateStorySession.mock.calls[0].arguments).toEqual([
      22,
      { title: "Whitby", summary: "They crossed the moor.", notes: "", lingeringQuestions: "" },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Session 2" })).toBeNull());
    // The band and the write-up follow what was saved, with no reload.
    const renamed = screen.getByRole("region", { name: "2. Whitby" });
    const writeUp = within(renamed).getByRole("region", { name: "About 2. Whitby" });
    expect(within(writeUp).getByText("Summary")).toBeInTheDocument();
    expect(within(writeUp).getByText("They crossed the moor.")).toBeInTheDocument();
    expect(within(writeUp).queryByText("Notes")).not.toBeInTheDocument();
  });

  it("deletes a sitting from its panel once asked, and moves its scenes to the unplayed grid", async () => {
    const u = userEvent.setup();
    render(tellersBoard);

    await u.click(screen.getByRole("button", { name: "Edit 1. Kildealg" }));
    const panel = await screen.findByRole("dialog", { name: "1. Kildealg" });
    // The trashcan is at the top, beside the name, before the form's fields.
    const trashcan = within(panel).getByRole("button", { name: "Delete 1. Kildealg" });
    const title = await within(panel).findByRole("textbox", { name: "Title (optional)" });
    expect(trashcan.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await u.click(trashcan);
    const ask = await screen.findByRole("dialog", { name: "Delete 1. Kildealg?" });
    expect(ask).toHaveTextContent("each loses its link to this session");
    expect(sa_deleteStorySession.mock.callCount()).toBe(0);
    // Asking did not close the panel under it.
    expect(screen.getByRole("dialog", { name: "1. Kildealg" })).toBeInTheDocument();

    await u.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sa_deleteStorySession.mock.calls[0]?.arguments).toEqual([21]));
    await waitFor(() =>
      expect(lanes().map((region) => region.getAttribute("aria-label"))).toEqual([
        "Session 2",
        "3. Lindisfarne",
        "Not yet played",
      ]),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Its scenes are in the story still, with no sitting: first in the
    // grid, before the ones that were there.
    const grid = screen.getByRole("region", { name: "Not yet played" });
    expect(
      within(grid)
        .getAllByRole("article")
        .map((card) => card.getAttribute("aria-label")),
    ).toEqual(["The abbey", "The docks", "The crossing"]);
  });

  it("deletes the last sitting and leaves the board saying nothing was played", async () => {
    const u = userEvent.setup();
    render({ ...tellersBoard, sessions: [tellersBoard.sessions[1]], unplayed: [] });

    await u.click(screen.getByRole("button", { name: "Edit Session 2" }));
    const panel = await screen.findByRole("dialog", { name: "Session 2" });
    await u.click(within(panel).getByRole("button", { name: "Delete Session 2" }));
    const ask = await screen.findByRole("dialog", { name: "Delete Session 2?" });
    await u.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sa_deleteStorySession.mock.callCount()).toBe(1));
    // No scenes to move, so no grid appears.
    expect(await screen.findByText("No scenes have been played yet.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("gives the storyteller a pencil on each card that opens the table's scene panel, with the title for a scene not yet complete", async () => {
    const u = userEvent.setup();
    render(tellersBoard);

    const card = screen.getByRole("article", { name: "The ford" });
    const title = within(card).getByRole("button", { name: "The ford" });
    const pencil = within(card).getByRole("button", { name: "Edit The ford" });
    await u.click(pencil);
    // The pencil's touch does not open the card under it.
    expect(title).toHaveAttribute("aria-expanded", "false");
    const panel = await screen.findByRole("dialog", { name: "The ford" });
    // The description takes focus a moment after the panel opens; typing
    // anywhere before then is pulled into it.
    const description = within(panel).getByRole("textbox", { name: "Description" });
    await waitFor(() => expect(description).toHaveFocus());
    await u.type(within(panel).getByRole("textbox", { name: "Title" }), " of Sorrows");
    await u.type(description, "Shallow water.");
    await u.type(within(panel).getByRole("textbox", { name: "Notes" }), "Mind the horses.");
    await u.click(within(panel).getByRole("button", { name: "Save scene" }));

    await waitFor(() => expect(sa_setLiveSceneText.mock.callCount()).toBe(1));
    expect(sa_setLiveSceneText.mock.calls[0].arguments).toEqual([
      7,
      4,
      { title: "The ford of Sorrows", description: "Shallow water.", notes: "Mind the horses." },
    ]);
    expect(sa_setSceneText.mock.callCount()).toBe(0);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "The ford" })).toBeNull());
    // The card follows what was saved, with no reload.
    const renamed = screen.getByRole("article", { name: "The ford of Sorrows" });
    expect(within(renamed).getByText("Shallow water.")).toBeInTheDocument();
    await u.click(within(renamed).getByRole("button", { name: "The ford of Sorrows" }));
    expect(within(renamed).getByText("Mind the horses.")).toBeInTheDocument();
  });

  it("keeps a complete scene's title, and saves its words through the table's action, which takes a complete scene", async () => {
    const u = userEvent.setup();
    render(tellersBoard);

    const card = screen.getByRole("article", { name: "The docks" });
    await u.click(within(card).getByRole("button", { name: "Edit The docks" }));
    const panel = await screen.findByRole("dialog", { name: "The docks" });
    expect(within(panel).queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    const description = within(panel).getByRole("textbox", { name: "Description" });
    expect(description).toHaveValue("Fog on the water.");
    await waitFor(() => expect(description).toHaveFocus());
    const notes = within(panel).getByRole("textbox", { name: "Notes" });
    expect(notes).toHaveValue("Bring the lantern.");
    await u.type(notes, " And oil.");
    await u.click(within(panel).getByRole("button", { name: "Save scene" }));

    await waitFor(() => expect(sa_setSceneText.mock.callCount()).toBe(1));
    expect(sa_setSceneText.mock.calls[0].arguments).toEqual([
      7,
      3,
      { description: "Fog on the water.", notes: "Bring the lantern. And oil." },
    ]);
    expect(sa_setLiveSceneText.mock.callCount()).toBe(0);
  });

  it("shows a player no pencils", () => {
    render();
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
  });
});
