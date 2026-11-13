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
  type StatRow,
} from "@/lib/stat-blocks";
import type {
  CopyStatBlocksFromElementResult,
  ElementStatBlock,
  RollAs,
  RollStatResult,
  SetElementStatResult,
  SetStatBlocksResult,
  StatBlockHolder,
  StatPatch,
} from "./actions";

const stat = (
  over: Partial<StatDefinition> & Pick<StatDefinition, "name" | "type">,
): StatDefinition => ({
  label: "",
  rack: [],
  computedAs: "",
  visible: true,
  format: defaultFormat(over.type),
  description: "",
  sticky: false,
  static: false,
  roll: "",
  global: false,
  upDown: true,
  initialRoll: "",
  ...over,
});

// A pool that rolls and shows its sign, a stack, a rack, a display held to a
// number, a static signed display, a hidden display, a computed stat, and a
// repeating group with a pool fed by its own row's strike.
const definition: StatBlockDefinition = {
  groups: [
    {
      name: "combat",
      label: "Combat",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [
        stat({ name: "hp", label: "HP", type: "pool", format: "number +/-", roll: "1d8" }),
        stat({ name: "rage", label: "Rage", type: "stack", sticky: true }),
        stat({ name: "die", label: "Die", type: "rack", rack: ["d4", "d6", "d8"] }),
        stat({ name: "ar", label: "AR", type: "display", format: "number" }),
        stat({
          name: "bonus",
          label: "Bonus",
          type: "display",
          format: "number +/-",
          static: true,
          roll: "1d20",
          global: false,
          upDown: true,
          initialRoll: "",
        }),
        stat({ name: "secret", label: "Secret", type: "display", visible: false }),
        stat({ name: "damage", label: "Damage", type: "dice" }),
        stat({ name: "mod", label: "Mod", type: "computed", computedAs: "combat.ar - 10" }),
      ],
    },
    {
      name: "attack",
      label: "Attack",
      keyedBy: "weapon",
      rollAll: true,
      canHaveMultiples: false,
      stats: [
        stat({ name: "weapon", label: "Weapon", type: "display" }),
        stat({ name: "uses", label: "Uses", type: "pool" }),
        stat({ name: "strike", label: "Strike", type: "display", format: "number" }),
      ],
    },
    {
      name: "hidden",
      label: "Hidden",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [stat({ name: "veiled", label: "Veiled", type: "display", visible: false })],
    },
  ],
};

// The block as stored, changed by the mocked action the way the real one
// clamps, so the view shows what comes back.
let stored: StatBlock;
const blockOf = (block: StatBlock = stored, of = definition): ElementStatBlock => ({
  idSystem: -90,
  label: "Palladium",
  definition: of,
  stored: true,
  block,
  carried: carriedGroups(of, block).map((group) => group.name),
  groups: evaluateStatBlock(of, block),
});

const sa_getStatBlocks = mock.fn(async (_holder: StatBlockHolder) => [blockOf()]);
const sa_setStat = mock.fn(
  async (
    _holder: StatBlockHolder,
    _system: number,
    group: string,
    stat: string,
    patch: StatPatch,
    rowKey?: string,
  ): Promise<SetElementStatResult> => {
    // Rows are found by their weapon, and uses is held between 0 and 3.
    if (rowKey !== undefined) {
      const rows = stored[group] as StatRow[];
      const index = rows.findIndex((row) => row.weapon.value === rowKey);
      const current = rows[index][stat];
      let value = patch.value ?? current.value;
      if (typeof value === "number") value = Math.min(Math.max(value, 0), 3);
      const changed = { ...current, value };
      stored = {
        ...stored,
        [group]: rows.map((row, i) => (i === index ? { ...row, [stat]: changed } : row)),
      };
      return { ok: true, block: blockOf() };
    }
    const current = (stored[group] as StatRow)[stat] ?? { value: 0 };
    let value = patch.value ?? current.value;
    if (stat === "hp" && typeof value === "number") value = Math.min(Math.max(value, 0), 14);
    if (stat === "rage" && typeof value === "number") value = Math.min(Math.max(value, 0), 3);
    stored = {
      ...stored,
      [group]: { ...(stored[group] as StatRow), [stat]: { ...current, value } },
    };
    return { ok: true, block: blockOf() };
  },
);
// The star: the row moves to the front, as the action moves it.
const sa_setDefaultRow = mock.fn(
  async (
    _holder: StatBlockHolder,
    _system: number,
    group: string,
    rowKey: string,
  ): Promise<SetElementStatResult> => {
    const rows = stored[group] as StatRow[];
    const index = rows.findIndex((row) => row.weapon.value === rowKey);
    stored = { ...stored, [group]: [rows[index], ...rows.filter((_, i) => i !== index)] };
    return { ok: true, block: blockOf() };
  },
);
const sa_copyStatBlocksToElement = mock.fn(async (_holder: StatBlockHolder, _system: number) => ({
  ok: true as const,
}));
// The element's blocks over the holder's: HP back to 14, as the element has it.
const sa_copyStatBlocksFromElement = mock.fn(
  async (_holder: StatBlockHolder): Promise<CopyStatBlocksFromElementResult> => {
    const combat = stored.combat as StatRow;
    stored = { ...stored, combat: { ...combat, hp: { ...combat.hp, value: 14 } } };
    return { ok: true, blocks: [blockOf()] };
  },
);
// Roll All: one quiet roll per row, as the action answers with no table.
const sa_rollGroupRows = mock.fn(
  async (_holder: StatBlockHolder, _system: number, _group: string, _as: RollAs) => ({
    ok: true as const,
    rolls: [
      {
        title: "Dafydd (Sword)",
        roll: {
          notation: "1d6+2",
          label: "for Dafydd (Sword): Uses",
          total: 5,
          dice: [{ value: 3, dropped: false }],
          detail: "1d6+2: [3]+2 = 5",
        },
        posted: false,
      },
      {
        title: "Dafydd (Fist)",
        roll: {
          notation: "1d6",
          label: "for Dafydd (Fist): Uses",
          total: 4,
          dice: [{ value: 4, dropped: false }],
          detail: "1d6: [4] = 4",
        },
        posted: false,
      },
    ],
  }),
);
const sa_setStatBlocks = mock.fn(
  async (_holder: StatBlockHolder, blocks: unknown): Promise<SetStatBlocksResult> => {
    stored = (blocks as Record<string, StatBlock>)["-90"];
    return { ok: true, blocks: [blockOf()] };
  },
);

const sa_rollStat = mock.fn(
  async (
    _holder: StatBlockHolder,
    _idSystem: number,
    _group: string,
    _stat: string,
    _as: RollAs,
    _rowKey?: string,
  ): Promise<RollStatResult> => ({
    ok: true,
    posted: true,
    roll: {
      notation: "1d8+13",
      label: "for Dafydd: HP",
      total: 18,
      dice: [{ value: 5, dropped: false }],
      detail: "1d8+13: [5]+13 = 18",
    },
  }),
);

let ElementStatBlocks: typeof import("./stat-block-view").ElementStatBlocks;
const holder: StatBlockHolder = { idStory: 1, idSceneElement: 50 };

describe("ElementStatBlocks", () => {
  before(async () => {
    mock.module("./actions", {
      namedExports: {
        sa_getStatBlocks,
        sa_setStat,
        sa_setStatBlocks,
        sa_rollStat,
        sa_copyStatBlocksToElement,
        sa_copyStatBlocksFromElement,
        sa_rollGroupRows,
        sa_setDefaultRow,
      },
    });
    ({ ElementStatBlocks } = await import("./stat-block-view"));
  });

  beforeEach(() => {
    stored = {
      combat: {
        hp: { value: 13, min: 0, max: 14 },
        rage: { value: 3, max: 3 },
        die: { value: "d6" },
        ar: { value: 12 },
        bonus: { value: -2 },
        secret: { value: "shh" },
        damage: { value: "2d6" },
      },
      attack: [
        { weapon: { value: "Sword" }, uses: { value: 2, min: 0 }, strike: { value: 3 } },
        { weapon: { value: "Fist" }, uses: { value: 0, min: 0 }, strike: { value: 1 } },
      ],
      hidden: { veiled: { value: 1 } },
    };
    sa_getStatBlocks.mock.resetCalls();
    sa_setStat.mock.resetCalls();
    sa_setStatBlocks.mock.resetCalls();
    sa_copyStatBlocksToElement.mock.resetCalls();
    sa_copyStatBlocksFromElement.mock.resetCalls();
    sa_rollGroupRows.mock.resetCalls();
    sa_setDefaultRow.mock.resetCalls();
    sa_rollStat.mock.resetCalls();
  });

  afterEach(() => toaster.remove());

  it("loads the holder's blocks and draws each carried block's visible stats on their lines", async () => {
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    expect(await screen.findByTestId("stat-hp")).toHaveValue("13");
    expect(sa_getStatBlocks.mock.calls[0].arguments).toEqual([holder]);
    // Hidden stats and a block with nothing visible are left out.
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("Veiled")).not.toBeInTheDocument();
    // Rage sticks to Die: one line for the two.
    const lines = screen.getByTestId("stat-block-view--90").querySelectorAll("[data-stat-line]");
    const rageLine = [...lines].find((line) => within(line as HTMLElement).queryByText("Rage"));
    expect(within(rageLine as HTMLElement).getByText("Die")).toBeInTheDocument();
    // Signed and static formats: HP's sign beside its box, Bonus as words with
    // no box, the computed Mod dim as words, the roll said on its die.
    expect(within(screen.getByTestId("stat-hp").parentElement!).getByText("+")).toBeInTheDocument();
    expect(screen.getByTestId("stat-bonus")).toHaveTextContent("−2");
    expect(screen.queryByRole("textbox", { name: "Bonus" })).not.toBeInTheDocument();
    expect(screen.getByTestId("stat-mod")).toHaveTextContent("2");
    // Without a roller the die only says what it rolls.
    expect(screen.getByLabelText("Rolls 1d8").tagName).toBe("SPAN");
    expect(screen.getByLabelText("Rolls 1d20")).toBeInTheDocument();
    // Dice are words with their own die, and no box.
    expect(screen.getByTestId("stat-damage")).toHaveTextContent("2d6");
    expect(screen.getByLabelText("Rolls 2d6")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Damage" })).not.toBeInTheDocument();
  });

  it("moves a pool, a stack and a rack by their clickers, held to their ends, and sets a typed number on Enter", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    const hp = await screen.findByTestId("stat-hp");
    await user.click(screen.getByRole("button", { name: "HP up" }));
    await waitFor(() => expect(hp).toHaveValue("14"));
    expect(sa_setStat.mock.calls[0].arguments.slice(0, 5)).toEqual([
      holder,
      -90,
      "combat",
      "hp",
      { value: 14 },
    ]);
    // At the max the clicker has nothing to commit, and the box stays there.
    await user.click(screen.getByRole("button", { name: "HP up" }));
    expect(sa_setStat.mock.callCount()).toBe(1);
    expect(hp).toHaveValue("14");
    await user.click(screen.getByRole("button", { name: "HP down" }));
    await waitFor(() => expect(hp).toHaveValue("13"));
    // The "/ max" is the refill, and says so on hover.
    const refill = screen.getByRole("button", { name: "Refill HP" });
    expect(refill).toHaveTextContent("/ 14");
    await user.hover(refill);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Click to refill HP to 14");
    await user.click(refill);
    await waitFor(() => expect(hp).toHaveValue("14"));
    await user.unhover(refill);

    await user.clear(hp);
    await user.type(hp, "9x{Enter}");
    await waitFor(() => expect(sa_setStat.mock.calls.at(-1)!.arguments[4]).toEqual({ value: 9 }));
    expect(hp).toHaveValue("9");

    await user.click(screen.getByRole("button", { name: "Rage down" }));
    await waitFor(() => expect(screen.getByTestId("stat-rage")).toHaveValue("2"));
    await user.click(screen.getByRole("button", { name: "Die up" }));
    await waitFor(() => expect(screen.getByTestId("stat-die")).toHaveTextContent("d8"));
    await user.click(screen.getByRole("button", { name: "Die up" }));
    expect(sa_setStat.mock.calls.filter((c) => c.arguments[3] === "die")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Die down" }));
    await waitFor(() => expect(screen.getByTestId("stat-die")).toHaveTextContent("d6"));
  });

  it("draws each row of a repeating block under its key and moves a row's pool by its own clicker", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    expect(await screen.findByText("Sword")).toBeInTheDocument();
    const sword = screen.getByTestId("stat-row-Sword");
    expect(within(sword).getByTestId("stat-uses")).toHaveValue("2");
    await user.click(within(sword).getByRole("button", { name: "Uses up" }));
    await waitFor(() => expect(within(sword).getByTestId("stat-uses")).toHaveValue("3"));
    expect(sa_setStat.mock.calls[0].arguments.slice(2)).toEqual([
      "attack",
      "uses",
      { value: 3 },
      "Sword",
    ]);
    expect(within(screen.getByTestId("stat-row-Fist")).getByTestId("stat-uses")).toHaveValue("0");
  });

  it("shows words alone without canEdit, and a dash for a word where a number should be", async () => {
    stored = {
      ...stored,
      combat: { ...(stored.combat as StatRow), ar: { value: "high" } },
    };
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit={false} />);

    expect(await screen.findByTestId("stat-hp")).toHaveTextContent("+13");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "HP up" })).not.toBeInTheDocument();
    expect(screen.getByTestId("stat-ar")).toHaveTextContent("—");
  });

  it("offers the picker through the pencil for a holder with nothing yet, and saves the form's blocks", async () => {
    const user = userEvent.setup();
    stored = {};
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    expect(await screen.findByText("No stat blocks yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit stat blocks" }));
    await user.click(await screen.findByRole("button", { name: "Add Combat" }));
    const hp = await screen.findByRole("textbox", { name: "HP value" });
    await user.clear(hp);
    await user.type(hp, "7");
    const max = screen.getByRole("textbox", { name: "HP max" });
    await user.clear(max);
    await user.type(max, "9");
    await user.click(screen.getByRole("button", { name: "Save stat blocks" }));

    await waitFor(() => expect(sa_setStatBlocks.mock.callCount()).toBe(1));
    expect(sa_setStatBlocks.mock.calls[0].arguments[0]).toEqual(holder);
    const posted = sa_setStatBlocks.mock.calls[0].arguments[1] as Record<string, StatBlock>;
    expect(posted["-90"].combat).toMatchObject({ hp: { value: 7, min: 0, max: 9 } });
    // Back to the display block, drawn from what came back.
    expect(await screen.findByTestId("stat-hp")).toHaveValue("7");
    expect(screen.queryByRole("button", { name: "Save stat blocks" })).not.toBeInTheDocument();
  });

  it("marks the first row of a repeating group as the default, and a star on another makes it so", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    const sword = await screen.findByTestId("stat-row-Sword");
    expect(within(sword).getByRole("img", { name: "Sword is the default" })).toBeInTheDocument();
    const fist = screen.getByTestId("stat-row-Fist");
    expect(within(fist).queryByRole("img", { name: /default/ })).toBeNull();
    await user.click(within(fist).getByRole("button", { name: "Make Fist the default" }));
    await waitFor(() => expect(sa_setDefaultRow.mock.callCount()).toBe(1));
    expect(sa_setDefaultRow.mock.calls[0].arguments).toEqual([holder, -90, "attack", "Fist"]);
    // Fist leads now, with the filled star; Sword has the empty one.
    expect(
      await within(screen.getByTestId("stat-row-Fist")).findByRole("img", {
        name: "Fist is the default",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("stat-row-Sword")).getByRole("button", {
        name: "Make Sword the default",
      }),
    ).toBeInTheDocument();
  });

  it("offers no star to move a row without canEdit", async () => {
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit={false} />);
    const fist = await screen.findByTestId("stat-row-Fist");
    expect(within(fist).queryByRole("button", { name: /default/ })).toBeNull();
    expect(
      within(screen.getByTestId("stat-row-Sword")).getByRole("img", {
        name: "Sword is the default",
      }),
    ).toBeInTheDocument();
  });

  it("copies a scene element's block back to the element from a button beside the pencil", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ElementStatBlocks holder={holder} canEdit />
        <Toaster />
      </>,
    );

    await screen.findByTestId("stat-hp");
    // Only while the form is open: the copy is of what is about to be edited.
    expect(screen.queryByRole("button", { name: "Copy stats to the element" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit stat blocks" }));
    await user.click(await screen.findByRole("button", { name: "Copy stats to the element" }));
    await waitFor(() => expect(sa_copyStatBlocksToElement.mock.callCount()).toBe(1));
    expect(sa_copyStatBlocksToElement.mock.calls[0].arguments).toEqual([holder, -90]);
    expect(await screen.findByText("Stats copied to the element")).toBeInTheDocument();
  });

  it("offers no copy back for an element's own block", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks holder={{ idStory: 1, idElement: 5 }} canEdit />);

    await screen.findByTestId("stat-hp");
    await user.click(screen.getByRole("button", { name: "Edit stat blocks" }));
    await screen.findByRole("button", { name: "Save stat blocks" });
    expect(screen.queryByRole("button", { name: "Copy stats to the element" })).toBeNull();
  });

  it("rolls every row's first die from the Roll All die on a group marked for it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ElementStatBlocks holder={holder} canEdit rollAs={{ title: "Dafydd", quiet: false }} />
        <Toaster />
      </>,
    );

    await screen.findByTestId("stat-hp");
    // Only Attack is marked; Combat does not repeat and has no die for it.
    const die = screen.getByRole("button", { name: "Roll All" });
    await user.click(die);
    await waitFor(() => expect(sa_rollGroupRows.mock.callCount()).toBe(1));
    expect(sa_rollGroupRows.mock.calls[0].arguments).toEqual([
      holder,
      -90,
      "attack",
      { title: "Dafydd", quiet: false },
    ]);
    // Neither roll reached a chat, so both are said here.
    expect(await screen.findByText("Attack rolled quietly")).toBeInTheDocument();
  });

  it("draws a number without its clicker where the template leaves Up/down off", async () => {
    sa_getStatBlocks.mock.mockImplementationOnce(async () => [
      blockOf(stored, {
        groups: definition.groups.map((group) => ({
          ...group,
          stats: group.stats.map((stat) =>
            stat.name === "hp" ? { ...stat, upDown: false } : stat,
          ),
        })),
      }),
    ]);
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    expect(await screen.findByTestId("stat-hp")).toHaveValue("13");
    expect(screen.queryByRole("button", { name: "HP up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "HP down" })).toBeNull();
    // Rage keeps its clicker.
    expect(screen.getByRole("button", { name: "Rage up" })).toBeInTheDocument();
  });

  it("steps a number with the arrow keys in its box, held to the pool's min and max", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    const hp = await screen.findByTestId("stat-hp");
    expect(hp).toHaveValue("13");
    await user.click(hp);
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(hp).toHaveValue("14"));
    expect(sa_setStat.mock.calls.at(-1)!.arguments[4]).toEqual({ value: 14 });
    // At the max, up has nothing to commit; down steps back.
    await user.keyboard("{ArrowUp}");
    expect(sa_setStat.mock.callCount()).toBe(1);
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(hp).toHaveValue("13"));
    expect(sa_setStat.mock.callCount()).toBe(2);
    // Half-typed text is dropped by a step, which goes from the value shown.
    await user.type(hp, "x");
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(hp).toHaveValue("12"));
    expect(sa_setStat.mock.calls.at(-1)!.arguments[4]).toEqual({ value: 12 });
    // The clicker keeps to the same ends: down at the floor commits nothing.
    const uses = within(screen.getByTestId("stat-row-Fist")).getByTestId("stat-uses");
    expect(uses).toHaveValue("0");
    const before = sa_setStat.mock.callCount();
    await user.click(screen.getAllByRole("button", { name: "Uses down" })[1]);
    expect(sa_setStat.mock.callCount()).toBe(before);
  });

  it("says a stat's description and what it is initialized as on hover over its label", async () => {
    const user = userEvent.setup();
    sa_getStatBlocks.mock.mockImplementationOnce(async () => [
      blockOf(stored, {
        groups: definition.groups.map((group) => ({
          ...group,
          stats: group.stats.map((stat) =>
            stat.name === "hp"
              ? { ...stat, description: "Hit Points", initialRoll: "8d8+3" }
              : stat,
          ),
        })),
      }),
    ]);
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    await screen.findByTestId("stat-hp");
    await user.hover(screen.getByText("HP"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hit Points: 8d8+3");
  });

  it("marks a row the element has several of with its multiple", async () => {
    const [sword, fist] = stored.attack as StatRow[];
    sa_getStatBlocks.mock.mockImplementationOnce(async () => [
      blockOf(
        { ...stored, attack: [{ ...sword, $multiple: { value: 3 } }, fist] },
        {
          groups: definition.groups.map((group) =>
            group.name === "attack" ? { ...group, canHaveMultiples: true } : group,
          ),
        },
      ),
    ]);
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    await screen.findByTestId("stat-hp");
    expect(screen.getByTestId("stat-row-Sword")).toHaveTextContent("Sword×3");
    expect(screen.getByTestId("stat-row-Fist")).not.toHaveTextContent("×");
  });

  it("offers no Roll All where nothing rolls", async () => {
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);
    await screen.findByTestId("stat-hp");
    expect(screen.queryByRole("button", { name: "Roll All" })).toBeNull();
  });

  it("starts closed behind a line that counts the blocks when folded", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit folded />);

    // Every carried group counts, the hidden one with the rest.
    const fold = await screen.findByRole("button", { name: "3 stat blocks in this scene" });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("stat-hp")).toBeNull();
    await user.click(fold);
    expect(await screen.findByTestId("stat-hp")).toHaveValue("13");
    expect(fold).toHaveAttribute("aria-expanded", "true");
    await user.click(fold);
    expect(screen.queryByTestId("stat-hp")).toBeNull();
  });

  it("pastes the element's blocks over a scene element's from beside the pencil", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ElementStatBlocks holder={holder} canEdit copyFromElement />
        <Toaster />
      </>,
    );

    expect(await screen.findByTestId("stat-hp")).toHaveValue("13");
    await user.click(screen.getByRole("button", { name: "Copy stats from the element" }));
    await waitFor(() => expect(sa_copyStatBlocksFromElement.mock.callCount()).toBe(1));
    expect(sa_copyStatBlocksFromElement.mock.calls[0].arguments).toEqual([holder]);
    expect(await screen.findByText("Stats copied from the element")).toBeInTheDocument();
    // The blocks show as they come back, the element's values again.
    await waitFor(() => expect(screen.getByTestId("stat-hp")).toHaveValue("14"));
  });

  it("offers the paste only where the element has a block, and not while editing", async () => {
    const user = userEvent.setup();
    const plain = renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);
    await screen.findByTestId("stat-hp");
    expect(screen.queryByRole("button", { name: "Copy stats from the element" })).toBeNull();
    plain.unmount();

    renderWithProviders(<ElementStatBlocks holder={holder} canEdit copyFromElement />);
    await screen.findByTestId("stat-hp");
    expect(screen.getByRole("button", { name: "Copy stats from the element" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit stat blocks" }));
    await screen.findByRole("button", { name: "Save stat blocks" });
    expect(screen.queryByRole("button", { name: "Copy stats from the element" })).toBeNull();
  });

  it("leaves the form by Cancel with nothing saved", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);

    await screen.findByTestId("stat-hp");
    await user.click(screen.getByRole("button", { name: "Edit stat blocks" }));
    expect(await screen.findByRole("textbox", { name: "HP value" })).toHaveValue("13");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByTestId("stat-hp")).toHaveValue("13");
    expect(sa_setStatBlocks.mock.callCount()).toBe(0);
  });

  it("draws nothing for a holder with no blocks and no story system", async () => {
    sa_getStatBlocks.mock.mockImplementationOnce(async () => []);
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);
    await waitFor(() => expect(sa_getStatBlocks.mock.callCount()).toBeGreaterThan(0));
    expect(screen.queryByTestId("element-stat-blocks")).not.toBeInTheDocument();
  });

  it("rolls a stat's die from the button, as the element is shown, and toasts a roll the chat did not get", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ElementStatBlocks holder={holder} canEdit rollAs={{ title: "Dafydd", quiet: false }} />
        <Toaster />
      </>,
    );
    const die = await screen.findByRole("button", { name: "Rolls 1d8" });
    await user.click(die);
    await waitFor(() => expect(sa_rollStat.mock.callCount()).toBe(1));
    expect(sa_rollStat.mock.calls[0].arguments).toEqual([
      holder,
      -90,
      "combat",
      "hp",
      { title: "Dafydd", quiet: false },
      undefined,
    ]);
    // Said in the chat: nothing to show here.
    expect(screen.queryByText("18 for Dafydd: HP")).not.toBeInTheDocument();

    // Kept from the chat (an invisible element, or no table): toasted.
    sa_rollStat.mock.mockImplementationOnce(async () => ({
      ok: true,
      posted: false,
      roll: {
        notation: "2d6",
        label: "for Dafydd: Damage",
        total: 7,
        dice: [
          { value: 3, dropped: false },
          { value: 4, dropped: false },
        ],
        detail: "2d6: [3, 4] = 7",
      },
    }));
    await user.click(screen.getByRole("button", { name: "Rolls 2d6" }));
    expect(await screen.findByText("7 for Dafydd: Damage")).toBeInTheDocument();
    expect(screen.getByText("2d6: [3, 4] = 7")).toBeInTheDocument();
    expect(sa_rollStat.mock.calls[1].arguments.slice(2, 4)).toEqual(["combat", "damage"]);
  });

  it("folds a stat block away by its heading and brings it back", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks holder={holder} canEdit />);
    await screen.findByTestId("stat-hp");

    const combat = screen.getByRole("button", { name: "Combat" });
    expect(combat).toHaveAttribute("aria-expanded", "true");
    await user.click(combat);
    expect(combat).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("stat-hp")).not.toBeInTheDocument();
    // The repeating block folds its rows the same way; the other is untouched.
    expect(screen.getByTestId("stat-row-Sword")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Attack" }));
    expect(screen.queryByTestId("stat-row-Sword")).not.toBeInTheDocument();
    await user.click(combat);
    expect(screen.getByTestId("stat-hp")).toBeInTheDocument();
  });

  it("toasts a refusal and keeps the value", async () => {
    const user = userEvent.setup();
    sa_setStat.mock.mockImplementationOnce(async () => ({ ok: false, error: "Not yours." }));
    renderWithProviders(
      <>
        <ElementStatBlocks holder={holder} canEdit />
        <Toaster />
      </>,
    );
    const hp = await screen.findByTestId("stat-hp");
    await user.click(screen.getByRole("button", { name: "HP up" }));
    expect(await screen.findByText("Not yours.")).toBeInTheDocument();
    expect(hp).toHaveValue("13");
  });
});
