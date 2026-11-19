import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StorySceneDetail } from "@/lib/scenes";

const scene = (over: Partial<StorySceneDetail>): StorySceneDetail => ({
  idStoryScene: -15,
  idStory: -1,
  idStorySession: -3,
  status: "COMPLETE",
  statusAt: null,
  sceneNumber: 1,
  length: 45,
  title: "Strangers in the morning",
  description: "Three riders at the gate.",
  imageLink: null,
  sessionNumber: 3,
  sessionHeading: "3. Kildealg",
  startedAt: null,
  isStoryteller: true,
  elements: [],
  ...over,
});

const scenes = [
  scene({}),
  scene({
    idStoryScene: -16,
    title: "The king rode out before dawn",
    description: "He did not come back.",
  }),
];
const options = [{ key: "COMPLETE", label: "Complete", description: null, from: [] as string[] }];

// The pills in a scene's folds import the status actions themselves.
const sa_setRowStatus = mock.fn(async (_table: string, _id: number, status: string) => ({
  ok: true as const,
  status,
}));

let SessionScenesAccordion: typeof import("./session-scenes-accordion").SessionScenesAccordion;

describe("SessionScenesAccordion", () => {
  before(async () => {
    mock.module("@/components/status/actions", { namedExports: { sa_setRowStatus } });
    ({ SessionScenesAccordion } = await import("./session-scenes-accordion"));
  });

  it("folds each scene, numbered as played, and opens one to its panel", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <SessionScenesAccordion
        scenes={scenes}
        sceneStatusOptions={options}
        elementStatusOptions={options}
      />,
    );

    expect(screen.getByRole("heading", { name: "Scenes (2)" })).toBeInTheDocument();
    const triggers = screen.getAllByRole("button", { expanded: false });
    expect(triggers.map((t) => t.textContent)).toEqual([
      "1. Strangers in the morningComplete",
      "2. The king rode out before dawnComplete",
    ]);

    await u.click(triggers[1]);
    const region = await screen.findByRole("region", {
      name: /The king rode out before dawn/,
    });
    expect(within(region).getByText("He did not come back.")).toBeInTheDocument();
  });

  it("is not drawn with no scenes", () => {
    renderWithProviders(
      <SessionScenesAccordion scenes={[]} sceneStatusOptions={options} elementStatusOptions={[]} />,
    );
    expect(screen.queryByRole("heading", { name: /Scenes/ })).not.toBeInTheDocument();
  });
});
