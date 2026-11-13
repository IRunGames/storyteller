import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ReactElement } from "react";
import { renderWithProviders as renderBare } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";

// The list marks the viewer's own seat, so it reads the signed-in user.
// Someone who is not in it unless a case seats them.
const viewer: CurrentUser = {
  id: "u-viewer",
  name: "Viewer",
  email: "viewer@example.test",
  image: null,
  nickName: null,
  idUserType: -10,
  isAnonymous: false,
};
const renderWithProviders = (ui: ReactElement, who: CurrentUser = viewer) =>
  renderBare(<UserProvider user={who}>{ui}</UserProvider>);
import type { StatusOption } from "@/lib/status";
import type { StoryCardData, StoryPlayer, StorySession } from "@/lib/stories";

const story: StoryCardData = {
  idStory: -15,
  title: "Vampire",
  summary: "A city of the dead.",
  imageUrl: "https://rpg.irun.games/images/vampire.jpg",
  lastPlayed: new Date("2015-06-25T12:00:00Z"),
  systemName: "Vampire: The Masquerade",
  systemVersion: "5th",
  variant: null,
  isFavorite: false,
  isOwner: false,
  isActive: true,
  isLookingForPlayers: false,
  storytellerName: "PalmDave",
  hasOpenSession: false,
  playerCount: 2,
  waitingCount: 0,
  isPlayer: false,
  isPublic: false,
  presentCount: 0,
};

const players: StoryPlayer[] = [
  { idUser: "u1", name: "PaulKhash", image: null },
  { idUser: "u2", name: "Pol", image: "https://rpg.irun.games/images/pol.png" },
];

// An invented workflow, as in status-pill.test.tsx: what the real session
// statuses are called lives in the database and will change.
const sessionStatusOptions: StatusOption[] = [
  { key: "FIRST", label: "First", description: null, from: [] },
  { key: "LAST", label: "Last", description: null, from: ["FIRST"] },
];

const sessions: StorySession[] = [
  {
    idStorySession: 3,
    number: 2,
    title: "The feast",
    status: "LAST",
    startedAt: new Date("2026-03-20T19:00:00Z"),
    length: 150,
    playerCount: 2,
  },
  {
    idStorySession: 2,
    number: 1,
    title: "The arrival",
    status: "FIRST",
    startedAt: new Date("2026-03-13T19:00:00Z"),
    length: 60,
    playerCount: 2,
  },
];

let StoryDetails: typeof import("./story-details").StoryDetails;

// What the Play popover asks for and does: one session to carry on with, and
// a start that comes back refused, since the real one redirects.
const sa_listUnfinishedSessions = mock.fn(async (_idStory: number) => [
  { idStorySession: 7, number: 3, title: "Kildealg", status: "SUSPENDED" },
]);
const sa_startPlaying = mock.fn(
  async (_idStory: number, _idSession: number | null, _title: string) => ({
    error: "Refused for the test.",
  }),
);

const sa_setFavorite = mock.fn(async (_idStory: number, isFavorite: boolean) => ({ isFavorite }));
// The Build Scenes door makes the first scene of a story without one.
const sa_createLiveScene = mock.fn(async (_idStory: number, values: { title: string }) => ({
  ok: true as const,
  space: {
    scene: { idStoryScene: -70, title: values.title, status: "PENDING" },
    tags: [],
    coverUrl: null,
    inPlay: [],
  },
}));
const push = mock.fn((_href: string) => {});

const section = (name: string) => screen.getByRole("region", { name });

describe("StoryDetails", () => {
  before(async () => {
    // The sessions list imports its server action itself; mocked so the
    // details page can be rendered without a database.
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: {
        sa_listStorySessions: async () => [],
        sa_getStorySession: async () => null,
        sa_searchPlayers: async () => [],
        sa_addStoryPlayers: async () => [],
        sa_inviteToStory: async () => ({ ok: false, errors: {} }),
        sa_listStoryInvitations: async () => [],
        sa_revokeStoryInvitation: async () => ({ ok: true }),
        sa_setFavorite,
      },
    });
    // The attachments section's search goes to the database; the section's
    // own test file covers it.
    mock.module("@/components/uploads/actions", {
      namedExports: { sa_searchAttachments: async () => [] },
    });
    // The attachments field uploads to Blob and has a test file of its own;
    // here it only has to show which parent it was pointed at.
    mock.module("@/components/uploads/attachment-list-field", {
      namedExports: {
        AttachmentListField: ({
          kind,
          idExternal,
        }: {
          kind: string;
          idExternal: number | null;
        }) => (
          <p>
            Attachments for {kind} {idExternal}
          </p>
        ),
      },
    });
    mock.module("@/app/(app)/(nav)/play/actions", {
      namedExports: { sa_listUnfinishedSessions, sa_startPlaying },
    });
    mock.module("@/app/(app)/run/[id]/actions", { namedExports: { sa_createLiveScene } });
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push, refresh: mock.fn() }),
        usePathname: () => "/stories/-15",
      },
    });
    ({ StoryDetails } = await import("./story-details"));
  });

  it("shows the title, system, storyteller, last played date and summary", () => {
    renderWithProviders(
      <StoryDetails
        story={story}
        players={players}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Vampire" })).toBeInTheDocument();
    expect(screen.getByText("Vampire: The Masquerade (5th)")).toBeInTheDocument();
    expect(screen.getByText("Storyteller: PalmDave")).toBeInTheDocument();
    expect(screen.getByText(/Last played:/)).toHaveTextContent("Last played: Jun 25, 2015");
    expect(screen.getByText("A city of the dead.")).toBeInTheDocument();
  });

  it("opens the storyteller's doors from the caret after the title, each a link", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryDetails
        story={{ ...story, isOwner: true }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
        buildSceneId={-7}
      />,
    );

    const title = screen.getByRole("heading", { level: 1, name: "Vampire" });
    await user.click(within(title).getByRole("button", { name: "Vampire" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Edit", "/stories/-15/edit"],
      ["Library", "/libraries/-15"],
      ["Build scenes", "/scenes/-7/live"],
      ["Play", null],
      ["Storyboard", "/stories/-15/storyboard"],
    ]);
  });

  it("makes the first scene from Build scenes while the story has none, and goes to it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryDetails
        story={{ ...story, isOwner: true }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Vampire" }));
    const build = await screen.findByRole("menuitem", { name: "Build scenes" });
    expect(build).not.toHaveAttribute("href");
    await user.click(build);
    await waitFor(() => expect(sa_createLiveScene.mock.callCount()).toBe(1));
    expect(sa_createLiveScene.mock.calls[0].arguments).toEqual([
      -15,
      { title: "New scene", description: "" },
    ]);
    await waitFor(() => expect(push.mock.calls.at(-1)?.arguments).toEqual(["/scenes/-70/live"]));
  });

  it("offers anyone but the storyteller the Storyboard alone", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
        buildSceneId={-7}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Vampire" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Storyboard", "/stories/-15/storyboard"],
    ]);
  });

  it("wears a PUBLIC badge beside the title when anyone may read the story's sessions", () => {
    const { unmount } = renderWithProviders(
      <StoryDetails
        story={{ ...story, isPublic: true }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );
    expect(screen.getByText("PUBLIC")).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );
    expect(screen.queryByText("PUBLIC")).not.toBeInTheDocument();
  });

  it("gives the storyteller an Attachments section at the foot of the page, for this story", () => {
    renderWithProviders(
      <StoryDetails
        story={{ ...story, isOwner: true }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    const attachments = section("Attachments");
    expect(within(attachments).getByText("Attachments for STORY -15")).toBeInTheDocument();
    // Last: after the sessions, which were the foot of the page before it.
    expect(
      section("Recent sessions").compareDocumentPosition(attachments) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows no Attachments section to anyone but the storyteller", () => {
    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    expect(screen.queryByRole("region", { name: "Attachments" })).not.toBeInTheDocument();
  });

  it("offers the storyteller of an active story the card's Play, which asks which session", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryDetails
        story={{ ...story, isOwner: true }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    // A button, not a link straight to the table.
    expect(screen.queryByRole("link", { name: "Play" })).not.toBeInTheDocument();
    await user.click(within(section("Recent sessions")).getByRole("button", { name: "Play" }));

    const ask = await screen.findByRole("dialog", { name: "Play Vampire" });
    await waitFor(() => expect(sa_listUnfinishedSessions.mock.calls[0]?.arguments).toEqual([-15]));
    const select = within(ask).getByRole("combobox", { name: "Session" });
    // On the session most recently touched, with a new one on offer.
    await waitFor(() => expect(select).toHaveValue("7"));
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Create new session", "3. Kildealg · Suspended"]);

    await user.selectOptions(select, "");
    await user.click(within(ask).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(sa_startPlaying.mock.callCount()).toBe(1));
    expect(sa_startPlaying.mock.calls[0].arguments.slice(0, 2)).toEqual([-15, null]);
    expect(await within(ask).findByRole("alert")).toHaveTextContent("Refused for the test.");
  });

  it("offers a player of an active story Play as the link to the table", () => {
    renderWithProviders(
      <StoryDetails
        story={{ ...story, isPlayer: true }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    expect(within(section("Recent sessions")).getByRole("link", { name: "Play" })).toHaveAttribute(
      "href",
      "/play/-15",
    );
  });

  it("shows no Play button to anyone but the storyteller and the players, or on an inactive story", () => {
    const { unmount } = renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <StoryDetails
        story={{ ...story, isOwner: true, isActive: false }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
  });

  it("offers the storyteller an Invite Players button beside the Players heading", () => {
    const { unmount } = renderWithProviders(
      <StoryDetails
        story={{ ...story, isOwner: true }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );
    expect(
      within(section("Players")).getByRole("button", { name: "Invite Players" }),
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );
    expect(screen.queryByRole("button", { name: "Invite Players" })).not.toBeInTheDocument();
  });

  it("leaves out the lines it has nothing for", () => {
    renderWithProviders(
      <StoryDetails
        story={{
          ...story,
          systemName: null,
          storytellerName: null,
          summary: null,
        }}
        players={players}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    expect(screen.queryByText(/Storyteller:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Masquerade/)).not.toBeInTheDocument();
    expect(screen.getByText(/Last played:/)).toHaveTextContent("Last played: Jun 25, 2015");
  });

  it("uses the cover as the page background, escaped, and only when there is one", () => {
    const { unmount } = renderWithProviders(
      <StoryDetails
        story={{ ...story, imageUrl: 'https://x.test/a"b.jpg' }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );
    const backdrop = screen.getByTestId("story-backdrop");
    expect(backdrop.style.backgroundImage).toContain("https://x.test/a%22b.jpg");
    unmount();

    renderWithProviders(
      <StoryDetails
        story={{ ...story, imageUrl: null }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );
    expect(screen.queryByTestId("story-backdrop")).not.toBeInTheDocument();
  });

  it("lists the players by name, with an avatar each", () => {
    renderWithProviders(
      <StoryDetails
        story={story}
        players={players}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    const items = within(section("Players")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("PaulKhash")).toBeInTheDocument();
    expect(within(items[1]).getByText("Pol")).toBeInTheDocument();
    // Chakra keeps the image hidden until it has loaded, which jsdom never
    // does; a hidden image has no accessible name, so it is found first and
    // its alt checked after.
    const image = within(items[1]).getByRole("img", { hidden: true });
    expect(image).toHaveAttribute("alt", "Pol");
    expect(image).toHaveAttribute("src", "https://rpg.irun.games/images/pol.png");
  });

  it("says so when there are no players yet", () => {
    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    expect(within(section("Players")).getByText("No players yet.")).toBeInTheDocument();
    expect(within(section("Players")).queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists the recent sessions with their dates and lengths", () => {
    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={sessions}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    const items = within(section("Recent sessions")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Mar 20, 2026")).toBeInTheDocument();
    expect(within(items[0]).getByText("2.5 hours")).toBeInTheDocument();
    expect(within(items[1]).getByText("1 hour")).toBeInTheDocument();
  });

  it("draws the same row as the Prep Work timeline", () => {
    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={sessions}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    const items = within(section("Recent sessions")).getAllByRole("listitem");
    // Numbered and titled, as the library lists them.
    expect(within(items[0]).getByText("2. The feast")).toBeInTheDocument();
    expect(within(items[1]).getByText("1. The arrival")).toBeInTheDocument();
    // Who was at the table, as a person and a number.
    expect(within(items[0]).getByLabelText("2 players")).toHaveTextContent("2");
    // And the status as a pill. The story is not the caller's, so it is not
    // a menu: only the storyteller moves a session on.
    expect(within(items[0]).getByText("Last")).toBeInTheDocument();
    expect(within(items[0]).queryByRole("button", { name: "Last" })).not.toBeInTheDocument();
  });

  it("lets the storyteller move a session's status from the story page", () => {
    renderWithProviders(
      <StoryDetails
        story={{ ...story, isOwner: true }}
        players={[]}
        sessions={sessions}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    const items = within(section("Recent sessions")).getAllByRole("listitem");
    // FIRST leads to LAST in this workflow, so that pill is a menu.
    expect(within(items[1]).getByRole("button", { name: "First" })).toBeInTheDocument();
  });

  it("says so when there are no sessions yet", () => {
    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    expect(within(section("Recent sessions")).getByText("No sessions yet.")).toBeInTheDocument();
  });

  it("puts the card's heart at the end of the title's line, which saves the favorite and shows the answer", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryDetails
        story={story}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    const title = screen.getByRole("heading", { level: 1, name: "Vampire" });
    const heart = screen.getByRole("button", { name: "Add to Favorites" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    // On the title's line, after the title and before the expand button.
    expect(title.parentElement!.parentElement).toContainElement(heart);
    expect(title.compareDocumentPosition(heart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const expand = screen.getByRole("button", { name: "Expand page" });
    expect(heart.parentElement).toContainElement(expand);
    expect(heart.compareDocumentPosition(expand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(heart);
    await waitFor(() => expect(sa_setFavorite.mock.callCount()).toBe(1));
    expect(sa_setFavorite.mock.calls[0].arguments).toEqual([-15, true]);
    expect(await screen.findByRole("button", { name: "Remove from Favorites" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("widens the column to the window from the expand button in the top corner, and back", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryDetails
        story={{ ...story, isOwner: true }}
        players={[]}
        sessions={[]}
        sessionStatusOptions={sessionStatusOptions}
      />,
    );

    const expand = screen.getByRole("button", { name: "Expand page" });
    expect(expand).toHaveAttribute("aria-pressed", "false");
    // At the end of the title's line, to the right of the heart.
    const title = screen.getByRole("heading", { level: 1, name: "Vampire" });
    expect(title.compareDocumentPosition(expand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector("[data-wide]")).toBeNull();

    await user.click(expand);
    const shrink = screen.getByRole("button", { name: "Shrink page" });
    expect(shrink).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("[data-wide]")).not.toBeNull();

    await user.click(shrink);
    expect(screen.getByRole("button", { name: "Expand page" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(document.querySelector("[data-wide]")).toBeNull();
  });
});
