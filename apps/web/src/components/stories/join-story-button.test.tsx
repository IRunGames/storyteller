import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { StoryPlayer } from "@/lib/stories";

const me: StoryPlayer = { idUser: "u-me", name: "Viewer", image: null };

type Result = { ok: true; player: StoryPlayer } | { ok: false; error: string };
const sa_joinStory = mock.fn<(idStory: number) => Promise<Result>>(async () => ({
  ok: true,
  player: me,
}));
const router = { refresh: mock.fn<() => void>() };

let JoinStoryButton: typeof import("./join-story-button").JoinStoryButton;

describe("JoinStoryButton", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", { namedExports: { sa_joinStory } });
    mock.module("next/navigation", { namedExports: { useRouter: () => router } });
    ({ JoinStoryButton } = await import("./join-story-button"));
  });

  beforeEach(() => {
    sa_joinStory.mock.resetCalls();
    sa_joinStory.mock.mockImplementation(async () => ({ ok: true, player: me }));
    router.refresh.mock.resetCalls();
  });

  afterEach(() => toaster.remove());

  function render(onJoined: (player: StoryPlayer) => void = () => {}) {
    return renderWithProviders(
      <>
        <JoinStoryButton idStory={-6} onJoined={onJoined} />
        <Toaster />
      </>,
    );
  }

  it("joins at once, hands the list the new seat, refreshes the page and says so", async () => {
    const joined: StoryPlayer[] = [];
    render((player) => joined.push(player));

    const button = screen.getByRole("button", { name: "Join" });
    expect(button.querySelector(".lucide-log-in")).toBeInTheDocument();
    await userEvent.setup().click(button);

    await waitFor(() => expect(joined).toEqual([me]));
    expect(sa_joinStory.mock.calls[0].arguments).toEqual([-6]);
    expect(router.refresh.mock.callCount()).toBe(1);
    expect(await screen.findByText("You have joined the game.")).toBeInTheDocument();
  });

  it("says why when the action refuses, and joins nothing", async () => {
    sa_joinStory.mock.mockImplementation(async () => ({
      ok: false,
      error: "This story is not open for you to join.",
    }));
    const joined: StoryPlayer[] = [];
    render((player) => joined.push(player));

    await userEvent.setup().click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByText("This story is not open for you to join.")).toBeInTheDocument();
    expect(joined).toEqual([]);
    // The page catches up with why: the story has stopped looking, say.
    expect(router.refresh.mock.callCount()).toBe(1);
  });
});
