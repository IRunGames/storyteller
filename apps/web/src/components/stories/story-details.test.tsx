import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import type { StoryCardData, StoryPlayer, StorySession } from "@/lib/stories";

const story: StoryCardData = {
  idGame: -15,
  gameTitle: "Vampire",
  summary: "A city of the dead.",
  imageUrl: "https://rpg.irun.games/images/vampire.jpg",
  lastPlayed: new Date("2015-06-25T12:00:00Z"),
  systemName: "Vampire: The Masquerade",
  systemVersion: "5th",
  variant: null,
  isFavorite: false,
  isOwner: false,
  isActive: true,
  storytellerName: "PalmDave",
  hasOpenSession: false,
  playerCount: 2,
};

const players: StoryPlayer[] = [
  { idUser: "u1", name: "PaulKhash", image: null },
  { idUser: "u2", name: "Pol", image: "https://rpg.irun.games/images/pol.png" },
];

const sessions: StorySession[] = [
  { idGameSession: 3, status: "done", startedAt: new Date("2026-03-20T19:00:00Z"), length: 150 },
  { idGameSession: 2, status: "done", startedAt: new Date("2026-03-13T19:00:00Z"), length: 60 },
];

let StoryDetails: typeof import("./story-details").StoryDetails;

const section = (name: string) => screen.getByRole("region", { name });

describe("StoryDetails", () => {
  before(async () => {
    // The sessions list imports its server action itself; mocked so the
    // details page can be rendered without a database.
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_listStorySessions: async () => [] },
    });
    ({ StoryDetails } = await import("./story-details"));
  });

  it("shows the title, system, storyteller, last played date and summary", () => {
    renderWithProviders(<StoryDetails story={story} players={players} sessions={[]} />);

    expect(screen.getByRole("heading", { level: 1, name: "Vampire" })).toBeInTheDocument();
    expect(screen.getByText("Vampire: The Masquerade (5th)")).toBeInTheDocument();
    expect(screen.getByText("Storyteller: PalmDave")).toBeInTheDocument();
    expect(screen.getByText("Last played: Jun 25, 2015")).toBeInTheDocument();
    expect(screen.getByText("A city of the dead.")).toBeInTheDocument();
  });

  it("offers the storyteller an edit button that leads to the edit page", () => {
    renderWithProviders(
      <StoryDetails story={{ ...story, isOwner: true }} players={[]} sessions={[]} />,
    );

    expect(screen.getByRole("link", { name: "Edit story" })).toHaveAttribute(
      "href",
      "/stories/-15/edit",
    );
  });

  it("shows no edit button to anyone but the storyteller", () => {
    renderWithProviders(<StoryDetails story={story} players={[]} sessions={[]} />);

    expect(screen.queryByRole("link", { name: "Edit story" })).not.toBeInTheDocument();
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
      />,
    );

    expect(screen.queryByText(/Storyteller:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Masquerade/)).not.toBeInTheDocument();
    expect(screen.getByText("Last played: Jun 25, 2015")).toBeInTheDocument();
  });

  it("uses the cover as the page background, escaped, and only when there is one", () => {
    const { unmount } = renderWithProviders(
      <StoryDetails
        story={{ ...story, imageUrl: 'https://x.test/a"b.jpg' }}
        players={[]}
        sessions={[]}
      />,
    );
    const backdrop = screen.getByTestId("story-backdrop");
    expect(backdrop.style.backgroundImage).toContain("https://x.test/a%22b.jpg");
    unmount();

    renderWithProviders(
      <StoryDetails story={{ ...story, imageUrl: null }} players={[]} sessions={[]} />,
    );
    expect(screen.queryByTestId("story-backdrop")).not.toBeInTheDocument();
  });

  it("lists the players by name, with an avatar each", () => {
    renderWithProviders(<StoryDetails story={story} players={players} sessions={[]} />);

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
    renderWithProviders(<StoryDetails story={story} players={[]} sessions={[]} />);

    expect(within(section("Players")).getByText("No players yet.")).toBeInTheDocument();
    expect(within(section("Players")).queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists the recent sessions with their dates and lengths", () => {
    renderWithProviders(<StoryDetails story={story} players={[]} sessions={sessions} />);

    const items = within(section("Recent sessions")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Mar 20, 2026")).toBeInTheDocument();
    expect(within(items[0]).getByText("2.5 hours")).toBeInTheDocument();
    expect(within(items[1]).getByText("1 hour")).toBeInTheDocument();
  });

  it("says so when there are no sessions yet", () => {
    renderWithProviders(<StoryDetails story={story} players={[]} sessions={[]} />);

    expect(within(section("Recent sessions")).getByText("No sessions yet.")).toBeInTheDocument();
  });
});
