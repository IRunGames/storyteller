import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { StoryStatBlockDefinition } from "./actions";
import type { StatBlockDefinition, StatDefinition } from "@/lib/stat-blocks";

const strength: StatDefinition = {
  name: "str",
  label: "Strength",
  type: "pool",
  rack: [],
  computedAs: "",
  visible: true,
  format: "number",
  description: "How hard it hits",
  sticky: false,
  static: false,
  roll: "1d6",
  global: false,
  upDown: false,
  leftRight: false,
  initialRoll: "3d6",
  initialFrom: "",
};

const gameDefinition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [strength],
    },
  ],
  updatedAt: "2026-11-10T12:00:00.000Z",
};

const system = {
  idSystem: -26,
  label: "Cypher System · Numenera (Revised)",
  definition: gameDefinition,
};

const olderCopy: StatBlockDefinition = {
  groups: [{ ...gameDefinition.groups[0], label: "Attributes" }],
  updatedAt: "2026-11-01T12:00:00.000Z",
};

const sa_copySystemStatBlockDefinition = mock.fn(async (_idStory: number) => ({
  ok: true as const,
  copy: { ...gameDefinition, updatedAt: "2026-11-14T09:00:00.000Z" },
}));

let StoryStatBlock: typeof import("./story-stat-block").StoryStatBlock;

const render = (initial: StoryStatBlockDefinition) =>
  renderWithProviders(
    <>
      <StoryStatBlock idStory={-15} initial={initial} mutedColor="fg.muted" />
      <Toaster />
    </>,
  );

describe("StoryStatBlock", () => {
  before(async () => {
    mock.module("./actions", {
      namedExports: { sa_copySystemStatBlockDefinition },
    });
    ({ StoryStatBlock } = await import("./story-stat-block"));
  });

  beforeEach(() => sa_copySystemStatBlockDefinition.mock.resetCalls());
  afterEach(() => toaster.remove());

  it("shows anyone but the storyteller the game's stat block to read, and when it last changed", () => {
    render({ isStoryteller: false, system, copy: null });

    expect(screen.getByRole("region", { name: "Stat block" })).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("Strength")).toBeInTheDocument();
    expect(screen.getByText("Pool · number · rolls 1d6 · starts at 3d6")).toBeInTheDocument();
    expect(screen.getByText("How hard it hits")).toBeInTheDocument();
    expect(screen.getByTestId("stat-block-game")).toHaveTextContent(
      /^Cypher System · Numenera \(Revised\)'s, updated /,
    );
    expect(screen.getByTestId("stat-block-game").querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-11-10T12:00:00.000Z",
    );
    expect(screen.queryByRole("button", { name: /Copy to this story/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Edit/ })).toBeNull();
  });

  it("lets the storyteller copy the game's stat block to the story, then edit it on its own page", async () => {
    const user = userEvent.setup();
    render({ isStoryteller: true, system, copy: null });

    await user.click(screen.getByRole("button", { name: "Copy to this story" }));
    expect(sa_copySystemStatBlockDefinition.mock.calls[0].arguments).toEqual([-15]);
    expect(await screen.findByText("This story has its own stat block.")).toBeInTheDocument();
    expect(screen.getByTestId("stat-block-copy").querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-11-14T09:00:00.000Z",
    );
    expect(screen.getByRole("link", { name: "Edit stat block" })).toHaveAttribute(
      "href",
      "/stories/-15/stat-blocks",
    );
    expect(screen.queryByRole("button", { name: "Copy to this story" })).toBeNull();
    // The copy is newer than the game's, so nothing is flagged.
    expect(screen.queryByText("Newer")).toBeNull();
  });

  it("shows the story's copy in place of the game's, and marks the game's when it has changed since", () => {
    render({ isStoryteller: false, system, copy: olderCopy });

    expect(screen.getByText("Attributes")).toBeInTheDocument();
    expect(screen.queryByText("Stats")).toBeNull();
    expect(screen.getByTestId("stat-block-copy")).toHaveTextContent(/^This story's copy, updated /);
    expect(screen.getByTestId("stat-block-game")).toHaveTextContent(/Newer$/);
    // Only the storyteller may change it.
    expect(screen.queryByRole("button", { name: "Overwrite with the game's" })).toBeNull();
  });

  it("overwrites the storyteller's copy with the game's after asking", async () => {
    const user = userEvent.setup();
    render({ isStoryteller: true, system, copy: olderCopy });

    await user.click(screen.getByRole("button", { name: "Overwrite with the game's" }));
    expect(await screen.findByText("Overwrite this story's stat block?")).toBeInTheDocument();
    expect(sa_copySystemStatBlockDefinition.mock.callCount()).toBe(0);
    await user.click(screen.getByRole("button", { name: "Overwrite" }));

    await waitFor(() => expect(sa_copySystemStatBlockDefinition.mock.callCount()).toBe(1));
    expect(await screen.findByText("Stats")).toBeInTheDocument();
    expect(screen.queryByText("Attributes")).toBeNull();
    expect(screen.queryByText("Newer")).toBeNull();
    expect(
      await screen.findByText("This story's stat block now matches the game's."),
    ).toBeInTheDocument();
  });

  it("says when a refused copy could not be made, and keeps what was there", async () => {
    const user = userEvent.setup();
    sa_copySystemStatBlockDefinition.mock.mockImplementationOnce(
      async () => ({ ok: false, error: "That story is not yours to change." }) as never,
    );
    render({ isStoryteller: true, system, copy: null });

    await user.click(screen.getByRole("button", { name: "Copy to this story" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That story is not yours to change.",
    );
    expect(screen.getByRole("button", { name: "Copy to this story" })).toBeInTheDocument();
  });

  it("says when the game has no stat block, and draws nothing for a story with no game", () => {
    const { unmount } = render({
      isStoryteller: false,
      system: { ...system, definition: { groups: [] } },
      copy: null,
    });
    expect(screen.getByText("No stats yet.")).toBeInTheDocument();
    expect(screen.getByTestId("stat-block-game")).toHaveTextContent(/update date not recorded$/);
    unmount();

    render({ isStoryteller: true, system: null, copy: null });
    expect(screen.queryByRole("region", { name: "Stat block" })).toBeNull();
  });
});
