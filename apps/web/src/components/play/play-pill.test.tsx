import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

  // The players' copy of a picture nothing has been revealed of is a plain
  // block of the fog's color, so the pill says what it is.
  it("says a picture covered in fog is covered, and nothing over one that shows something", () => {
    const { unmount } = renderWithProviders(
      pill(goblin({ imageUrl: "https://x.test/copy.webp", fogCovered: true })),
    );
    expect(screen.getByText("Image is covered in fog")).toBeInTheDocument();
    unmount();

    renderWithProviders(pill(goblin({ imageUrl: "https://x.test/copy.webp" })));
    expect(screen.getByRole("button", { name: "Preview Goblin 1" })).toBeInTheDocument();
    expect(screen.queryByText("Image is covered in fog")).not.toBeInTheDocument();
  });

  // The storyteller's preview page hands the pill what the players' table
  // never does: that its picture has fog on it, for the preview's bottom bar.
  it("marks a picture with fog active FOG OF WAR ACTIVE in its preview, never on the pill", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(
      pill(goblin({ imageUrl: "https://x.test/copy.webp", fogActive: true })),
    );
    expect(screen.queryByText("FOG OF WAR ACTIVE")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview Goblin 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Goblin 1" });
    expect(within(dialog).getByText("FOG OF WAR ACTIVE")).toBeInTheDocument();
    unmount();

    renderWithProviders(pill(goblin({ imageUrl: "https://x.test/copy.webp" })));
    await user.click(screen.getByRole("button", { name: "Preview Goblin 1" }));
    await screen.findByRole("dialog", { name: "Goblin 1" });
    expect(screen.queryByText("FOG OF WAR ACTIVE")).not.toBeInTheDocument();
  });
});
