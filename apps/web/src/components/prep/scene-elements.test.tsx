import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { PlayItem, PlayStack } from "@/lib/run";

// Two elements, one in each of the scene's stacks.
const zed: PlayItem = {
  key: "PERSON:4",
  kind: "PERSON",
  label: "Zed",
  detail: null,
  imageUrl: null,
  sceneStatus: "READY",
  sceneTags: ["scene"],
};
const abbey: PlayItem = {
  key: "PLACE:5",
  kind: "PLACE",
  label: "Abbey",
  detail: null,
  imageUrl: null,
  sceneStatus: "READY",
  sceneTags: ["elements"],
};
const lantern: PlayItem = {
  key: "THING:6",
  kind: "THING",
  label: "Lantern",
  detail: null,
  imageUrl: null,
  sceneStatus: "READY",
  sceneTags: ["scene"],
};

type StackProps = {
  stack: PlayStack;
  idStoryScene: number | null;
  onCreated: (item: PlayItem) => void;
  onPictureUpChange?: unknown;
  locked?: boolean;
  fullWidth?: boolean;
};

// The run page's stack has tests of its own; this one says what it was
// handed, and its button stands in for the + making a lantern.
const RunPlayStack = mock.fn(
  ({ stack, onCreated, onPictureUpChange, locked, fullWidth }: StackProps) => (
    <section aria-label={stack.title}>
      <p>{stack.items.map((item) => item.label).join(", ") || "Nothing here yet."}</p>
      <p>
        {fullWidth ? "full width" : "own width"}, {onPictureUpChange ? "tack" : "no tack"}
        {locked ? ", locked" : ""}
      </p>
      <button type="button" onClick={() => onCreated(lantern)}>
        New element in {stack.title}
      </button>
    </section>
  ),
);

// Manage stacks has tests of its own; open, its button saves the scene
// stack renamed to "the docks", as the dialog would hand it back.
const RunManageStacksDialog = ({
  open,
  onSaved,
  onClose,
}: {
  open: boolean;
  onSaved: (tags: string[], renames: { from: string; to: string }[]) => void;
  onClose: () => void;
}) =>
  open ? (
    <div role="dialog" aria-label="Manage stacks">
      <button
        type="button"
        onClick={() => {
          onSaved(["elements", "the docks"], [{ from: "scene", to: "the docks" }]);
          onClose();
        }}
      >
        Save stacks
      </button>
    </div>
  ) : null;

let SceneElements: typeof import("./scene-elements").SceneElements;

describe("SceneElements", () => {
  before(async () => {
    mock.module("@/components/run/run-play-stack", { namedExports: { RunPlayStack } });
    mock.module("@/components/run/run-manage-stacks-dialog", {
      namedExports: { RunManageStacksDialog },
    });
    ({ SceneElements } = await import("./scene-elements"));
  });

  it("groups the scene's elements in one stack per tag, the column's width and with no tack", () => {
    renderWithProviders(
      <SceneElements
        idStory={-4}
        idStoryScene={-15}
        initialTags={["elements", "scene"]}
        initialItems={[zed, abbey]}
        locked={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Elements" })).toBeInTheDocument();
    // The column is a region of its own; its stacks are the ones inside it.
    const column = screen.getByRole("region", { name: "Elements" });
    const stacks = within(column).getAllByRole("region");
    expect(stacks.map((stack) => stack.getAttribute("aria-label"))).toEqual(["elements", "scene"]);
    expect(within(stacks[0]).getByText("Abbey")).toBeInTheDocument();
    expect(within(stacks[1]).getByText("Zed")).toBeInTheDocument();
    expect(within(stacks[0]).getByText("full width, no tack")).toBeInTheDocument();
  });

  it("puts everything in the Default stack when the scene has no tags", () => {
    renderWithProviders(
      <SceneElements
        idStory={-4}
        idStoryScene={-15}
        initialTags={[]}
        initialItems={[zed, abbey]}
        locked={false}
      />,
    );

    const stacks = within(screen.getByRole("region", { name: "Elements" })).getAllByRole("region");
    expect(stacks).toHaveLength(1);
    const [only] = stacks;
    expect(only).toHaveAttribute("aria-label", "Default");
    expect(within(only).getByText("Zed, Abbey")).toBeInTheDocument();
  });

  it("adds a new element from a stack's + to the stack it is filed under", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SceneElements
        idStory={-4}
        idStoryScene={-15}
        initialTags={["elements", "scene"]}
        initialItems={[zed, abbey]}
        locked={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New element in scene" }));
    expect(
      within(screen.getByRole("region", { name: "scene" })).getByText("Zed, Lantern"),
    ).toBeInTheDocument();
  });

  it("manages the stacks from the gear in its heading, a renamed one taking its elements", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SceneElements
        idStory={-4}
        idStoryScene={-15}
        initialTags={["elements", "scene"]}
        initialItems={[zed, abbey]}
        locked={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Manage stacks" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Manage stacks" })).getByRole("button", {
        name: "Save stacks",
      }),
    );

    expect(screen.queryByRole("region", { name: "scene" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "the docks" })).getByText("Zed"),
    ).toBeInTheDocument();
  });

  it("tells the stacks when the scene is complete, and has no gear", () => {
    renderWithProviders(
      <SceneElements idStory={-4} idStoryScene={-15} initialTags={[]} initialItems={[]} locked />,
    );
    expect(screen.getByText("full width, no tack, locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage stacks" })).not.toBeInTheDocument();
  });
});
