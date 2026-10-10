import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { RunPlaySpace, RunScene } from "@/lib/run";
import type { StatusOption } from "@/lib/status";

const options: StatusOption[] = [
  { key: "PENDING", label: "Pending", description: null, from: null },
  { key: "ACTIVE", label: "Active", description: null, from: null },
  { key: "COMPLETE", label: "Complete", description: null, from: null },
];

const scenes: RunScene[] = [
  { idStoryScene: 1, title: "The docks", status: "ACTIVE" },
  { idStoryScene: 2, title: "The abbey", status: "PENDING" },
  { idStoryScene: 3, title: "The crossing", status: "COMPLETE" },
];

const spaceFor = (scene: RunScene): RunPlaySpace => ({
  scene: { ...scene, status: "ACTIVE" },
  tags: [],
  coverUrl: null,
  inPlay: [],
});

const sa_listRunScenes = mock.fn(async (_idStory: number) => scenes);
const sa_loadRunScene = mock.fn(async (_idStory: number, idStoryScene: number) => ({
  ok: true as const,
  space: spaceFor(scenes.find((scene) => scene.idStoryScene === idStoryScene)!),
}));
const sa_createRunScene = mock.fn(
  async (
    _idStory: number,
    input: { title: string; description: string },
  ): Promise<
    { ok: true; space: RunPlaySpace } | { ok: false; errors: Record<string, string> }
  > => ({
    ok: true,
    space: spaceFor({ idStoryScene: 9, title: input.title, status: "ACTIVE" }),
  }),
);

let RunSceneSelect: typeof import("./run-scene-select").RunSceneSelect;

// The menu selects only the highlighted item, and a single synthetic hover
// does not reliably highlight it; see the logout test in app-header.test.tsx.
async function choose(user: ReturnType<typeof userEvent.setup>, name: string | RegExp) {
  const item = await screen.findByRole("menuitem", { name });
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

describe("RunSceneSelect", () => {
  before(async () => {
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: { sa_listRunScenes, sa_loadRunScene, sa_createRunScene },
    });
    ({ RunSceneSelect } = await import("./run-scene-select"));
  });

  beforeEach(() => {
    sa_listRunScenes.mock.resetCalls();
    sa_loadRunScene.mock.resetCalls();
    sa_createRunScene.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  function render(
    { hasSession = true, scene = scenes[0] as RunScene | null } = {},
    onLoaded: (space: RunPlaySpace) => void = () => {},
  ) {
    return renderWithProviders(
      <>
        <RunSceneSelect
          idStory={-4}
          scene={scene}
          hasSession={hasSession}
          statusOptions={options}
          onLoaded={onLoaded}
        />
        <Toaster />
      </>,
    );
  }

  it("names the scene the table is on", () => {
    render();
    expect(screen.getByRole("button", { name: "Scene: The docks" })).toBeEnabled();
  });

  it("is shut while no session is being played", () => {
    render({ hasSession: false, scene: null });
    expect(screen.getByRole("button", { name: "Scene: None" })).toBeDisabled();
  });

  it("offers Create new scene first, then the recent scenes with their status", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));

    await waitFor(() => expect(screen.getAllByRole("menuitem")).toHaveLength(4));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Create new scene",
      "The docksActive",
      "The abbeyPending",
      "The crossingComplete",
    ]);
    expect(sa_listRunScenes.mock.calls[0].arguments).toEqual([-4]);
  });

  it("marks the scene the table is on in the list", async () => {
    const user = userEvent.setup();
    render({ scene: scenes[1] });

    await user.click(screen.getByRole("button", { name: "Scene: The abbey" }));

    await waitFor(() => expect(screen.getAllByRole("menuitem")).toHaveLength(4));
    const current = screen
      .getAllByRole("menuitem")
      .filter((item) => item.getAttribute("aria-current") === "true");
    expect(current.map((item) => item.textContent)).toEqual(["The abbeyPending"]);
  });

  it("loads a pending scene straight away", async () => {
    const user = userEvent.setup();
    const onLoaded = mock.fn<(space: RunPlaySpace) => void>();
    render({}, onLoaded);

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));
    await choose(user, /^The abbey/);

    await waitFor(() => expect(onLoaded.mock.callCount()).toBe(1));
    expect(sa_loadRunScene.mock.calls[0].arguments).toEqual([-4, 2]);
    expect(onLoaded.mock.calls[0].arguments[0].scene?.title).toBe("The abbey");
  });

  it("asks before making a complete scene active again", async () => {
    const user = userEvent.setup();
    const onLoaded = mock.fn<(space: RunPlaySpace) => void>();
    render({}, onLoaded);

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));
    await choose(user, /^The crossing/);

    const confirm = await screen.findByRole("dialog", { name: "Play The crossing again?" });
    expect(sa_loadRunScene.mock.callCount()).toBe(0);
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Play The crossing again?" }),
      ).not.toBeInTheDocument(),
    );
    expect(sa_loadRunScene.mock.callCount()).toBe(0);

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));
    await choose(user, /^The crossing/);
    const again = await screen.findByRole("dialog", { name: "Play The crossing again?" });
    await user.click(within(again).getByRole("button", { name: "Make active" }));

    await waitFor(() => expect(onLoaded.mock.callCount()).toBe(1));
    expect(sa_loadRunScene.mock.calls[0].arguments).toEqual([-4, 3]);
  });

  it("creates a new scene from a dialog and loads it", async () => {
    const user = userEvent.setup();
    const onLoaded = mock.fn<(space: RunPlaySpace) => void>();
    render({}, onLoaded);

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));
    await choose(user, "Create new scene");

    const dialog = await screen.findByRole("dialog", { name: "New scene" });
    await user.click(within(dialog).getByRole("button", { name: "Create scene" }));
    expect(await within(dialog).findByText("Please give the scene a title.")).toBeInTheDocument();
    expect(sa_createRunScene.mock.callCount()).toBe(0);

    await user.type(within(dialog).getByRole("textbox", { name: /^Title/ }), "The ambush");
    await user.click(within(dialog).getByRole("button", { name: "Create scene" }));

    await waitFor(() => expect(onLoaded.mock.callCount()).toBe(1));
    expect(sa_createRunScene.mock.calls[0].arguments).toEqual([
      -4,
      { title: "The ambush", description: "" },
    ]);
    expect(onLoaded.mock.calls[0].arguments[0].scene?.title).toBe("The ambush");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New scene" })).not.toBeInTheDocument(),
    );
  });
});
