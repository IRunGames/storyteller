import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import {
  carriedGroups,
  defaultFormat,
  evaluateStatBlock,
  type StatBlock,
  type StatBlockDefinition,
  type StatDefinition,
} from "@/lib/stat-blocks";
import type { PlayItem } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import type {
  ElementStatBlock,
  RollAllResult,
  RollStatResult,
  SceneStatBlocks,
} from "@/components/stat-blocks/actions";

const stat = (
  over: Partial<StatDefinition> & Pick<StatDefinition, "name" | "type">,
): StatDefinition => ({
  label: "",
  rack: [],
  connectedTo: "",
  computedAs: "",
  visible: true,
  format: defaultFormat(over.type),
  description: "",
  sticky: false,
  static: false,
  roll: "",
  global: false,
  upDown: true,
  ...over,
});

// Initiative is global and rolls 1d20 with its value; HP is a pool with no roll.
const definition: StatBlockDefinition = {
  groups: [
    {
      name: "combat",
      label: "Combat",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [
        stat({
          name: "init",
          label: "Initiative",
          type: "display",
          format: "number",
          roll: "1d20",
          global: true,
          upDown: true,
        }),
        stat({ name: "hp", label: "HP", type: "pool" }),
      ],
    },
  ],
};

const blockOf = (block: StatBlock): ElementStatBlock => ({
  idSystem: -90,
  label: "Palladium",
  definition,
  stored: true,
  block,
  carried: carriedGroups(definition, block).map((group) => group.name),
  groups: evaluateStatBlock(definition, block),
});

const rows: SceneStatBlocks[] = [
  {
    idSceneElement: 9,
    idElement: 5,
    title: "Dafydd",
    hidden: false,
    blocks: [blockOf({ combat: { init: { value: 3 }, hp: { value: 7, min: 0, max: 10 } } })],
  },
  {
    idSceneElement: 10,
    idElement: 6,
    title: "A hooded figure",
    hidden: true,
    blocks: [blockOf({ combat: { init: { value: 0 }, hp: { value: 4, min: 0, max: 4 } } })],
  },
];

// The table's items: Dafydd's pill shows his title, the figure is invisible.
const items: PlayItem[] = [
  {
    key: "PERSON:5",
    kind: "PERSON",
    label: "The cooper",
    detail: null,
    imageUrl: null,
    idSceneElement: 9,
    sceneStatus: "READY",
  },
  {
    key: "PERSON:6",
    kind: "PERSON",
    label: "A hooded figure",
    detail: null,
    imageUrl: null,
    idSceneElement: 10,
    sceneStatus: "INVISIBLE",
  },
];

const sa_getSceneStatBlocks = mock.fn(
  async (_idStory: number, _idStoryScene: number): Promise<SceneStatBlocks[] | null> => rows,
);
const sa_rollStatForAll = mock.fn(
  async (
    _idStory: number,
    _idStoryScene: number,
    _idSystem: number,
    _group: string,
    _stat: string,
  ): Promise<RollAllResult> => ({
    ok: true,
    rolls: [
      {
        title: "The cooper",
        posted: true,
        idSceneElement: 9,
        roll: {
          notation: "1d20+3",
          label: "for The cooper: Initiative",
          total: 14,
          dice: [],
          detail: "",
        },
      },
      {
        title: "A hooded figure",
        posted: false,
        idSceneElement: 10,
        roll: {
          notation: "1d20",
          label: "for A hooded figure: Initiative",
          total: 9,
          dice: [],
          detail: "",
        },
      },
    ],
  }),
);
const sa_rollStat = mock.fn(async (): Promise<RollStatResult> => ({
  ok: true,
  posted: false,
  roll: {
    notation: "1d20",
    label: "for A hooded figure: Initiative",
    total: 11,
    dice: [],
    detail: "",
  },
}));
const sa_setStat = mock.fn();

// The scene_elements workflow, as the pane reads it: every status may move
// to any other, as it allows.
const sceneOptions: StatusOption[] = ["READY", "INVISIBLE", "TAPPED", "DISABLED"].map((key) => ({
  key,
  label: key.charAt(0) + key.slice(1).toLowerCase(),
  description: null,
  from: null,
}));
const sa_setRowStatus = mock.fn(async (_table: string, _id: number, status: string) => ({
  ok: true as const,
  status,
}));
const sa_listStatusOptions = mock.fn(async () => sceneOptions);
const onStatusChange = mock.fn((_key: string, _status: string) => {});

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

let RunStatsPane: typeof import("./run-stats-pane").RunStatsPane;

function renderPane(idStoryScene: number | null = 3, locked = false) {
  return renderWithProviders(
    <>
      <RunStatsPane
        id="run-panel-stats"
        idStory={-4}
        idStoryScene={idStoryScene}
        items={items}
        locked={locked}
        version={0}
        onStatusChange={onStatusChange}
      />
      <Toaster />
    </>,
  );
}

describe("RunStatsPane", () => {
  before(async () => {
    mock.module("@/components/stat-blocks/actions", {
      namedExports: { sa_getSceneStatBlocks, sa_rollStatForAll, sa_rollStat, sa_setStat },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions, sa_setRowStatus },
    });
    ({ RunStatsPane } = await import("./run-stats-pane"));
  });

  beforeEach(() => {
    sa_setRowStatus.mock.resetCalls();
    sa_listStatusOptions.mock.resetCalls();
    onStatusChange.mock.resetCalls();
    sa_getSceneStatBlocks.mock.resetCalls();
    sa_rollStatForAll.mock.resetCalls();
    sa_rollStat.mock.resetCalls();
  });

  afterEach(() => {
    toaster.dismiss();
  });

  it("lists every element in the scene with a block under its pill's words, marking the invisible", async () => {
    renderPane();

    const pane = screen.getByRole("region", { name: "Stats" });
    const cooper = await within(pane).findByRole("article", { name: "The cooper" });
    expect(sa_getSceneStatBlocks.mock.calls[0].arguments).toEqual([-4, 3]);
    expect(within(cooper).getByText("Initiative")).toBeInTheDocument();
    expect(within(cooper).getByTestId("stat-init")).toHaveValue("3");
    // The system's name is left out; the element's line carries its status,
    // on the scene elements' own workflow, not the scenes'.
    expect(within(cooper).queryByRole("heading")).toBeNull();
    expect(await within(cooper).findByRole("button", { name: "Ready" })).toHaveAttribute(
      "data-status",
      "READY",
    );
    expect(sa_listStatusOptions.mock.calls.map((call) => call.arguments)).toEqual([
      ["scene_elements"],
    ]);
    expect(within(cooper).queryByText("Invisible")).not.toBeInTheDocument();
    const figure = within(pane).getByRole("article", { name: "A hooded figure" });
    expect(within(figure).getByRole("button", { name: "Invisible" })).toHaveAttribute(
      "data-status",
      "INVISIBLE",
    );
    // A pool is spent here as in the element panel.
    expect(within(figure).getByRole("button", { name: "HP down" })).toBeEnabled();
  });

  it("moves an element's scene status from its line and tells the table", async () => {
    const u = userEvent.setup();
    renderPane();

    const pane = screen.getByRole("region", { name: "Stats" });
    const cooper = await within(pane).findByRole("article", { name: "The cooper" });
    await u.click(await within(cooper).findByRole("button", { name: "Ready" }));
    await choose(u, await screen.findByRole("menuitem", { name: /Tapped/ }));

    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(1));
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["scene_elements", 9, "TAPPED"]);
    await waitFor(() => expect(onStatusChange.mock.callCount()).toBe(1));
    expect(onStatusChange.mock.calls[0].arguments).toEqual(["PERSON:5", "TAPPED"]);
  });

  it("opens an element's edit forms from the pencil on its line, and closes with them", async () => {
    const u = userEvent.setup();
    renderPane();

    const pane = screen.getByRole("region", { name: "Stats" });
    const cooper = await within(pane).findByRole("article", { name: "The cooper" });
    // The block draws no pencil of its own: the one pencil is on the line.
    const pencil = within(cooper).getByRole("button", { name: "Edit stat blocks" });
    expect(within(cooper).getAllByRole("button", { name: /stat blocks/ })).toHaveLength(1);
    await u.click(pencil);
    expect(await within(cooper).findByRole("button", { name: "Save stat blocks" })).toBeVisible();
    expect(pencil).toHaveAccessibleName("Done editing stat blocks");
    expect(pencil).toHaveAttribute("aria-expanded", "true");
    // Left from the form, the line's pencil says so too.
    await u.click(within(cooper).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(pencil).toHaveAccessibleName("Edit stat blocks"));
    expect(within(cooper).queryByRole("button", { name: "Save stat blocks" })).toBeNull();
  });

  it("only shows the status in a complete scene", async () => {
    renderPane(3, true);

    const pane = screen.getByRole("region", { name: "Stats" });
    const cooper = await within(pane).findByRole("article", { name: "The cooper" });
    expect(within(cooper).queryByRole("button", { name: "Ready" })).toBeNull();
    expect(await within(cooper).findByText("Ready")).toHaveAttribute("data-status", "READY");
    expect(within(cooper).queryByRole("button", { name: "Edit stat blocks" })).toBeNull();
  });

  it("rolls a global stat for all, saying the quiet ones in a toast", async () => {
    const u = userEvent.setup();
    renderPane();

    const all = await screen.findByRole("button", { name: "Roll Initiative for all" });
    await u.click(all);
    await waitFor(() => expect(sa_rollStatForAll.mock.callCount()).toBe(1));
    expect(sa_rollStatForAll.mock.calls[0].arguments).toEqual([-4, 3, -90, "combat", "init"]);
    // The cooper's roll went to the chat; the figure's comes back here.
    expect(await screen.findByText("Initiative rolled quietly")).toBeInTheDocument();
    expect(screen.getByText("9 for A hooded figure: Initiative")).toBeInTheDocument();
  });

  it("puts each element's total after its title after a roll for all, and sorts by them", async () => {
    const u = userEvent.setup();
    renderPane();

    const pane = screen.getByRole("region", { name: "Stats" });
    await within(pane).findByRole("article", { name: "The cooper" });
    expect(within(pane).queryByRole("button", { name: /^Sort by the last roll/ })).toBeNull();
    await u.click(within(pane).getByRole("button", { name: "Roll Initiative for all" }));
    const cooper = await within(pane).findByRole("article", { name: "The cooper" });
    const total = await within(cooper).findByTestId("rolled-total");
    expect(total).toHaveTextContent("(14)");
    // Which stat it was is a hover away.
    await u.hover(total);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Initiative");
    await u.unhover(total);
    const figure = within(pane).getByRole("article", { name: "A hooded figure" });
    expect(within(figure).getByTestId("rolled-total")).toHaveTextContent("(9)");
    const names = () =>
      within(pane)
        .getAllByRole("article")
        .map((article) => article.getAttribute("aria-label"));
    expect(names()).toEqual(["The cooper", "A hooded figure"]);

    // High to low first, then low to high, the button saying what comes next.
    const sortButton = within(pane).getByRole("button", {
      name: "Sort by the last roll high to low",
    });
    await u.click(sortButton);
    expect(names()).toEqual(["The cooper", "A hooded figure"]);
    expect(sortButton).toHaveAccessibleName("Sort by the last roll low to high");
    await u.click(sortButton);
    expect(names()).toEqual(["A hooded figure", "The cooper"]);
    expect(sortButton).toHaveAccessibleName("Sort by the last roll high to low");
  });

  it("rolls one element's die as its pill would, quietly for the invisible", async () => {
    const u = userEvent.setup();
    renderPane();

    const figure = await screen.findByRole("article", { name: "A hooded figure" });
    await u.click(within(figure).getByRole("button", { name: "Rolls 1d20" }));
    await waitFor(() => expect(sa_rollStat.mock.callCount()).toBe(1));
    expect(sa_rollStat.mock.calls[0].arguments).toEqual([
      { idStory: -4, idSceneElement: 10 },
      -90,
      "combat",
      "init",
      { title: "A hooded figure", quiet: true },
      undefined,
    ]);
  });

  it("says when there is no scene, and when nothing in the scene has a block", async () => {
    renderPane(null);
    expect(screen.getByText("No scene at the table.")).toBeInTheDocument();
    expect(sa_getSceneStatBlocks.mock.callCount()).toBe(0);

    sa_getSceneStatBlocks.mock.mockImplementationOnce(async () => []);
    renderPane();
    expect(
      await screen.findByText("No element in the scene has a stat block."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /for all/ })).not.toBeInTheDocument();
  });

  it("widens to half the page from the button on its heading, and back", async () => {
    const u = userEvent.setup();
    renderPane();

    const pane = screen.getByRole("region", { name: "Stats" });
    expect(pane).not.toHaveAttribute("data-wide");
    await u.click(within(pane).getByRole("button", { name: "Expand the stats pane" }));
    expect(pane).toHaveAttribute("data-wide", "true");
    await u.click(within(pane).getByRole("button", { name: "Shrink the stats pane" }));
    expect(pane).not.toHaveAttribute("data-wide");
  });

  it("shows a complete scene's blocks without their controls", async () => {
    renderPane(3, true);

    const cooper = await screen.findByRole("article", { name: "The cooper" });
    expect(within(cooper).queryByRole("button", { name: "HP down" })).not.toBeInTheDocument();
    expect(within(cooper).getByTestId("stat-hp")).toHaveTextContent("7");
  });
});
