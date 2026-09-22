import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { SUMMARY_PREVIEW_CHARS, type StoryCardData } from "@/lib/stories";
import { StoryCard } from "./story-card";

const story: StoryCardData = {
  idGame: -13,
  gameTitle: "The Devil's Spine",
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
};

describe("StoryCard", () => {
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

  it("leaves the system line out when the game has no system", () => {
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
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    // The pill takes the Play button's place: a retired story is not played.
    expect(screen.queryByRole("link", { name: "Play" })).not.toBeInTheDocument();
  });

  it("names the storyteller when someone else runs the story", () => {
    renderWithProviders(<StoryCard story={story} />);
    expect(screen.getByText("Storyteller: Pol")).toBeInTheDocument();
  });

  it("leaves the storyteller line out for the owner, or when the game has no creator", () => {
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
    expect(screen.queryByText(/Storyteller:/)).not.toBeInTheDocument();

    renderWithProviders(<StoryCard story={{ ...story, storytellerName: null }} />);
    expect(screen.queryByText(/Storyteller:/)).not.toBeInTheDocument();
  });

  it("offers Play to the owner only, with a tooltip, linking to the table", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryCard story={story} />);
    expect(screen.queryByRole("link", { name: "Play" })).not.toBeInTheDocument();

    renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
    const play = screen.getByRole("link", { name: "Play" });
    expect(play).toHaveAttribute("href", "/play/-13");

    await user.hover(play);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Start playing");
  });

  it("offers Join in Play's place to a non-owner while a session is open", () => {
    renderWithProviders(<StoryCard story={story} />);
    expect(screen.queryByRole("link", { name: "Join" })).not.toBeInTheDocument();

    renderWithProviders(<StoryCard story={{ ...story, hasOpenSession: true }} />);
    expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute("href", "/play/-13");
    expect(screen.queryByRole("link", { name: "Play" })).not.toBeInTheDocument();
  });

  it("keeps Play for the owner even while their session is open", () => {
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true, hasOpenSession: true }} />);
    expect(screen.getByRole("link", { name: "Play" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Join" })).not.toBeInTheDocument();
  });

  it("shows no Join on an inactive story", () => {
    renderWithProviders(<StoryCard story={{ ...story, isActive: false, hasOpenSession: true }} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Join" })).not.toBeInTheDocument();
  });

  it("shows the player count in a bubble, named for a screen reader, with a tooltip", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryCard story={story} />);
    const bubble = screen.getByLabelText("2 players");
    expect(bubble).toHaveTextContent("2");
    await user.hover(bubble);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Player Count");
    await user.unhover(bubble);

    renderWithProviders(<StoryCard story={{ ...story, idGame: -14, playerCount: 1 }} />);
    expect(screen.getByLabelText("1 player")).toHaveTextContent("1");

    renderWithProviders(<StoryCard story={{ ...story, idGame: -15, playerCount: 0 }} />);
    const empty = screen.getByLabelText("0 players");
    // Nobody at the table: the person is struck through and no digit shown,
    // so the hidden screen-reader label is the pill's only text.
    expect(empty.textContent).toBe("0 players");
    expect(empty.querySelector(".lucide-slash")).toBeInTheDocument();
    expect(screen.getByLabelText("2 players").querySelector(".lucide-slash")).toBeNull();
  });

  it("keeps the Play button round rather than stretched across its column", () => {
    renderWithProviders(<StoryCard story={{ ...story, isOwner: true }} />);
    const play = screen.getByRole("link", { name: "Play" });
    // A grid item stretches to its column unless told otherwise; the cell
    // must start-align so the round button keeps its width.
    expect(play.parentElement).toHaveStyle({ justifyItems: "start" });
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
