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
  { idStoryScene: 3, title: "The crossing", status: "COMPLETE", sessionHeading: "3. Kildealg" },
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
    overrides: Pick<Parameters<typeof RunSceneSelect>[0], "onChoose" | "create"> = {},
  ) {
    return renderWithProviders(
      <>
        <RunSceneSelect
          idStory={-4}
          scene={scene}
          hasSession={hasSession}
          statusOptions={options}
          onLoaded={onLoaded}
          {...overrides}
        />
        <Toaster />
      </>,
    );
  }

  it("names the scene the table is on, in its tooltip rather than on the button", async () => {
    const user = userEvent.setup();
    render();
    const button = screen.getByRole("button", { name: "Scene: The docks" });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent(/^Scene$/);
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("The docks");
  });

  it("with no session being played, lists the scenes without letting one be chosen, but makes a new one", async () => {
    const user = userEvent.setup();
    const onLoaded = mock.fn<(space: RunPlaySpace) => void>();
    render({ hasSession: false, scene: null }, onLoaded);

    await user.click(screen.getByRole("button", { name: "Scene: None" }));
    const docks = await screen.findByRole("menuitem", { name: /The docks/ });
    expect(docks).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: "Create new scene" })).not.toHaveAttribute(
      "data-disabled",
    );

    await choose(user, "Create new scene");
    const dialog = await screen.findByRole("dialog", { name: "New scene" });
    await user.type(within(dialog).getByRole("textbox", { name: /^Title/ }), "Between sessions");
    await user.click(within(dialog).getByRole("button", { name: "Create scene" }));
    await waitFor(() => expect(onLoaded.mock.callCount()).toBe(1));
    expect(sa_loadRunScene.mock.callCount()).toBe(0);
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
      // The sitting it was played in, under its title.
      "The crossing3. KildealgComplete",
    ]);
    expect(sa_listRunScenes.mock.calls[0].arguments).toEqual([-4]);
  });

  it("offers a preview of each scene in another tab, apart from choosing it", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));
    await waitFor(() => expect(screen.getAllByRole("menuitem")).toHaveLength(4));

    const previews = screen.getAllByRole("link", { name: /^Preview / });
    expect(previews.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Preview The docks",
      "Preview The abbey",
      "Preview The crossing",
    ]);
    expect(previews.map((link) => link.getAttribute("href"))).toEqual([
      "/preview/scene/1",
      "/preview/scene/2",
      "/preview/scene/3",
    ]);
    for (const link of previews) expect(link).toHaveAttribute("target", "_blank");
    // Beside the item, not in it, so the item's own name is the scene's.
    expect(screen.getByRole("menuitem", { name: /^The abbey/ })).not.toContainElement(previews[1]);
    await user.hover(previews[1]);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Preview in a new tab");
    expect(sa_loadRunScene.mock.callCount()).toBe(0);
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

  it("loads a complete scene straight away, without asking", async () => {
    const user = userEvent.setup();
    const onLoaded = mock.fn<(space: RunPlaySpace) => void>();
    render({}, onLoaded);

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));
    await choose(user, /^The crossing/);

    await waitFor(() => expect(onLoaded.mock.callCount()).toBe(1));
    expect(sa_loadRunScene.mock.calls[0].arguments).toEqual([-4, 3]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("hands a chosen scene and a new one to the page's own handlers instead, session or not", async () => {
    const user = userEvent.setup();
    const onChoose = mock.fn<(scene: RunScene) => void>();
    const create = mock.fn(async (_idStory: number, values: { title: string }) => ({
      ok: true as const,
      space: spaceFor({ idStoryScene: 10, title: values.title, status: "PENDING" }),
    }));
    const onLoaded = mock.fn<(space: RunPlaySpace) => void>();
    render({ hasSession: false }, onLoaded, { onChoose, create });

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));
    await choose(user, /The abbey/);
    expect(onChoose.mock.calls[0].arguments[0].idStoryScene).toBe(2);
    expect(sa_loadRunScene.mock.callCount()).toBe(0);

    await user.click(screen.getByRole("button", { name: "Scene: The docks" }));
    await choose(user, "Create new scene");
    const dialog = await screen.findByRole("dialog", { name: "New scene" });
    await user.type(within(dialog).getByRole("textbox", { name: /^Title/ }), "To prepare");
    await user.click(within(dialog).getByRole("button", { name: "Create scene" }));
    await waitFor(() => expect(onLoaded.mock.callCount()).toBe(1));
    expect(create.mock.calls[0].arguments).toEqual([-4, { title: "To prepare", description: "" }]);
    expect(sa_createRunScene.mock.callCount()).toBe(0);
  });
});
