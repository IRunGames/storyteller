import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { UnfinishedSession } from "@/app/(app)/(nav)/play/actions";

let PlayPicker: typeof import("./play-picker").PlayPicker;

const stories = [
  { idStory: 7, title: "Something Wicked", isOwner: true },
  { idStory: 9, title: "The Devil's Spine", isOwner: false },
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

  it("offers the storyteller a new session or one not yet done", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "My Story..." }), "7");

    const session = screen.getByRole("combobox", { name: "Session" });
    expect(session).toHaveValue("");
    expect(screen.getByRole("option", { name: "Create new session" })).toHaveValue("");
    expect(
      await screen.findByRole("option", { name: "4. The Drowned Gate · Suspended" }),
    ).toHaveValue("31");
    expect(screen.getByRole("option", { name: "Session 3 · In progress" })).toHaveValue("30");
    expect(sa_listUnfinishedSessions.mock.calls[0].arguments).toEqual([7]);
  });

  it("holds Play until the sessions have loaded", async () => {
    let finish: (list: UnfinishedSession[]) => void = () => {};
    sa_listUnfinishedSessions.mock.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "My Story..." }), "7");
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();

    finish(unfinished);
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeEnabled());
  });

  it("starts the chosen session, or a new one by default", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "My Story..." }), "7");
    await screen.findByRole("option", { name: "4. The Drowned Gate · Suspended" });

    await user.click(screen.getByRole("button", { name: "Play" }));
    // Titled with the browser's own day.
    const today = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
    expect(sa_startPlaying.mock.calls[0].arguments).toEqual([7, null, `${today} session`]);

    await user.selectOptions(screen.getByRole("combobox", { name: "Session" }), "31");
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(sa_startPlaying.mock.calls[1].arguments.slice(0, 2)).toEqual([7, 31]);
  });

  it("keeps a refusal on the page", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "My Story..." }), "7");
    await screen.findByRole("option", { name: "4. The Drowned Gate · Suspended" });

    await user.click(screen.getByRole("button", { name: "Play" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Refused.");
  });

  it("links a player straight to the table, with no session to choose", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayPicker stories={stories} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "My Story..." }), "9");

    expect(screen.queryByRole("combobox", { name: "Session" })).not.toBeInTheDocument();
    const play = screen.getByRole("link", { name: "Play" });
    expect(play).toHaveAttribute("href", "/play/9");
    expect(play.querySelector(".lucide-play")).toBeInTheDocument();
    expect(sa_listUnfinishedSessions.mock.callCount()).toBe(0);
  });

  it("points at the new-story form when there is nothing to play", () => {
    renderWithProviders(<PlayPicker stories={[]} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "start one" })).toHaveAttribute(
      "href",
      "/stories/new",
    );
  });
});
