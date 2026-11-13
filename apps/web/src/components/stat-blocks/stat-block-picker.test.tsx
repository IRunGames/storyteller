import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StatBlockDefinition, StatDefinition } from "@/lib/stat-blocks";
import { StatBlockPicker } from "./stat-block-picker";

const stat = (
  over: Partial<StatDefinition> & Pick<StatDefinition, "name" | "type">,
): StatDefinition => ({
  label: "",
  rack: [],
  computedAs: "",
  visible: true,
  format: "",
  description: "",
  sticky: false,
  static: false,
  roll: "",
  global: false,
  upDown: true,
  initialRoll: "",
  ...over,
});

const definition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [stat({ name: "str", type: "display", label: "Strength", format: "number" })],
    },
    {
      name: "combat",
      label: "",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [
        stat({ name: "hp", type: "pool", label: "HP", roll: "1d8" }),
        stat({ name: "secret", type: "computed", computedAs: "1", visible: false }),
      ],
    },
    {
      name: "attack",
      label: "Attack",
      keyedBy: "weapon",
      rollAll: false,
      canHaveMultiples: false,
      stats: [stat({ name: "weapon", type: "display" })],
    },
  ],
};

describe("StatBlockPicker", () => {
  it("offers the blocks not carried, each with its stats previewed, and Add all for more than one", async () => {
    const user = userEvent.setup();
    const onAdd = mock.fn((_group: string) => {});
    const onAddAll = mock.fn(() => {});
    renderWithProviders(
      <StatBlockPicker
        definition={definition}
        carried={["stats"]}
        onAdd={onAdd}
        onAddAll={onAddAll}
      />,
    );

    expect(screen.queryByTestId("stat-block-preview-stats")).not.toBeInTheDocument();
    const combat = screen.getByTestId("stat-block-preview-combat");
    // No label, so the name heads the card; a roll and a hidden stat are said.
    expect(within(combat).getByRole("heading", { name: "combat" })).toBeInTheDocument();
    expect(combat).toHaveTextContent("HPpool · rolls 1d8");
    expect(combat).toHaveTextContent("secretcomputed · hidden");
    const attack = screen.getByTestId("stat-block-preview-attack");
    expect(attack).toHaveTextContent("Repeats by weapon");

    await user.click(within(attack).getByRole("button", { name: "Add Attack" }));
    expect(onAdd.mock.calls[0].arguments).toEqual(["attack"]);
    await user.click(screen.getByRole("button", { name: "Add all" }));
    expect(onAddAll.mock.callCount()).toBe(1);
  });

  it("has no Add all with one block left, and nothing at all with none", () => {
    const one = renderWithProviders(
      <StatBlockPicker
        definition={definition}
        carried={["stats", "combat"]}
        onAdd={() => {}}
        onAddAll={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Add Attack" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add all" })).not.toBeInTheDocument();
    one.unmount();

    // A number format is said on the preview line too.
    const all = renderWithProviders(
      <StatBlockPicker definition={definition} carried={[]} onAdd={() => {}} onAddAll={() => {}} />,
    );
    expect(screen.getByTestId("stat-block-preview-stats")).toHaveTextContent(
      "Strengthdisplay · number",
    );
    all.unmount();

    renderWithProviders(
      <StatBlockPicker
        definition={definition}
        carried={["stats", "combat", "attack"]}
        onAdd={() => {}}
        onAddAll={() => {}}
      />,
    );
    expect(screen.queryByTestId("stat-block-picker")).not.toBeInTheDocument();
  });
});
