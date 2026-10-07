import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { SUMMARY_PREVIEW_CHARS, type StoryCardData } from "@/lib/stories";
import type { UnfinishedSession } from "@/app/(app)/(nav)/play/actions";

const unfinished: UnfinishedSession[] = [
  { idStorySession: 31, number: 4, title: "The Drowned Gate", status: "SUSPENDED" },
  { idStorySession: 30, number: 3, title: null, status: "OPEN" },
];
const sa_listUnfinishedSessions = mock.fn(async (_idStory: number) => unfinished);
const sa_startPlaying = mock.fn(
  async (_idStory: number, _idStorySession: number | null, _title?: string) => ({
    ok: false as const,
    error: "Refused.",
  }),
);

// Static imports are hoisted, so the card is loaded after the play actions
// are mocked; the storyteller's Play popover calls them.
let StoryCard: typeof import("./story-card").StoryCard;

const story: StoryCardData = {
  idStory: -13,
  title: "The Devil's Spine",
  summary: "Baron Tichronius marches to war.",
  imageUrl: "https://rpg.irun.games/images/x.jpg",
  lastPlayed: new Date("2015-06-25T12:00:00Z"),
  systemName: "Cypher System",
  systemVersion: "Revised",
  variant: "Numenera",
  isFavorite: false,
  isOwner: false,
  isActive: true,
  storytellerName: "Pol",
  hasOpenSession: false,
  playerCount: 2,
  waitingCount: 0,
  presentCount: 0,
};

describe("StoryCard", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/play/actions", {
      namedExports: { sa_listUnfinishedSessions, sa_startPlaying },
    });
    ({ StoryCard } = await import("./story-card"));
  });

  beforeEach(() => {
    sa_listUnfinishedSessions.mock.resetCalls();
    sa_listUnfinishedSessions.mock.mockImplementation(async () => unfinished);
    sa_startPlaying.mock.resetCalls();
  });

  it("shows the title as a link to the story, the system line and the date", () => {
    renderWithProviders(<StoryCard story={story} />);

    expect(screen.getByRole("link", { name: "The Devil's Spine" })).toHaveAttribute(
      "href",
      "/stories/-13",
    );
    expect(screen.getByText("Cypher System · Numenera (Revised)")).toBeInTheDocument();
    expect(screen.getByText("Jun 25, 2015")).toBeInTheDocument();
    expect(screen.getByText("Baron Tichronius marches to war.")).toBeInTheDocument();
  });

  it("uses the cover image as the card background", () => {
    renderWithProviders(<StoryCard story={story} />);

    const cover = screen.getByTestId("story-cover");
    expect(cover.style.backgroundImage).toContain("https://rpg.irun.games/images/x.jpg");
  });

  it("encodes a quote in the cover URL so it cannot break out of url()", () => {
    // A raw `"` here would close the CSS string and let the rest of the stored
    // URL inject declarations into every viewer's page.
    renderWithProviders(
      <StoryCard
        story={{ ...story, imageUrl: 'https://rpg.irun.games/x.jpg");color:red;background-image:url("' }}
      />,
    );

    const cover = screen.getByTestId("story-cover");
    expect(cover.style.backgroundImage).toContain("%22");
    expect(cover.style.backgroundImage.replace(/^url\("|"\)$/g, "")).not.toContain('"');
  });

  it("encodes a form feed in the cover URL, which also terminates a CSS string", () => {
    // CSS preprocessing folds U+000C into a newline before tokenizing, so it
    // breaks out of url("…") just like \n — and nothing upstream strips it.
    renderWithProviders(
      <StoryCard
        story={{ ...story, imageUrl: "https://rpg.irun.games/x.jpg\f);color:red;--x:url(" }}
      />,
    );

    const cover = screen.getByTestId("story-cover");
    expect(cover.style.backgroundImage).toContain("%0C");
    expect(cover.style.backgroundImage).not.toContain("\f");
  });

  it("leaves existing percent-escapes in the cover URL alone", () => {
    // Only the characters that can break out of url("…") are escaped. Encoding
    // the whole URL would turn this %20 into %2520 and break a real cover.
    renderWithProviders(
      <StoryCard story={{ ...story, imageUrl: "https://rpg.irun.games/my%20cover.jpg" }} />,
    );

    const cover = screen.getByTestId("story-cover");
    expect(cover.style.backgroundImage).toContain("my%20cover.jpg");
    expect(cover.style.backgroundImage).not.toContain("%2520");
  });

  it("leaves the system line out when the story has no system", () => {
    renderWithProviders(
      <StoryCard story={{ ...story, systemName: null, systemVersion: null, variant: null }} />,
    );

    expect(screen.queryByText(/Cypher/)).not.toBeInTheDocument();
  });

  it("offers 'more' only for a long summary, and opens the full text in a popover", async () => {
    const user = userEvent.setup();
    const long = "word ".repeat(SUMMARY_PREVIEW_CHARS).trim();

    renderWithProviders(<StoryCard story={{ ...story, summary: "short" }} />);
    expect(screen.queryByRole("button", { name: "more" })).not.toBeInTheDocument();

    renderWithProviders(<StoryCard story={{ ...story, summary: long }} />);
    await user.click(screen.getByRole("button", { name: "more" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(long);
  });

  it("renders no heart when there is no toggle handler", () => {
    renderWithProviders(<StoryCard story={story} />);
    expect(screen.queryByRole("button", { name: /favorites/ })).not.toBeInTheDocument();
  });

  it("shows an unfilled heart that asks to add, and calls back with true", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = mock.fn<(s: typeof story, next: boolean) => void>();
    renderWithProviders(<StoryCard story={story} onToggleFavorite={onToggleFavorite} />);

    const heart = screen.getByRole("button", { name: "Add to Favorites" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await user.hover(heart);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Add to Favorites");
    await user.click(heart);

    expect(onToggleFavorite.mock.calls[0].arguments).toEqual([story, true]);
  });

  it("shows a filled heart that asks to remove, and calls back with false", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = mock.fn<(s: typeof story, next: boolean) => void>();
    renderWithProviders(
      <StoryCard story={{ ...story, isFavorite: true }} onToggleFavorite={onToggleFavorite} />,
    );

    const heart = screen.getByRole("button", { name: "Remove from Favorites" });
    expect(heart).toHaveAttribute("aria-pressed", "true");
    await user.hover(heart);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Remove from Favorites");
    await user.click(heart);

    expect(onToggleFavorite.mock.calls[0].arguments[1]).toBe(false);
  });

  it("labels an inactive story", () => {
    renderWithProviders(<StoryCard story={story} />);
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();

    renderWithProviders(<StoryCard story={{ ...story, isActive: false, isOwner: true }} />);
    // The second card: the first, active one has a Play of its own.
    const retired = screen.getAllByRole("article")[1];
    expect(within(retired).getByText("Inactive")).toBeInTheDocument();
    // The pill takes the Play button's place: a retired story is not played.
    expect(within(retired).queryByLabelText(/^Play/)).not.toBeInTheDocument();
  });

  it("names the storyteller when someone else runs the story", () => {
    renderWithProviders(<StoryCard story={story} />);
    expect(screen.getByText("Storyteller: Pol")).toBeInTheDocument();
  });

  it("leaves the storyteller line out for the owner, or when the story has no creator", () => {
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
    expect(screen.queryByText(/Storyteller:/)).not.toBeInTheDocument();

    renderWithProviders(<StoryCard story={{ ...story, storytellerName: null }} />);
    expect(screen.queryByText(/Storyteller:/)).not.toBeInTheDocument();
  });

  it("offers the owner Play, with a tooltip", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
    // A button, not a link: it opens the session popover first.
    const play = screen.getByRole("button", { name: "Play" });

    await user.hover(play);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Start playing");
  });

  it("counts the players waiting on the owner's Play, as (3) before the arrow", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true, waitingCount: 3 }} />);

    const play = screen.getByRole("button", { name: "Play, 3 players waiting" });
    expect(play).toHaveTextContent("(3)");
    expect(play.querySelector(".lucide-play")).toBeInTheDocument();
    await user.hover(play);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Start playing · 3 waiting");
  });

  it("names one waiting player in the singular", () => {
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true, waitingCount: 1 }} />);
    expect(screen.getByRole("button", { name: "Play, 1 player waiting" })).toHaveTextContent(
      "(1)",
    );
  });

  it("highlights the card only when the owner has players waiting", () => {
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
    expect(screen.getByRole("article")).not.toHaveAttribute("data-waiting");

    renderWithProviders(<StoryCard story={{ ...story, idStory: -14, waitingCount: 2 }} />);
    // A player sees no count, so no highlight it would have to explain.
    expect(screen.getAllByRole("article")[1]).not.toHaveAttribute("data-waiting");

    renderWithProviders(
      <StoryCard story={{ ...story, idStory: -15, isOwner: true, waitingCount: 2 }} />,
    );
    expect(screen.getAllByRole("article")[2]).toHaveAttribute("data-waiting");
  });

  it("offers the owner the Library beside Play, and beside the Inactive pill", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryCard story={story} />);
    expect(screen.queryByRole("link", { name: "Library: prep game" })).not.toBeInTheDocument();

    renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
    const prep = screen.getByRole("link", { name: "Library: prep game" });
    expect(prep).toHaveAttribute("href", "/libraries/-13");
    // Right of Play: it comes after it in document order.
    expect(
      screen.getByRole("button", { name: "Play" }).compareDocumentPosition(prep) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.hover(prep);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Library: prep game");
  });

  it("keeps the Library for the owner of a retired story", () => {
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true, isActive: false }} />);
    expect(screen.getByRole("link", { name: "Library: prep game" })).toHaveAttribute(
      "href",
      "/libraries/-13",
    );
  });

  it("offers a player a plain Play to the table while no session is on", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryCard story={story} />);

    const play = screen.getByRole("link", { name: "Play" });
    expect(play).toHaveAttribute("href", "/play/-13");
    // Plain: the icon alone, no count.
    expect(play.textContent).toBe("");
    await user.hover(play);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Go to the table");
  });

  it("highlights a player's Play with how many are at the table while a session is on", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryCard story={{ ...story, hasOpenSession: true, presentCount: 3 }} />,
    );

    const play = screen.getByRole("link", { name: "Play, 3 players at the table" });
    expect(play).toHaveAttribute("href", "/play/-13");
    expect(play).toHaveTextContent("(3)");
    expect(play.querySelector(".lucide-play")).toBeInTheDocument();
    await user.hover(play);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Session in progress · 3 at the table",
    );
    // The outline is the storyteller's signal for players waiting, not this.
    expect(screen.getByRole("article")).not.toHaveAttribute("data-waiting");
  });

  it("draws the plain Play as an outline, keeping the highlight for when there is a count", () => {
    renderWithProviders(<StoryCard story={story} />);
    renderWithProviders(<StoryCard story={{ ...story, idStory: -14, waitingCount: 2 }} />);

    // jsdom cannot resolve Chakra's classes to colours, so this only pins
    // that the two are styled apart; the colours are checked in a browser.
    const plain = screen.getByRole("link", { name: "Play" });
    const highlighted = screen.getByRole("link", { name: "Play, 2 players waiting" });
    expect(plain.className).not.toBe(highlighted.className);
  });

  it("highlights a player's Play with how many others are waiting while no session is on", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryCard story={{ ...story, waitingCount: 2 }} />);

    const play = screen.getByRole("link", { name: "Play, 2 players waiting" });
    expect(play).toHaveAttribute("href", "/play/-13");
    expect(play).toHaveTextContent("(2)");
    await user.hover(play);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("2 waiting for the storyteller");
  });

  it("counts the table, not the waiting room, once a session is on", () => {
    renderWithProviders(
      <StoryCard story={{ ...story, hasOpenSession: true, presentCount: 3, waitingCount: 5 }} />,
    );
    expect(screen.getByRole("link", { name: "Play, 3 players at the table" })).toBeInTheDocument();
  });

  it("counts one player at the table in the singular, and none as zero", () => {
    renderWithProviders(<StoryCard story={{ ...story, hasOpenSession: true, presentCount: 1 }} />);
    expect(screen.getByRole("link", { name: "Play, 1 player at the table" })).toHaveTextContent(
      "(1)",
    );

    renderWithProviders(
      <StoryCard story={{ ...story, idStory: -14, hasOpenSession: true, presentCount: 0 }} />,
    );
    expect(screen.getByRole("link", { name: "Play, 0 players at the table" })).toHaveTextContent(
      "(0)",
    );
  });

  describe("the storyteller's session popover", () => {
    async function openPopover() {
      const user = userEvent.setup();
      renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
      await user.click(screen.getByRole("button", { name: "Play" }));
      const popover = await screen.findByRole("dialog", { name: "Play The Devil's Spine" });
      return { user, popover };
    }

    it("starts on the latest unfinished session, with Resume", async () => {
      const { popover } = await openPopover();
      const select = within(popover).getByRole("combobox", { name: "Session" });

      await waitFor(() => expect(select).toHaveValue("31"));
      expect(
        within(popover).getByRole("option", { name: "4. The Drowned Gate · Suspended" }),
      ).toBeInTheDocument();
      expect(within(popover).getByRole("option", { name: "Create new session" })).toHaveValue("");
      expect(within(popover).getByRole("button", { name: "Resume" })).toBeEnabled();
      expect(sa_listUnfinishedSessions.mock.calls[0].arguments).toEqual([-13]);
    });

    it("says Start for a new session, and starts on it when there is no other", async () => {
      sa_listUnfinishedSessions.mock.mockImplementation(async () => []);
      const { popover } = await openPopover();
      const select = within(popover).getByRole("combobox", { name: "Session" });

      expect(await within(popover).findByRole("button", { name: "Start" })).toBeEnabled();
      expect(select).toHaveValue("");
    });

    it("switches between Start and Resume with the choice", async () => {
      const { user, popover } = await openPopover();
      const select = within(popover).getByRole("combobox", { name: "Session" });
      await waitFor(() => expect(select).toHaveValue("31"));

      await user.selectOptions(select, "");
      expect(within(popover).getByRole("button", { name: "Start" })).toBeInTheDocument();
      await user.selectOptions(select, "30");
      expect(within(popover).getByRole("button", { name: "Resume" })).toBeInTheDocument();
    });

    it("opens the table on the chosen session, and keeps a refusal in the popover", async () => {
      const { user, popover } = await openPopover();
      await waitFor(() =>
        expect(within(popover).getByRole("combobox", { name: "Session" })).toHaveValue("31"),
      );

      await user.click(within(popover).getByRole("button", { name: "Resume" }));

      expect(sa_startPlaying.mock.calls[0].arguments.slice(0, 2)).toEqual([-13, 31]);
      expect(sa_startPlaying.mock.calls[0].arguments[2]).toMatch(/ session$/);
      expect(await within(popover).findByRole("alert")).toHaveTextContent("Refused.");
    });

    it("closes on Cancel without opening the table", async () => {
      const { user, popover } = await openPopover();

      await user.click(within(popover).getByRole("button", { name: "Cancel" }));

      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Play The Devil's Spine" }),
        ).not.toBeInTheDocument(),
      );
      expect(sa_startPlaying.mock.callCount()).toBe(0);
    });
  });

  it("keeps the owner's Play about waiting players even while a session is open", () => {
    renderWithProviders(
      <StoryCard story={{ ...story, isOwner: true, hasOpenSession: true, presentCount: 4 }} />,
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("shows no Play on an inactive story", () => {
    renderWithProviders(<StoryCard story={{ ...story, isActive: false, hasOpenSession: true }} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Play/ })).not.toBeInTheDocument();
  });

  it("shows the player count in a bubble, named for a screen reader, with a tooltip", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryCard story={story} />);
    const bubble = screen.getByLabelText("2 players");
    expect(bubble).toHaveTextContent("2");
    await user.hover(bubble);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Player Count");
    await user.unhover(bubble);

    renderWithProviders(<StoryCard story={{ ...story, idStory: -14, playerCount: 1 }} />);
    expect(screen.getByLabelText("1 player")).toHaveTextContent("1");

    renderWithProviders(<StoryCard story={{ ...story, idStory: -15, playerCount: 0 }} />);
    const empty = screen.getByLabelText("0 players");
    // Nobody at the table: the person is struck through and no digit shown,
    // so the hidden screen-reader label is the pill's only text.
    expect(empty.textContent).toBe("0 players");
    expect(empty.querySelector(".lucide-slash")).toBeInTheDocument();
    expect(screen.getByLabelText("2 players").querySelector(".lucide-slash")).toBeNull();
  });

  it("keeps the Play button round rather than stretched across its column", () => {
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
    const play = screen.getByRole("button", { name: "Play" });
    // A grid item stretches to its column unless told otherwise; the cell
    // must start-align so the round button keeps its width. Play sits in the
    // row it shares with the Library button, and that row is the grid's item.
    expect(play.parentElement?.parentElement).toHaveStyle({ justifyItems: "start" });
  });

  it("disables the heart while a toggle is pending", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = mock.fn<(s: typeof story, next: boolean) => void>();
    renderWithProviders(
      <StoryCard story={story} onToggleFavorite={onToggleFavorite} favoritePending />,
    );

    // aria-disabled, not disabled: the button keeps its place in the tab order
    // so a keyboard user is not thrown to the top of the page mid-toggle.
    const heart = screen.getByRole("button", { name: "Add to Favorites" });
    expect(heart).toHaveAttribute("aria-disabled", "true");

    await user.click(heart);
    expect(onToggleFavorite.mock.callCount()).toBe(0);
  });
});
