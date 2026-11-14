import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { ElementValues } from "@/lib/element-schemas";
import type { StatBlockSystems } from "@/components/prep/actions";

type Result = { ok: true } | { ok: false; errors: Record<string, string> };

const sa_createElement = mock.fn<(idStory: number, values: ElementValues) => Promise<Result>>(
  async () => ({ ok: true }),
);
const sa_updateElement = mock.fn<(idElement: number, values: ElementValues) => Promise<Result>>(
  async () => ({ ok: true }),
);
const sa_deleteElement = mock.fn(async () => ({ ok: true as const, idStory: -15 }));

let ElementForm: typeof import("@/components/prep/element-form").ElementForm;

// Palladium's defense group as the first migration seeds it, and a second
// system with one rack, for the add and remove.
const systems: StatBlockSystems = {
  storySystem: -90,
  systems: [
    {
      idSystem: -90,
      label: "Palladium Fantasy Role-Playing Game (2e)",
      definition: {
        groups: [
          {
            name: "defense",
            label: "Defense",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [
              {
                name: "ar",
                label: "AR",
                type: "display",
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
              },
              {
                name: "sdc",
                label: "SDC",
                type: "pool",
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
              },
              {
                name: "current_ar",
                label: "Current AR",
                type: "computed",
                rack: [],
                computedAs:
                  "if(defense.sdc.value < defense.sdc.max / 2, defense.ar.value - 2, defense.ar.value)",
                visible: true,
                format: "",
                description: "",
                sticky: false,
                static: false,
                roll: "",
                global: false,
                upDown: true,
                initialRoll: "",
              },
              {
                name: "rage",
                label: "Rage",
                type: "stack",
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
              },
            ],
          },
          // Repeats by weapon, with a computed stat reading its own row and
          // the defense group.
          {
            name: "attack",
            label: "Attack",
            keyedBy: "weapon",
            rollAll: false,
            canHaveMultiples: false,
            stats: [
              {
                name: "weapon",
                label: "Weapon",
                type: "display",
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
              },
              {
                name: "strike",
                label: "Strike",
                type: "display",
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
              },
              {
                name: "total",
                label: "Total",
                type: "computed",
                rack: [],
                computedAs: "attack.strike.value + defense.ar.value",
                visible: true,
                format: "",
                description: "",
                sticky: false,
                static: false,
                roll: "",
                global: false,
                upDown: true,
                initialRoll: "",
              },
            ],
          },
        ],
      },
    },
    {
      idSystem: -7,
      label: "Savage Worlds",
      definition: {
        groups: [
          {
            name: "traits",
            label: "Traits",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [
              {
                name: "agility",
                label: "Agility",
                type: "rack",
                rack: ["d4", "d6", "d8"],
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
              },
            ],
          },
        ],
      },
    },
  ],
};

/** The same systems with the defense group's stats held to numbers, and AR sticking to SDC. */
const numbered: StatBlockSystems = {
  ...systems,
  systems: systems.systems.map((system) =>
    system.idSystem !== -90
      ? system
      : {
          ...system,
          definition: {
            groups: system.definition.groups.map((group) =>
              group.name !== "defense"
                ? group
                : {
                    ...group,
                    stats: group.stats.map((stat) =>
                      stat.name === "ar"
                        ? { ...stat, format: "number" as const, sticky: true }
                        : stat.name === "sdc"
                          ? { ...stat, format: "number +/-" as const }
                          : stat,
                    ),
                  },
            ),
          },
        },
  ),
};

const grok = {
  kind: "PERSON" as const,
  name: "Grok",
  initialName: "",
  title: "",
  description: "",
  notes: "",
  url: "",
  urlText: "",
};

describe("ElementForm stat blocks", () => {
  before(async () => {
    mock.module("@/components/prep/actions", {
      namedExports: { sa_createElement, sa_updateElement, sa_deleteElement },
    });
    mock.module("next/navigation", {
      namedExports: { useRouter: () => ({ push: mock.fn(), refresh: mock.fn() }) },
    });
    ({ ElementForm } = await import("@/components/prep/element-form"));
  });

  beforeEach(() => {
    sa_createElement.mock.resetCalls();
    sa_createElement.mock.mockImplementation(async () => ({ ok: true }));
    sa_updateElement.mock.resetCalls();
  });

  it("starts a new element with the story's system's blocks on offer, and works a picked one out as it is typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    // Nothing carried yet: the picker offers the template's blocks and no
    // other system's, and there is no field to type in.
    const picker = screen.getByTestId("stat-block-picker");
    expect(within(picker).getByRole("button", { name: "Add Defense" })).toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: "Add Attack" })).toBeInTheDocument();
    expect(screen.queryByText("Savage Worlds")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "AR" })).not.toBeInTheDocument();

    await user.click(within(picker).getByRole("button", { name: "Add Defense" }));
    const card = await screen.findByTestId("stat-block--90-defense");
    expect(within(card).getByRole("heading", { name: "Defense" })).toBeInTheDocument();
    expect(within(picker).queryByRole("button", { name: "Add Defense" })).not.toBeInTheDocument();
    // Fields are labelled by the stat's name, a stack's max among them.
    expect(within(card).getByRole("textbox", { name: "Rage max" })).toBeInTheDocument();

    const ar = within(card).getByRole("textbox", { name: "AR" });
    await user.clear(ar);
    await user.type(ar, "10");
    const sdc = within(card).getByRole("textbox", { name: "SDC value" });
    await user.clear(sdc);
    await user.type(sdc, "3");
    const max = within(card).getByRole("textbox", { name: "SDC max" });
    await user.clear(max);
    await user.type(max, "10");
    expect(screen.getByTestId("computed-current_ar")).toHaveTextContent("8");
    await user.clear(sdc);
    await user.type(sdc, "6");
    expect(screen.getByTestId("computed-current_ar")).toHaveTextContent("10");
  });

  it("titles a stat by its label, or its name without one, with the description as a tooltip", async () => {
    const user = userEvent.setup();
    const described: StatBlockSystems = {
      ...systems,
      systems: systems.systems.map((system) =>
        system.idSystem !== -90
          ? system
          : {
              ...system,
              definition: {
                groups: system.definition.groups.map((group) => ({
                  ...group,
                  stats: group.stats.map((stat) =>
                    stat.name === "sdc"
                      ? { ...stat, description: "Structural damage capacity", initialRoll: "3d6" }
                      : stat.name === "ar"
                        ? { ...stat, label: "" }
                        : stat,
                  ),
                })),
              },
            },
      ),
    };
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={described} />);
    await user.click(screen.getByRole("button", { name: "Add Defense" }));
    const card = await screen.findByTestId("stat-block--90-defense");
    expect(within(card).getByRole("textbox", { name: "ar" })).toBeInTheDocument();
    expect(within(card).getByText("Rage")).toBeInTheDocument();
    // What the stat is initialized as follows the description in the tooltip.
    await user.hover(within(card).getByText("SDC"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Structural damage capacity: 3d6");
  });

  it("adds every block at once, and Remove asks before taking one off, which is then not posted", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    await user.click(screen.getByRole("button", { name: "Add all" }));
    expect(await screen.findByTestId("stat-block--90-defense")).toBeInTheDocument();
    expect(screen.getByTestId("stat-block--90-attack")).toBeInTheDocument();
    expect(screen.queryByTestId("stat-block-picker")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Defense" }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(screen.queryByTestId("stat-block--90-defense")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Add Defense" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    const [, values] = sa_createElement.mock.calls[0].arguments;
    // As the schema hands them on: only the block carried.
    expect(values.statBlocks).toEqual({ "-90": { attack: [] } });
  });

  it("adds a row to a repeating block, keys it, works its computed stat out, and posts the rows", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    await user.click(screen.getByRole("button", { name: "Add all" }));
    expect(screen.queryAllByRole("row")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Add Attack row" }));
    const row = screen.getAllByRole("row")[1];
    await user.type(within(row).getByLabelText("Weapon"), "Sword");
    await user.type(within(row).getByLabelText("Strike"), "4");
    const ar = screen.getByRole("textbox", { name: "AR" });
    await user.clear(ar);
    await user.type(ar, "10");
    expect(within(row).getByTestId("computed-total")).toHaveTextContent("14");

    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    const [, values] = sa_createElement.mock.calls[0].arguments;
    expect((values.statBlocks as Record<string, Record<string, unknown>>)["-90"].attack).toEqual([
      { weapon: { value: "Sword" }, strike: { value: 4 }, total: {} },
    ]);
  });

  it("rolls a stat's Initialized as when its block is added, filling the value and the max alike", async () => {
    const user = userEvent.setup();
    const rolled: StatBlockSystems = {
      ...systems,
      systems: systems.systems.map((system) => ({
        ...system,
        definition: {
          groups: system.definition.groups.map((group) => ({
            ...group,
            stats: group.stats.map((stat) =>
              stat.name === "sdc" ? { ...stat, initialRoll: "2d6" } : stat,
            ),
          })),
        },
      })),
    };
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={rolled} />);

    await user.click(screen.getByRole("button", { name: "Add Defense" }));
    const value = await screen.findByRole("textbox", { name: "SDC value" });
    const max = screen.getByRole("textbox", { name: "SDC max" });
    const total = Number((value as HTMLInputElement).value);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(12);
    expect(max).toHaveValue(String(total));
    // A stat without one starts at 0 as before.
    expect(screen.getByRole("textbox", { name: "AR" })).toHaveValue("0");
  });

  it("gives each row of a group that can have multiples a Multiple box, 1 to start, posted with the row", async () => {
    const user = userEvent.setup();
    const withMultiples: StatBlockSystems = {
      ...systems,
      systems: systems.systems.map((system) => ({
        ...system,
        definition: {
          groups: system.definition.groups.map((group) =>
            group.name === "attack" ? { ...group, canHaveMultiples: true } : group,
          ),
        },
      })),
    };
    renderWithProviders(
      <ElementForm idStory={-15} kind="PERSON" statBlockSystems={withMultiples} />,
    );

    await user.click(screen.getByRole("button", { name: "Add all" }));
    // Each Attack row has its own Multiple, named by the row's key.
    await user.click(screen.getByRole("button", { name: "Add Attack row" }));
    const row = screen.getAllByRole("row")[1];
    expect(screen.getByRole("columnheader", { name: "Multiple" })).toBeInTheDocument();
    await user.type(within(row).getByLabelText("Weapon"), "Sword");
    const multiple = screen.getByRole("textbox", { name: "Sword multiple" });
    expect(multiple).toHaveValue("1");
    await user.clear(multiple);
    await user.type(multiple, "3");
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    const [, values] = sa_createElement.mock.calls[0].arguments;
    const attack = (values.statBlocks as Record<string, Record<string, unknown[]>>)["-90"].attack;
    expect(attack[0]).toMatchObject({ weapon: { value: "Sword" }, $multiple: { value: 3 } });
  });

  it("stars the first row as the default, and a star on another moves it to the front", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    await user.click(screen.getByRole("button", { name: "Add Attack" }));
    await user.click(await screen.findByRole("button", { name: "Add Attack row" }));
    await user.click(screen.getByRole("button", { name: "Add Attack row" }));
    const rows = () => screen.getAllByRole("row").slice(1);
    await user.type(within(rows()[0]).getByLabelText("Weapon"), "Sword");
    await user.type(within(rows()[1]).getByLabelText("Weapon"), "Bow");
    expect(
      within(rows()[0]).getByRole("img", { name: "Sword is the default" }),
    ).toBeInTheDocument();

    await user.click(within(rows()[1]).getByRole("button", { name: "Make Bow the default" }));
    expect(within(rows()[0]).getByLabelText("Weapon")).toHaveValue("Bow");
    expect(within(rows()[0]).getByRole("img", { name: "Bow is the default" })).toBeInTheDocument();
    expect(
      within(rows()[1]).getByRole("button", { name: "Make Sword the default" }),
    ).toBeInTheDocument();
  });

  it("refuses two rows with one key in the browser, on the later row, and removes a row by its trashcan", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    await user.click(screen.getByRole("button", { name: "Add Attack" }));
    await user.click(await screen.findByRole("button", { name: "Add Attack row" }));
    await user.click(screen.getByRole("button", { name: "Add Attack row" }));
    const rows = () => screen.getAllByRole("row").slice(1);
    expect(rows()).toHaveLength(2);
    await user.type(within(rows()[0]).getByLabelText("Weapon"), "Sword");
    await user.type(within(rows()[1]).getByLabelText("Weapon"), "Sword");
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    expect(await screen.findAllByText("Another row has this Weapon.")).toHaveLength(1);
    expect(within(rows()[1]).getByText("Another row has this Weapon.")).toBeInTheDocument();
    expect(sa_createElement.mock.callCount()).toBe(0);

    await user.click(screen.getAllByRole("button", { name: "Remove Sword" })[1]);
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("starts an edit from stored rows, dropping one whose key is gone", () => {
    renderWithProviders(
      <ElementForm
        idStory={-15}
        statBlockSystems={systems}
        element={{
          idElement: 9,
          values: {
            ...grok,
            statBlocks: {
              "-90": {
                defense: { ar: { value: 12 } },
                attack: [
                  { weapon: { value: "Sword" }, strike: { value: 4 } },
                  { strike: { value: 9 } },
                ],
              },
            },
          },
        }}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByDisplayValue("Sword")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("9")).not.toBeInTheDocument();
    expect(screen.getByTestId("computed-total")).toHaveTextContent("16");
  });

  it("refuses a pool above its max in the browser, and shows the action's error on the stat", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    await user.click(screen.getByRole("button", { name: "Add Defense" }));
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    const sdc = await screen.findByRole("textbox", { name: "SDC value" });
    await user.clear(sdc);
    await user.type(sdc, "5");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    expect(await screen.findByText("That is above the max of 0.")).toBeInTheDocument();
    expect(sa_createElement.mock.callCount()).toBe(0);

    const max = screen.getByRole("textbox", { name: "SDC max" });
    await user.clear(max);
    await user.type(max, "9");
    sa_createElement.mock.mockImplementation(async () => ({
      ok: false,
      errors: { "statBlocks.-90.defense.ar.value": "Not on this element." },
    }));
    await user.click(screen.getByRole("button", { name: "Create element" }));
    expect(await screen.findByText("Not on this element.")).toBeInTheDocument();
  });

  it("starts an edit from the story's system's stored block alone, read against its template", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ElementForm
        idStory={-15}
        statBlockSystems={systems}
        element={{
          idElement: 9,
          values: {
            ...grok,
            statBlocks: {
              // Another system's block, left alone; stale: a word in a
              // pool, and a group and a system the template does not know.
              "-7": { traits: { agility: { value: "d8" } } },
              "-90": {
                defense: { ar: { value: 12 }, sdc: { value: "lots", max: 4 }, rage: { value: 1 } },
                gone: {},
              },
              "-999": { gone: {} },
            },
          },
        }}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "agility" })).not.toBeInTheDocument();
    expect(screen.queryByText("Savage Worlds")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "AR" })).toHaveValue("12");
    expect(screen.getByRole("textbox", { name: "SDC value" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add Attack" })).toBeInTheDocument();

    // The word made the whole stored pool unfit, so its value and max start
    // empty and the schema refuses them until typed; only the story's
    // system's block is then posted.
    expect(screen.getByRole("textbox", { name: "SDC max" })).toHaveValue("");
    await user.type(screen.getByRole("textbox", { name: "SDC value" }), "2");
    await user.type(screen.getByRole("textbox", { name: "SDC max" }), "4");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(sa_updateElement.mock.callCount()).toBe(1));
    const [, values] = sa_updateElement.mock.calls[0].arguments;
    expect(Object.keys(values.statBlocks ?? {})).toEqual(["-90"]);
    expect(values.removedSystems).toEqual([]);
  });

  it("draws no section for a story with no system, and posts no blocks", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ElementForm
        idStory={-15}
        kind="PERSON"
        statBlockSystems={{ ...systems, storySystem: null }}
      />,
    );
    expect(screen.queryByTestId("stat-block-fields")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    expect(sa_createElement.mock.calls[0].arguments[1].statBlocks).toEqual({});
  });

  it("keeps a stat held to a number to digits, and puts a sticky stat on the next one's line", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={numbered} />);
    await user.click(screen.getByRole("button", { name: "Add Defense" }));
    const card = await screen.findByTestId("stat-block--90-defense");

    const ar = within(card).getByRole("textbox", { name: "AR" });
    await user.clear(ar);
    await user.type(ar, "12abc");
    expect(ar).toHaveValue("12");
    await user.clear(ar);
    await user.paste("-1.5x");
    expect(ar).toHaveValue("-1.5");
    const sdc = within(card).getByRole("textbox", { name: "SDC value" });
    await user.clear(sdc);
    await user.type(sdc, "3-");
    expect(sdc).toHaveValue("3");

    // AR sticks to SDC: one line for the two, then the rest each on their own.
    const lines = card.querySelectorAll("[data-stat-line]");
    expect(lines).toHaveLength(3);
    expect(
      within(lines[0] as HTMLElement).getByRole("textbox", { name: "AR" }),
    ).toBeInTheDocument();
    expect(
      within(lines[0] as HTMLElement).getByRole("textbox", { name: "SDC value" }),
    ).toBeInTheDocument();
  });

  it("takes dice as xdy, posting d8 as 1d8 and a blank as it is", async () => {
    const user = userEvent.setup();
    const armed: StatBlockSystems = {
      storySystem: -90,
      systems: [
        {
          idSystem: -90,
          label: "Palladium",
          definition: {
            groups: [
              {
                name: "arms",
                label: "Arms",
                keyedBy: "",
                rollAll: false,
                canHaveMultiples: false,
                stats: [
                  {
                    ...systems.systems[0].definition.groups[0].stats[0],
                    name: "damage",
                    label: "Damage",
                    type: "dice",
                  },
                  {
                    ...systems.systems[0].definition.groups[0].stats[0],
                    name: "spare",
                    label: "Spare",
                    type: "dice",
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={armed} />);
    await user.click(screen.getByRole("button", { name: "Add Arms" }));
    const card = await screen.findByTestId("stat-block--90-arms");
    const damage = within(card).getByRole("textbox", { name: "Damage" });
    expect(damage).toHaveAttribute("placeholder", "2d6");

    await user.type(damage, "six");
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    expect(await within(card).findByText("Write dice as 2d6, d8 or 2d6+2.")).toBeInTheDocument();
    expect(sa_createElement.mock.callCount()).toBe(0);

    await user.clear(damage);
    await user.type(damage, "d8");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    const [, values] = sa_createElement.mock.calls[0].arguments;
    expect(values.statBlocks).toEqual({
      "-90": { arms: { damage: { value: "1d8" }, spare: {} } },
    });
  });

  it("posts no blocks at all without the systems, so the element's are left alone", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" />);
    expect(screen.queryByTestId("stat-block-fields")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    const [, values] = sa_createElement.mock.calls[0].arguments;
    expect(values.statBlocks).toBeUndefined();
    expect(values.removedSystems).toBeUndefined();
  });
});
