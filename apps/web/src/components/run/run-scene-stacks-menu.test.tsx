import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { SceneItem } from "@/lib/scene-elements";

const item: SceneItem = {
  key: "PERSON:5",
  idSceneElement: 9,
  kind: "PERSON",
  label: "Dafydd",
  detail: null,
  imageUrl: null,
  sceneTags: ["assets"],
  sceneStatus: "READY",
};

const sa_moveSceneElement = mock.fn(
  async (_story: number, _scene: number, _link: number, _from: string | null, to: string) => ({
    ok: true as const,
    item: { ...item, sceneTags: [to] },
  }),
);

// Zag only selects the highlighted item, and opens with its input modality
// "virtual", so a lone synthetic hover is ignored: the nudge loop
// status-pill.test.tsx uses, moving the pointer until the highlight shows.
async function choose(user: ReturnType<typeof userEvent.setup>, element: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: element, coords: { clientX: step, clientY: step } });
    expect(element).toHaveAttribute("data-highlighted");
  });
  await user.click(element);
}

let RunSceneStacksMenu: typeof import("./run-scene-stacks-menu").RunSceneStacksMenu;

// The pill's own stack is covered from the pill (run-play-pill.test.tsx);
// these are the library's, which opens the panel with no pill and so no
// stack of its own.
describe("RunSceneStacksMenu from the library", () => {
  before(async () => {
    mock.module("@/components/scene-elements/actions", { namedExports: { sa_moveSceneElement } });
    ({ RunSceneStacksMenu } = await import("./run-scene-stacks-menu"));
  });

  beforeEach(() => sa_moveSceneElement.mock.resetCalls());

  const menu = (tags: string[], onMoved: (moved: SceneItem) => void = () => {}) =>
    renderWithProviders(
      <RunSceneStacksMenu
        idStory={-4}
        idStoryScene={-15}
        idSceneElement={9}
        name="Dafydd"
        stacks={["scene", "assets", "weather"]}
        tags={tags}
        stackTag={null}
        onMoved={onMoved}
      />,
    );

  it("moves the element out of the first stack it is filed under, where the tables show it", async () => {
    const u = userEvent.setup();
    const moved = mock.fn((_item: SceneItem) => {});
    menu(["weather", "assets"], moved);

    const button = screen.getByRole("button", { name: "Stack for Dafydd" });
    expect(button).toHaveTextContent("assets");
    await u.click(button);
    const assets = await screen.findByRole("menuitemradio", { name: "assets" });
    expect(assets).toHaveAttribute("aria-checked", "true");
    await choose(u, screen.getByRole("menuitemradio", { name: "scene" }));

    await waitFor(() => expect(moved.mock.callCount()).toBe(1));
    expect(sa_moveSceneElement.mock.calls[0].arguments).toEqual([-4, -15, 9, "assets", "scene"]);
  });

  it("moves an element filed under none out of the first stack, where it is shown", async () => {
    const u = userEvent.setup();
    menu([]);

    const button = screen.getByRole("button", { name: "Stack for Dafydd" });
    expect(button).toHaveTextContent("scene");
    await u.click(button);
    await choose(u, await screen.findByRole("menuitemradio", { name: "weather" }));

    await waitFor(() => expect(sa_moveSceneElement.mock.callCount()).toBe(1));
    expect(sa_moveSceneElement.mock.calls[0].arguments).toEqual([-4, -15, 9, "scene", "weather"]);
  });

  it("does nothing when the stack it is in is chosen again", async () => {
    const u = userEvent.setup();
    menu(["assets"]);

    await u.click(screen.getByRole("button", { name: "Stack for Dafydd" }));
    await choose(u, await screen.findByRole("menuitemradio", { name: "assets" }));
    expect(sa_moveSceneElement.mock.callCount()).toBe(0);
  });
});
