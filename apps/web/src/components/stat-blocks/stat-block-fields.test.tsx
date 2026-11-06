import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { ElementValues } from "@/lib/element-schemas";
import type { StatBlockSystems } from "@/app/(app)/(nav)/libraries/actions";

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
            stats: [
              {
                name: "ar",
                label: "AR",
                type: "display",
                rack: [],
                connectedTo: "",
                computedAs: "",
              },
              {
                name: "sdc",
                label: "SDC",
                type: "pool",
                rack: [],
                connectedTo: "",
                computedAs: "",
              },
              {
                name: "current_ar",
                label: "Current AR",
                type: "computed",
                rack: [],
                connectedTo: "",
                computedAs:
                  "if(defense.sdc.value < defense.sdc.max / 2, defense.ar.value - 2, defense.ar.value)",
              },
              {
                name: "rage",
                label: "Rage",
                type: "stack",
                rack: [],
                connectedTo: "ar",
                computedAs: "",
              },
            ],
          },
          // Repeats by weapon, with a computed stat reading its own row and
          // the defense group.
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
              {
                name: "strike",
                label: "Strike",
                type: "display",
                rack: [],
                connectedTo: "",
                computedAs: "",
              },
              {
                name: "total",
                label: "Total",
                type: "computed",
                rack: [],
                connectedTo: "",
                computedAs: "attack.strike.value + defense.ar.value",
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
            stats: [
              {
                name: "agility",
                label: "Agility",
                type: "rack",
                rack: ["d4", "d6", "d8"],
                connectedTo: "",
                computedAs: "",
              },
            ],
          },
        ],
      },
    },
  ],
};

describe("ElementForm stat blocks", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/libraries/actions", {
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

  it("starts a new element with the story's system's block, worked out as it is typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    const card = screen.getByTestId("stat-block--90");
    expect(within(card).getByRole("heading", { name: /Palladium/ })).toBeInTheDocument();
    expect(screen.queryByTestId("stat-block--7")).not.toBeInTheDocument();
    // The stack's max is fed by AR, so it has no max field of its own.
    expect(within(card).getByText(/max 0 from AR/)).toBeInTheDocument();
    expect(within(card).queryByRole("textbox", { name: "Rage max" })).not.toBeInTheDocument();

    const ar = within(card).getByRole("textbox", { name: "AR" });
    await user.clear(ar);
    await user.type(ar, "10");
    const sdc = within(card).getByRole("textbox", { name: "SDC value" });
    await user.clear(sdc);
    await user.type(sdc, "3");
    const max = within(card).getByRole("textbox", { name: "SDC max" });
    await user.clear(max);
    await user.type(max, "10");
    expect(screen.getByTestId("computed-Current AR")).toHaveTextContent("8");
    await user.clear(sdc);
    await user.type(sdc, "6");
    expect(screen.getByTestId("computed-Current AR")).toHaveTextContent("10");
    expect(within(card).getByText(/max 10 from AR/)).toBeInTheDocument();
  });

  it("adds a block for another system and takes it off again, naming it as removed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    await user.selectOptions(screen.getByRole("combobox", { name: /Add a stat block/ }), "-7");
    const added = await screen.findByTestId("stat-block--7");
    expect(within(added).getByRole("combobox", { name: "Agility" })).toHaveValue("d4");
    // Both present, so there is nothing left to add.
    expect(screen.queryByRole("combobox", { name: /Add a stat block/ })).not.toBeInTheDocument();

    await user.click(
      within(added).getByRole("button", { name: "Remove the Savage Worlds stat block" }),
    );
    await waitFor(() => expect(screen.queryByTestId("stat-block--7")).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: /Add a stat block/ })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    const [, values] = sa_createElement.mock.calls[0].arguments;
    expect(values.removedSystems).toEqual([-7]);
    // As the schema hands them on: numbers, and nothing for a computed stat.
    expect(values.statBlocks).toEqual({
      "-90": {
        defense: {
          ar: { value: 0 },
          sdc: { value: 0, min: 0, max: 0 },
          current_ar: {},
          rage: { value: 0 },
        },
        attack: [],
      },
    });
  });

  it("adds a row to a repeating group, keys it, works its computed stat out, and posts the rows", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    expect(screen.queryAllByRole("row")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Add Attack" }));
    const row = screen.getAllByRole("row")[1];
    await user.type(within(row).getByLabelText("Weapon"), "Sword");
    await user.type(within(row).getByLabelText("Strike"), "4");
    const ar = screen.getByRole("textbox", { name: "AR" });
    await user.clear(ar);
    await user.type(ar, "10");
    expect(within(row).getByTestId("computed-Total")).toHaveTextContent("14");

    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    const [, values] = sa_createElement.mock.calls[0].arguments;
    expect((values.statBlocks as Record<string, Record<string, unknown>>)["-90"].attack).toEqual([
      { weapon: { value: "Sword" }, strike: { value: 4 }, total: {} },
    ]);
  });

  it("refuses two rows with one key in the browser, on the later row, and removes a row by its trashcan", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    await user.click(screen.getByRole("button", { name: "Add Attack" }));
    await user.click(screen.getByRole("button", { name: "Add Attack" }));
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
            kind: "PERSON",
            name: "Grok",
            initialName: "",
            title: "",
            description: "",
            notes: "",
            url: "",
            urlText: "",
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
    expect(screen.getByTestId("computed-Total")).toHaveTextContent("16");
  });

  it("refuses a pool above its max in the browser, and shows the action's error on the stat", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" statBlockSystems={systems} />);

    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Grok");
    const sdc = screen.getByRole("textbox", { name: "SDC value" });
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

  it("starts an edit from the element's stored blocks, each read against its definition", () => {
    renderWithProviders(
      <ElementForm
        idStory={-15}
        statBlockSystems={{ ...systems, storySystem: null }}
        element={{
          idElement: 9,
          values: {
            kind: "PERSON",
            name: "Grok",
            initialName: "",
            title: "",
            description: "",
            notes: "",
            url: "",
            urlText: "",
            statBlocks: {
              "-7": { traits: { agility: { value: "d8" } } },
              // Stale: a word in a pool, and a system the list does not know.
              "-90": { defense: { ar: { value: 12 }, sdc: { value: "lots", max: 4 } } },
              "-999": { gone: {} },
            },
          },
        }}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Agility" })).toHaveValue("d8");
    expect(screen.getByRole("textbox", { name: "AR" })).toHaveValue("12");
    expect(screen.getByRole("textbox", { name: "SDC value" })).toHaveValue("");
    expect(screen.queryByTestId("stat-block--999")).not.toBeInTheDocument();
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
