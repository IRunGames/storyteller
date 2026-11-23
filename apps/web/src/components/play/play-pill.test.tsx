import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import type { SceneItem } from "@/lib/scene-elements";

// The pill's actions, none of which these tests press.
const sa_untapPlaySceneElement = mock.fn(async () => ({ ok: true }));

let PlayPill: typeof import("./play-pill").PlayPill;

const goblin = (over: Partial<SceneItem> = {}): SceneItem => ({
  key: "PERSON:5:9",
  kind: "PERSON",
  label: "Goblin 1",
  detail: null,
  imageUrl: null,
  sceneTags: ["scene"],
  sceneStatus: "READY",
  idSceneElement: 9,
  showInfo: false,
  ...over,
});

const pill = (item: SceneItem) => (
  <PlayPill
    idStory={1}
    idStoryScene={2}
    item={item}
    onNotesChange={() => {}}
    onStatusChange={() => {}}
  />
);

describe("PlayPill", () => {
  before(async () => {
    mock.module("@/components/play/actions", {
      namedExports: { sa_untapPlaySceneElement, sa_setPlayElementNotes: mock.fn() },
    });
    mock.module("@/components/annotations/actions", {
      namedExports: { sa_getScenePicture: mock.fn(async () => null) },
    });
    ({ PlayPill } = await import("./play-pill"));
  });

  it("shows the players a drop by the name, colored by the link's health and nothing more", () => {
    renderWithProviders(pill(goblin({ health: 0 })));
    const drop = screen.getByRole("img", { name: "Health 0%" });
    expect(drop.querySelector("svg")!.getAttribute("fill")).toBe(
      "color-mix(in oklab, white 0%, var(--chakra-colors-run-health-empty))",
    );
    expect(screen.getByText("Goblin 1")).toBeInTheDocument();
  });

  it("draws no drop for an element with no health to show", () => {
    renderWithProviders(pill(goblin()));
    expect(screen.queryByRole("img", { name: /^Health/ })).not.toBeInTheDocument();
  });
});
