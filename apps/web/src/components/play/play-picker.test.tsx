import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { PlayableStory, UnfinishedSession } from "@/app/(app)/(nav)/play/actions";

let PlayPicker: typeof import("./play-picker").PlayPicker;

const counts = { hasOpenSession: false, waitingCount: 0, presentCount: 0 };
const stories: PlayableStory[] = [
  { idStory: 7, title: "Something Wicked", isOwner: true, ...counts },
  { idStory: 9, title: "The Devil's Spine", isOwner: false, ...counts },
  // Two players waiting for the storyteller, for Play's count and glow.
  { idStory: 11, title: "Ashes", isOwner: true, ...counts, waitingCount: 2 },
];

const unfinished: UnfinishedSession[] = [
  { idStorySession: 31, number: 4, title: "The Drowned Gate", status: "SUSPENDED" },
  { idStorySession: 30, number: 3, title: null, status: "OPEN" },
];

const sa_listUnfinishedSessions = mock.fn(async (_idStory: number) => unfinished);
const sa_startPlaying = mock.fn<
  (
    idStory: number,
    idStorySession: number | null,
    title?: string,
  ) => Promise<{ ok: false; error: string }>
>(async () => ({ ok: false, error: "Refused." }));

describe("PlayPicker", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/play/actions", {
      namedExports: { sa_listUnfinishedSessions, sa_startPlaying },
    });
    ({ PlayPicker } = await import("./play-picker"));
  });

  beforeEach(() => {
    sa_listUnfinishedSessions.mock.resetCalls();
    sa_listUnfinishedSessions.mock.mockImplementation(async () => unfinished);
    sa_startPlaying.mock.resetCalls();
  });

  it("lists the stories in a labelled select with nothing chosen", () => {
    renderWithProviders(<PlayPicker stories={stories} />);

    const select = screen.getByRole("combobox", { name: "My Story..." });
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose a story" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Something Wicked" })).toHaveValue("7");
    expect(screen.getByRole("option", { name: "The Devil's Spine" })).toHaveValue("9");
    expect(screen.queryByRole("combobox", { name: "Session" })).not.toBeInTheDocument();
  });

  it("keeps Play disabled, with its icon, until a story is chosen", () => {
    renderWithProviders(<PlayPicker stories={stories} />);

    const play = screen.getByRole("button", { name: "Play" });
    expect(play).toBeDisabled();
    expect(play.querySelector(".lucide-play")).toBeInTheDocument();
  });

  it("opens the storyteller's session popover from Play, as a story card does", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "My Story..." }), "7");
    // No Session select on the page any more: the popover holds it.
    expect(screen.queryByRole("combobox", { name: "Session" })).not.toBeInTheDocument();
    const play = screen.getByRole("button", { name: "Play" });
    expect(play).toBeEnabled();
    expect(play).toHaveTextContent(/^Play$/);

    await user.click(play);
    const ask = await screen.findByRole("dialog", { name: "Play Something Wicked" });
    expect(sa_listUnfinishedSessions.mock.calls[0].arguments).toEqual([7]);
    const session = within(ask).getByRole("combobox", { name: "Session" });
    // On the session most recently touched, as the card's popover starts.
    await waitFor(() => expect(session).toHaveValue("31"));
    expect(within(ask).getByRole("option", { name: "Session 3 · In progress" })).toHaveValue("30");

    await user.selectOptions(session, "");
    await user.click(within(ask).getByRole("button", { name: "Start" }));
    // Titled with the browser's own day.
    const today = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
    await waitFor(() =>
      expect(sa_startPlaying.mock.calls[0]?.arguments).toEqual([7, null, `${today} session`]),
    );
    expect(await within(ask).findByRole("alert")).toHaveTextContent("Refused.");
  });

  it("counts and glows for a story with players waiting", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "My Story..." }), "11");
    const play = screen.getByRole("button", { name: "Play, 2 players waiting" });
    expect(play).toHaveTextContent("Play (2)");
    expect(play.style.boxShadow || getComputedStyle(play).boxShadow).not.toBe("");
  });

  it("links a player straight to the table, with no session to choose", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "My Story..." }), "9");

    const play = screen.getByRole("link", { name: "Play" });
    expect(play).toHaveAttribute("href", "/play/9");
    expect(play.querySelector(".lucide-play")).toBeInTheDocument();
    expect(sa_listUnfinishedSessions.mock.callCount()).toBe(0);
  });

  it("points at the new-story form when there is nothing to play", () => {
    renderWithProviders(<PlayPicker stories={[]} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "start one" })).toHaveAttribute("href", "/stories/new");
  });
});
