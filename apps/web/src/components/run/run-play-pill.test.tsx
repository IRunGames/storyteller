import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { PlayItem, SceneElementDetail } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import type { SetSceneElementShownResult } from "@/app/(app)/run/[id]/actions";

const sa_setSceneElementShown = mock.fn(
  async (
    _story: number,
    _scene: number,
    _element: number,
    shown: boolean,
  ): Promise<SetSceneElementShownResult> => ({
    ok: true,
    status: shown ? "READY" : "INVISIBLE",
  }),
);

const detail: SceneElementDetail = {
  element: {
    idElement: 5,
    kind: "PERSON",
    name: "Dafydd",
    initialName: "A hooded figure",
    title: "Shell seller",
    description: "Sells shells.\nKnows the tides.",
    notes: null,
    status: "READY",
    tags: ["harbour"],
  },
  link: {
    idSceneElement: 9,
    status: "INITIAL",
    tags: ["scene"],
    createdAt: new Date("2026-10-08T12:00:00Z"),
  },
};
const sa_getSceneElementDetail = mock.fn(
  async (_story: number, _scene: number, _element: number) => detail,
);

const linked = (sceneStatus: string): PlayItem => ({
  key: "PERSON:5",
  kind: "PERSON",
  label: "A hooded figure",
  detail: "Shell seller",
  imageUrl: null,
  sceneTags: ["scene"],
  sceneStatus,
});

// Every status may move to any other, as both workflows allow.
const options = (keys: string[]): StatusOption[] =>
  keys.map((key) => ({
    key,
    label: key.charAt(0) + key.slice(1).toLowerCase(),
    description: null,
    from: null,
  }));
const sa_listStatusOptions = mock.fn(async (table: string) =>
  table === "scene_elements"
    ? options(["INITIAL", "INVISIBLE", "READY", "DISABLED"])
    : options(["PENDING", "READY", "INACTIVE"]),
);
const sa_setRowStatus = mock.fn(async (_table: string, _id: number, status: string) => ({
  ok: true as const,
  status,
}));

// Zag only selects the highlighted item, and opens with its input modality
// "virtual", so a lone synthetic hover is ignored: the nudge loop
// status-pill.test.tsx uses, moving the pointer until the highlight shows.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

const sa_updateSceneElement = mock.fn(
  async (_story: number, _scene: number, _element: number, values: Record<string, string>) => ({
    ok: true as const,
    item: {
      ...linked(values.sceneStatus),
      label: values.initialName || values.name,
      detail: values.title || null,
      ...(values.initialName ? { realName: values.name } : {}),
    },
  }),
);

const sa_moveSceneElement = mock.fn(
  async (_story: number, _scene: number, _element: number, _from: string | null, to: string) => ({
    ok: true as const,
    item: { ...linked("INITIAL"), sceneTags: [to] },
  }),
);

let RunPlayPill: typeof import("./run-play-pill").RunPlayPill;

describe("RunPlayPill", () => {
  before(async () => {
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: {
        sa_setSceneElementShown,
        sa_getSceneElementDetail,
        sa_updateSceneElement,
        sa_moveSceneElement,
      },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions, sa_setRowStatus },
    });
    ({ RunPlayPill } = await import("./run-play-pill"));
  });

  beforeEach(() => {
    sa_setSceneElementShown.mock.resetCalls();
    sa_getSceneElementDetail.mock.resetCalls();
    sa_setRowStatus.mock.resetCalls();
    sa_updateSceneElement.mock.resetCalls();
    sa_moveSceneElement.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  // The pill as the table holds it: its status in state, so the eye's
  // change shows.
  function Holder({
    start,
    idStoryScene,
    otherStacks,
  }: {
    start: PlayItem;
    idStoryScene: number | null;
    otherStacks: string[];
  }) {
    const [item, setItem] = useState(start);
    return (
      <RunPlayPill
        idStory={-4}
        idStoryScene={idStoryScene}
        item={item}
        stackTag="scene"
        otherStacks={otherStacks}
        onRemove={() => {}}
        onItemChange={setItem}
        onStatusChange={(_key, sceneStatus) => setItem((current) => ({ ...current, sceneStatus }))}
      />
    );
  }

  const render = (
    item: PlayItem,
    idStoryScene: number | null = -15,
    otherStacks: string[] = ["assets"],
  ) =>
    renderWithProviders(
      <>
        <Holder start={item} idStoryScene={idStoryScene} otherStacks={otherStacks} />
        <Toaster />
      </>,
    );

  it("hides a shown element from the players with its eye, and shows it again", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("INITIAL"));

    await u.click(screen.getByRole("button", { name: "Hide A hooded figure from the players" }));
    await waitFor(() =>
      expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
        "data-scene-status",
        "INVISIBLE",
      ),
    );
    expect(sa_setSceneElementShown.mock.calls[0].arguments).toEqual([-4, -15, 5, false]);

    await u.click(screen.getByRole("button", { name: "Show A hooded figure to the players" }));
    await waitFor(() =>
      expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
        "data-scene-status",
        "READY",
      ),
    );
    expect(sa_setSceneElementShown.mock.calls[1].arguments).toEqual([-4, -15, 5, true]);
  });

  it("puts a lock in the eye's place on a disabled element, which unlocks it to READY", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("DISABLED"));
    expect(
      within(container).queryByRole("button", { name: /from the players$/ }),
    ).not.toBeInTheDocument();

    await u.click(within(container).getByRole("button", { name: "Unlock A hooded figure" }));

    await waitFor(() =>
      expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
        "data-scene-status",
        "READY",
      ),
    );
    expect(sa_setSceneElementShown.mock.calls[0].arguments).toEqual([-4, -15, 5, true]);
    expect(
      within(container).getByRole("button", { name: "Hide A hooded figure from the players" }),
    ).toBeInTheDocument();
  });

  it("puts the status back and says so when the eye is refused", async () => {
    const u = userEvent.setup();
    sa_setSceneElementShown.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That element is not in this scene.",
    }));
    const { container } = render(linked("READY"));

    await u.click(screen.getByRole("button", { name: "Hide A hooded figure from the players" }));

    expect(await screen.findByText("That element is not in this scene.")).toBeInTheDocument();
    expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
      "data-scene-status",
      "READY",
    );
  });

  it("draws a hidden element with a border and glow, and a disabled one in grey italics", () => {
    const hidden = render(linked("INVISIBLE"));
    const hiddenPill = hidden.container.querySelector("[data-scene-status]");
    expect(hiddenPill).toHaveStyle({ borderWidth: "2px" });
    expect(getComputedStyle(hiddenPill!).boxShadow).toContain("run-hidden");
    hidden.unmount();

    const disabled = render(linked("DISABLED"));
    expect(within(disabled.container).getByText("A hooded figure").parentElement).toHaveStyle({
      fontStyle: "italic",
    });
    expect(disabled.container.querySelector("[data-scene-status]")).not.toHaveStyle({
      borderWidth: "2px",
    });
  });

  it("shows the element and its place in the scene from the info button", async () => {
    const u = userEvent.setup();
    render(linked("INITIAL"));

    await u.click(screen.getByRole("button", { name: "About A hooded figure" }));

    const popover = await screen.findByRole("dialog", { name: "Dafydd" });
    expect(await within(popover).findByText("Person")).toBeInTheDocument();
    expect(within(popover).getByText("A hooded figure")).toBeInTheDocument();
    expect(within(popover).getByText(/Knows the tides/)).toBeInTheDocument();
    expect(within(popover).getByText("harbour")).toBeInTheDocument();
    expect(within(popover).getByText("scene")).toBeInTheDocument();
    // Added says when, to the minute, not only the day.
    expect(
      within(popover).getByText(/^Oct \d{1,2}, 2026, \d{1,2}:\d{2}\s[AP]M/),
    ).toBeInTheDocument();
    // Name, title, description and notes are always listed, a dash for none.
    expect(within(popover).getByText("Name")).toBeInTheDocument();
    expect(within(popover).getByText("Notes")).toBeInTheDocument();
    expect(within(popover).getByText("—")).toBeInTheDocument();
    expect(sa_getSceneElementDetail.mock.calls[0].arguments).toEqual([-4, -15, 5]);

    // Both statuses are pills to move, the scene element's first.
    const pills = within(popover)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("data-status"));
    expect(pills.map((pill) => pill.textContent)).toEqual(["Initial", "Ready"]);
  });

  it("moves the scene element's status from the popover, and the pill follows", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("INITIAL"));

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("dialog", { name: "Dafydd" });
    await u.click(await within(popover).findByRole("button", { name: "Initial" }));
    await choose(u, await screen.findByRole("menuitem", { name: /Disabled/ }));

    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(1));
    await waitFor(() =>
      expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
        "data-scene-status",
        "DISABLED",
      ),
    );
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["scene_elements", 9, "DISABLED"]);
  });

  it("moves the element's own status from the popover", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("INITIAL"));

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("dialog", { name: "Dafydd" });
    await u.click(await within(popover).findByRole("button", { name: "Ready" }));
    await choose(u, await screen.findByRole("menuitem", { name: /Inactive/ }));

    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(1));
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["elements", 5, "INACTIVE"]);
    // The scene element's pill is left as it was.
    expect(container.querySelector("[data-scene-status]")).toHaveAttribute(
      "data-scene-status",
      "INITIAL",
    );

    // The pencil's form starts from the status just chosen, so saving it
    // does not put the old one back.
    await u.click(within(popover).getByRole("button", { name: "Edit Dafydd" }));
    expect(await within(popover).findByRole("combobox", { name: "Status" })).toHaveValue(
      "INACTIVE",
    );
  });

  it("moves the element to another stack from the bottom of its popover", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("INITIAL"), -15, ["assets", "weather"]);

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("dialog", { name: "Dafydd" });
    const moveTo = await within(popover).findByRole("combobox", { name: "Move to" });
    expect(
      within(moveTo)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Choose a stack", "assets", "weather"]);
    expect(within(popover).getByRole("separator")).toBeInTheDocument();

    await u.selectOptions(moveTo, "weather");

    await waitFor(() => expect(sa_moveSceneElement.mock.callCount()).toBe(1));
    expect(sa_moveSceneElement.mock.calls[0].arguments).toEqual([-4, -15, 5, "scene", "weather"]);
  });

  it("offers no Move to when the scene has no other stack", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("INITIAL"), -15, []);

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("dialog", { name: "Dafydd" });
    await within(popover).findByText("Person");
    expect(within(popover).queryByRole("combobox", { name: "Move to" })).not.toBeInTheDocument();
  });

  it("edits the element from the popover's pencil, and the pill follows", async () => {
    const u = userEvent.setup();
    const { container } = render(linked("INITIAL"));

    await u.click(within(container).getByRole("button", { name: "About A hooded figure" }));
    const popover = await screen.findByRole("dialog", { name: "Dafydd" });
    await u.click(await within(popover).findByRole("button", { name: "Edit Dafydd" }));

    // The create form, filled in with the element as it is.
    const name = await within(popover).findByRole("textbox", { name: /^Name/ });
    expect(name).toHaveValue("Dafydd");
    expect(within(popover).getByRole("textbox", { name: /^Initial name/ })).toHaveValue(
      "A hooded figure",
    );
    expect(
      within(popover).getByRole("button", { name: "In this scene: Initial" }),
    ).toBeInTheDocument();
    await u.clear(within(popover).getByRole("textbox", { name: /^Initial name/ }));
    await u.click(within(popover).getByRole("button", { name: "Save element" }));

    await waitFor(() => expect(sa_updateSceneElement.mock.callCount()).toBe(1));
    expect(sa_updateSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      5,
      {
        kind: "PERSON",
        name: "Dafydd",
        initialName: "",
        title: "Shell seller",
        description: "Sells shells.\nKnows the tides.",
        notes: "",
        status: "READY",
        sceneStatus: "INITIAL",
      },
    ]);
    // With no initial name the pill goes by the name.
    expect(await within(container).findByText("Dafydd")).toBeInTheDocument();
  });

  it("bolds an initial name in the second highlight, with the real name in a tooltip", async () => {
    const u = userEvent.setup();
    const { container } = render({ ...linked("INITIAL"), realName: "Dafydd" });

    const name = within(container).getByText("A hooded figure");
    // jsdom leaves the weight and colour as Chakra's token variables.
    expect(getComputedStyle(name).fontWeight).toContain("bold");
    expect(getComputedStyle(name.parentElement!).color).toContain("run-initial-name");
    // A screen reader hears the real name after the initial one.
    expect(name.parentElement).toHaveTextContent("A hooded figure, real name Dafydd");

    // Pointing at the name itself, not only the icon, gives the real name.
    await u.hover(name);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Dafydd");
  });

  it("shows a name that is not an initial name plainly, with no reveal icon", () => {
    const { container } = render({ ...linked("INITIAL"), label: "Dafydd" });

    expect(getComputedStyle(within(container).getByText("Dafydd")).fontWeight).toContain("medium");
    expect(within(container).queryByText(/real name/)).not.toBeInTheDocument();
  });

  it("gives something the page alone holds no eye and no info", () => {
    render({ key: "PERSON:5", kind: "PERSON", label: "Dafydd", detail: null, imageUrl: null });

    expect(screen.queryByRole("button", { name: /players$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^About / })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Dafydd from the play space" }),
    ).toBeInTheDocument();
  });
});
