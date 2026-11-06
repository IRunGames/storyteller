import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import {
  evaluateStatBlock,
  type StatBlock,
  type StatBlockDefinition,
  type StatRow,
} from "@/lib/stat-blocks";
import type { ElementStatBlock, SetElementStatResult, StatPatch } from "./actions";

const definition: StatBlockDefinition = {
  groups: [
    {
      name: "combat",
      label: "Combat",
      keyedBy: "",
      stats: [
        { name: "hp", label: "HP", type: "pool", rack: [], connectedTo: "", computedAs: "" },
        { name: "rage", label: "Rage", type: "stack", rack: [], connectedTo: "", computedAs: "" },
        {
          name: "die",
          label: "Die",
          type: "rack",
          rack: ["d4", "d6", "d8"],
          connectedTo: "",
          computedAs: "",
        },
        { name: "ar", label: "AR", type: "display", rack: [], connectedTo: "", computedAs: "" },
        {
          name: "mod",
          label: "Mod",
          type: "computed",
          rack: [],
          connectedTo: "",
          computedAs: "combat.ar - 10",
        },
      ],
    },
    {
      name: "attack",
      label: "Attack",
      keyedBy: "weapon",
      stats: [
        {
          name: "weapon",
          label: "Weapon",
          type: "display",
          rack: [],
          connectedTo: "",
          computedAs: "",
        },
        { name: "uses", label: "Uses", type: "pool", rack: [], connectedTo: "", computedAs: "" },
        {
          name: "strike",
          label: "Strike",
          type: "display",
          rack: [],
          connectedTo: "",
          computedAs: "",
        },
      ],
    },
  ],
};

// The block as stored, changed by the mocked action the way the real one
// clamps, so the view shows what comes back.
let stored: StatBlock;
const blockOf = (): ElementStatBlock => ({
  idSystem: -90,
  label: "Palladium",
  definition,
  stored: true,
  groups: evaluateStatBlock(definition, stored),
});

const sa_getElementStatBlocks = mock.fn(async (_story: number, _element: number) => [blockOf()]);
const sa_setElementStat = mock.fn(
  async (
    _story: number,
    _element: number,
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

let ElementStatBlocks: typeof import("./stat-block-view").ElementStatBlocks;

describe("ElementStatBlocks", () => {
  before(async () => {
    mock.module("./actions", { namedExports: { sa_getElementStatBlocks, sa_setElementStat } });
    ({ ElementStatBlocks } = await import("./stat-block-view"));
  });

  beforeEach(() => {
    stored = {
      combat: {
        hp: { value: 13, min: 0, max: 14 },
        rage: { value: 3, max: 3 },
        die: { value: "d6" },
        ar: { value: 12 },
      },
      attack: [
        { weapon: { value: "Sword" }, uses: { value: 2, min: 0, max: 3 }, strike: { value: 4 } },
        { weapon: { value: "Fist" }, uses: { value: 0, min: 0, max: 3 }, strike: { value: 1 } },
      ],
    };
    sa_setElementStat.mock.resetCalls();
  });

  afterEach(() => toaster.remove());

  it("shows every stat, and moves a pool, a stack and a rack by their controls, stopping at the ends", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks idStory={1} idElement={5} canEdit />);

    expect(await screen.findByTestId("stat-hp")).toHaveTextContent("13 / 14");
    expect(screen.getByTestId("stat-rage")).toHaveTextContent("3 / 3");
    expect(screen.getByTestId("stat-die")).toHaveTextContent("d6");
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "HP +1" }));
    await waitFor(() => expect(screen.getByTestId("stat-hp")).toHaveTextContent("14 / 14"));
    // At the max, + sends nothing.
    await user.click(screen.getByRole("button", { name: "HP +1" }));
    expect(sa_setElementStat.mock.callCount()).toBe(1);
    await user.click(screen.getByRole("button", { name: "HP −1" }));
    await waitFor(() => expect(screen.getByTestId("stat-hp")).toHaveTextContent("13 / 14"));
    await user.click(screen.getByRole("button", { name: "Refill HP" }));
    await waitFor(() => expect(screen.getByTestId("stat-hp")).toHaveTextContent("14 / 14"));
    expect(sa_setElementStat.mock.calls[2].arguments.slice(2)).toEqual([
      -90,
      "combat",
      "hp",
      { value: 14 },
    ]);

    await user.click(screen.getByRole("button", { name: "Rage +1" }));
    expect(sa_setElementStat.mock.callCount()).toBe(3);
    await user.click(screen.getByRole("button", { name: "Rage −1" }));
    await waitFor(() => expect(screen.getByTestId("stat-rage")).toHaveTextContent("2 / 3"));

    await user.click(screen.getByRole("button", { name: "Die up" }));
    await waitFor(() => expect(screen.getByTestId("stat-die")).toHaveTextContent("d8"));
    await user.click(screen.getByRole("button", { name: "Die up" }));
    expect(sa_setElementStat.mock.callCount()).toBe(5);
    await user.click(screen.getByRole("button", { name: "Die down" }));
    await waitFor(() => expect(screen.getByTestId("stat-die")).toHaveTextContent("d6"));
  });

  it("draws each row of a repeating group under its key and moves a row's pool by its own controls", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementStatBlocks idStory={1} idElement={5} canEdit />);

    expect(await screen.findByText("Sword")).toBeInTheDocument();
    expect(screen.getByText("Fist")).toBeInTheDocument();
    const sword = screen.getByTestId("stat-row-Sword");
    expect(within(sword).getByTestId("stat-uses")).toHaveTextContent("2 / 3");
    await user.click(within(sword).getByRole("button", { name: "Uses +1" }));
    await waitFor(() => expect(within(sword).getByTestId("stat-uses")).toHaveTextContent("3 / 3"));
    expect(sa_setElementStat.mock.calls[0].arguments.slice(3)).toEqual([
      "attack",
      "uses",
      { value: 3 },
      "Sword",
    ]);
    expect(within(screen.getByTestId("stat-row-Fist")).getByTestId("stat-uses")).toHaveTextContent(
      "0 / 3",
    );
  });

  it("draws a repeating group with no rows as one quiet line", async () => {
    stored = { ...stored, attack: [] };
    renderWithProviders(<ElementStatBlocks idStory={1} idElement={5} canEdit />);
    expect(await screen.findByText("No Attack yet")).toBeInTheDocument();
    expect(screen.queryByTestId(/^stat-row-/)).not.toBeInTheDocument();
  });

  it("shows no controls when it cannot edit", async () => {
    renderWithProviders(<ElementStatBlocks idStory={1} idElement={5} canEdit={false} />);
    expect(await screen.findByTestId("stat-hp")).toHaveTextContent("13 / 14");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws nothing for an element with no blocks, and toasts a refusal", async () => {
    sa_getElementStatBlocks.mock.mockImplementationOnce(async () => []);
    const { unmount } = renderWithProviders(
      <ElementStatBlocks idStory={1} idElement={5} canEdit />,
    );
    await waitFor(() => expect(sa_getElementStatBlocks.mock.callCount()).toBeGreaterThan(0));
    expect(screen.queryByTestId("element-stat-blocks")).not.toBeInTheDocument();
    unmount();

    sa_setElementStat.mock.mockImplementationOnce(async () => ({ ok: false, error: "Not yours." }));
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ElementStatBlocks idStory={1} idElement={5} canEdit />
        <Toaster />
      </>,
    );
    await user.click(await screen.findByRole("button", { name: "HP −1" }));
    expect(await screen.findByText("Not yours.")).toBeInTheDocument();
  });
});
