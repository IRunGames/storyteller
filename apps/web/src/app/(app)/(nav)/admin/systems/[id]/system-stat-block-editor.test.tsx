import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { AdminSystemDetail } from "@/app/(app)/(nav)/admin/systems/actions";
import type { StatBlockDefinition } from "@/lib/stat-blocks";

type Result = { ok: true } | { ok: false; errors: Record<string, string> };

const sa_setSystemStatBlockDefinition = mock.fn<
  (idSystem: number, definition: StatBlockDefinition) => Promise<Result>
>(async () => ({ ok: true }));

let SystemStatBlockEditor: typeof import("./system-stat-block-editor").SystemStatBlockEditor;

const system: AdminSystemDetail = {
  idSystem: -90,
  label: "Palladium Fantasy Role-Playing Game (2e)",
  systemName: "Palladium Fantasy Role-Playing Game",
  systemVersion: "2e",
  variant: null,
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
            connectedTo: "",
            computedAs: "",
            visible: true,
            format: "",
            description: "",
            sticky: false,
            static: false,
            roll: "",
            global: false,
            upDown: false,
          },
          {
            name: "sdc",
            label: "SDC",
            type: "pool",
            rack: [],
            connectedTo: "",
            computedAs: "",
            visible: true,
            format: "",
            description: "",
            sticky: false,
            static: false,
            roll: "",
            global: false,
            upDown: true,
          },
        ],
      },
    ],
  },
};

// A group with every kind of stat a key may or may not be: a display, a
// pool, a rack and a display fed by a connection.
const keyable: AdminSystemDetail = {
  idSystem: -91,
  label: "Keyable",
  systemName: "Keyable",
  systemVersion: null,
  variant: null,
  definition: {
    groups: [
      {
        name: "attack",
        label: "Attack",
        keyedBy: "",
        rollAll: false,
        canHaveMultiples: false,
        stats: [
          {
            name: "ar",
            label: "AR",
            type: "display",
            rack: [],
            connectedTo: "",
            computedAs: "",
            visible: true,
            format: "",
            description: "",
            sticky: false,
            static: false,
            roll: "",
            global: false,
            upDown: false,
          },
          {
            name: "sdc",
            label: "",
            type: "pool",
            rack: [],
            connectedTo: "",
            computedAs: "",
            visible: true,
            format: "",
            description: "",
            sticky: false,
            static: false,
            roll: "",
            global: false,
            upDown: true,
          },
          {
            name: "die",
            label: "",
            type: "rack",
            rack: ["d4"],
            connectedTo: "",
            computedAs: "",
            visible: true,
            format: "",
            description: "",
            sticky: false,
            static: false,
            roll: "",
            global: false,
            upDown: true,
          },
          {
            name: "shown",
            label: "",
            type: "display",
            rack: [],
            connectedTo: "ar",
            computedAs: "",
            visible: true,
            format: "",
            description: "",
            sticky: false,
            static: false,
            roll: "",
            global: false,
            upDown: true,
          },
        ],
      },
    ],
  },
};

// The same group, repeating by AR.
const keyed: AdminSystemDetail = {
  ...keyable,
  definition: { groups: [{ ...keyable.definition.groups[0], keyedBy: "ar" }] },
};

/** A group's accordion trigger, by the name it shows closed. */
const groupTrigger = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
/** Every group starts closed, so a test opens the one it works in first. */
const openGroup = (user: UserEvent, name: string) => user.click(groupTrigger(name));

describe("SystemStatBlockEditor", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/admin/systems/actions", {
      namedExports: { sa_setSystemStatBlockDefinition },
    });
    ({ SystemStatBlockEditor } = await import("./system-stat-block-editor"));
  });

  beforeEach(() => {
    sa_setSystemStatBlockDefinition.mock.resetCalls();
    sa_setSystemStatBlockDefinition.mock.mockImplementation(async () => ({ ok: true }));
  });

  afterEach(() => toaster.remove());

  it("starts with every group closed to its name, label and whether it repeats", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={keyed} />);

    expect(groupTrigger("attack")).toHaveTextContent("attack (4)AttackRepeats by AR");
    expect(groupTrigger("attack")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Group name" })).not.toBeInTheDocument();
    // Moving and removing a group do not need it open.
    expect(screen.getByRole("button", { name: "Remove group" })).toBeInTheDocument();

    await openGroup(user, "attack");
    expect(groupTrigger("attack")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("attack");
    expect(screen.getByRole("combobox", { name: "Repeats by" })).toHaveValue("ar");
  });

  it("opens every group and closes every group by the chevrons on the Groups tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await user.click(screen.getByRole("button", { name: "Add group" }));
    expect(groupTrigger("defense")).toHaveAttribute("aria-expanded", "false");
    expect(groupTrigger("New group")).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Open all groups" }));
    expect(groupTrigger("defense")).toHaveAttribute("aria-expanded", "true");
    expect(groupTrigger("New group")).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Close all groups" }));
    expect(groupTrigger("defense")).toHaveAttribute("aria-expanded", "false");
    expect(groupTrigger("New group")).toHaveAttribute("aria-expanded", "false");
  });

  it("draws a group that repeats with a double boundary, following the Repeats by field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={keyable} />);

    expect(groupTrigger("attack")).not.toHaveTextContent("Repeats");
    expect(document.querySelector("[data-repeating]")).toBeNull();
    await openGroup(user, "attack");
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeats by" }), "die");
    expect(groupTrigger("attack")).toHaveTextContent("Repeats by die");
    expect(document.querySelector("[data-repeating]")).not.toBeNull();
  });

  it("starts from the system's definition, and shows the fields each type uses", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("defense");
    const names = screen.getAllByRole("textbox", { name: "Name" });
    expect(names.map((input) => (input as HTMLInputElement).value)).toEqual(["ar", "sdc"]);
    expect(screen.getAllByRole("combobox", { name: "Type" })[1]).toHaveValue("pool");
    // A display and a pool take a connection; neither has a rack or a formula.
    expect(screen.getAllByRole("textbox", { name: /Connected to/ })).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: "Rack entries" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Formula" })).not.toBeInTheDocument();
    // Every stat is visible unless the definition says otherwise.
    const visible = screen.getAllByRole("checkbox", { name: "Visible" });
    expect(visible).toHaveLength(2);
    expect(visible[0]).toBeChecked();
  });

  it("adds a stat, defaults a pool's format to number, and changing its type to rack brings the rack field out", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    await user.click(screen.getByRole("button", { name: "Add stat" }));
    const types = screen.getAllByRole("combobox", { name: "Type" });
    expect(types).toHaveLength(3);
    // A new stat is a display with no format; made a pool it starts as a
    // number, and a format once chosen is kept through a change of type.
    expect(screen.getAllByRole("combobox", { name: "Format" })[2]).toHaveValue("");
    await user.selectOptions(types[2], "Pool");
    expect(screen.getAllByRole("combobox", { name: "Format" })[2]).toHaveValue("number");
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Format" })[2], "number +/-");
    await user.selectOptions(types[2], "Stack");
    expect(screen.getAllByRole("combobox", { name: "Format" })[2]).toHaveValue("number +/-");
    await user.selectOptions(types[2], "Rack");
    expect(screen.getAllByRole("combobox", { name: "Format" })).toHaveLength(2);
    expect(await screen.findByRole("textbox", { name: "Rack entries" })).toBeInTheDocument();
    await user.selectOptions(types[2], "Computed");
    expect(await screen.findByRole("textbox", { name: "Formula" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Rack entries" })).not.toBeInTheDocument();
    // Dice take nothing but their flags: no format, die, rack or formula.
    await user.selectOptions(types[2], "Dice");
    expect(screen.queryByRole("textbox", { name: "Formula" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: "Format" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Roll for/ })).toHaveLength(1);
    await user.type(screen.getAllByRole("textbox", { name: "Name" })[2], "damage");
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const saved = sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1];
    expect(saved.groups[0].stats[2]).toMatchObject({ name: "damage", type: "dice", format: "" });
  });

  it("adds a group, open for its name, and removes one", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    await user.click(screen.getByRole("button", { name: "Add group" }));
    expect(groupTrigger("New group")).toHaveAttribute("aria-expanded", "true");
    // Only the new group is open; defense stays closed.
    expect(screen.getAllByRole("textbox", { name: "Group name" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("");
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "saves");
    expect(groupTrigger("saves")).toHaveTextContent("saves (0)");

    await user.click(screen.getAllByRole("button", { name: "Remove group" })[0]);
    expect(screen.queryByRole("button", { name: /^defense/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("saves");
  });

  it("moves a stat up or down its group, and saves the stats in that order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    const names = () =>
      screen
        .getAllByRole("textbox", { name: "Name" })
        .map((input) => (input as HTMLInputElement).value);
    // The first row cannot go up and the last cannot go down.
    expect(screen.getAllByRole("button", { name: "Move up" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move down" })[1]).toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: "Move up" })[1]);
    expect(names()).toEqual(["sdc", "ar"]);
    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    expect(names()).toEqual(["ar", "sdc"]);
    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]);

    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const saved = sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1];
    expect(saved.groups[0].stats.map((stat) => stat.name)).toEqual(["sdc", "ar"]);
  });

  it("moves a group up or down the definition, open or closed, and saves the groups in that order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    await user.click(screen.getByRole("button", { name: "Add group" }));
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "saves");
    const groupNames = () =>
      screen
        .getAllByRole("button", { name: /^(defense|saves)/ })
        .map((trigger) => trigger.textContent?.split(" (")[0]);
    expect(screen.getAllByRole("button", { name: "Move group up" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move group down" })[1]).toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: "Move group up" })[1]);
    expect(groupNames()).toEqual(["saves", "defense"]);
    // The open state travels with the group: saves is still the open one.
    expect(groupTrigger("saves")).toHaveAttribute("aria-expanded", "true");
    expect(groupTrigger("defense")).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getAllByRole("button", { name: "Move group down" })[0]);
    expect(groupNames()).toEqual(["defense", "saves"]);
    await user.click(screen.getAllByRole("button", { name: "Move group down" })[0]);

    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const saved = sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1];
    expect(saved.groups.map((group) => group.name)).toEqual(["saves", "defense"]);
  });

  it("lets a group repeat by one of its displays or racks that is not connected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={keyable} />);
    await openGroup(user, "attack");

    const select = screen.getByRole("combobox", { name: "Repeats by" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Does not repeat", "AR", "die"]);
    await user.selectOptions(select, "ar");
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.calls.length).toBe(1));
    expect(sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1].groups[0].keyedBy).toBe("ar");
  });

  it("says on the group when its key stat is gone", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={keyed} />);
    await openGroup(user, "attack");

    await user.click(screen.getAllByRole("button", { name: "Remove stat" })[0]);
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    expect(await screen.findByText("There is no stat ar in this group.")).toBeInTheDocument();
    expect(sa_setSystemStatBlockDefinition.mock.calls.length).toBe(0);
  });

  it("says in the browser where a formula points at nothing, and does not save", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    await user.click(screen.getByRole("button", { name: "Add stat" }));
    const row = screen.getAllByRole("textbox", { name: "Name" })[2];
    await user.type(row, "current_ar");
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Type" })[2], "Computed");
    await user.type(await screen.findByRole("textbox", { name: "Formula" }), "defense.armour - 2");
    await user.click(screen.getByRole("button", { name: "Save stat block" }));

    expect(await screen.findByText("There is no stat defense.armour.")).toBeInTheDocument();
    expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(0);
  });

  it("opens a closed group the browser check finds an error in", async () => {
    const user = userEvent.setup();
    const broken: AdminSystemDetail = {
      ...system,
      definition: {
        groups: [
          {
            ...system.definition.groups[0],
            stats: [{ ...system.definition.groups[0].stats[0], connectedTo: "nothing" }],
          },
        ],
      },
    };
    renderWithProviders(<SystemStatBlockEditor system={broken} />);

    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    expect(await screen.findByText(/There is no stat nothing/)).toBeInTheDocument();
    expect(groupTrigger("defense")).toHaveAttribute("aria-expanded", "true");
    expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(0);
  });

  it("saves a stat unticked as not visible, its With next and Static boxes, and a format", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    // A display and a pool take a format, so AR and SDC both have one.
    const formats = screen.getAllByRole("combobox", { name: "Format" });
    expect(formats).toHaveLength(2);
    expect(
      within(formats[1])
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["<none>", "number", "number +/-"]);
    expect(screen.getAllByRole("checkbox", { name: "With next" })).toHaveLength(2);
    await user.click(screen.getAllByRole("checkbox", { name: "Visible" })[0]);
    await user.selectOptions(formats[0], "number");
    await user.selectOptions(formats[1], "number +/-");
    await user.click(screen.getAllByRole("checkbox", { name: "With next" })[1]);
    expect(screen.getAllByRole("checkbox", { name: "Static" })).toHaveLength(2);
    await user.click(screen.getAllByRole("checkbox", { name: "Static" })[0]);
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const saved = sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1];
    expect(saved.groups[0].stats.map((stat) => stat.visible)).toEqual([false, true]);
    expect(saved.groups[0].stats.map((stat) => stat.format)).toEqual(["number", "number +/-"]);
    expect(saved.groups[0].stats.map((stat) => stat.sticky)).toEqual([false, true]);
    expect(saved.groups[0].stats.map((stat) => stat.static)).toEqual([true, false]);
  });

  it("offers Can Have Multiples on the line of a group that repeats, saying what it does, and saves it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={keyable} />);

    // A plain group has no box; one that repeats has it on its line.
    expect(screen.queryByRole("checkbox", { name: "Can Have Multiples" })).toBeNull();
    await openGroup(user, "attack");
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeats by" }), "ar");
    const box = screen.getByRole("checkbox", { name: "Can Have Multiples" });
    expect(box).not.toBeChecked();
    await user.hover(box);
    expect(
      await screen.findByText(
        "Let an element say how many of this group it has; Roll all rolls it that many times",
      ),
    ).toBeInTheDocument();
    await user.click(box);
    expect(groupTrigger("attack")).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    expect(
      sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1].groups[0].canHaveMultiples,
    ).toBe(true);
    // Made plain again, the group loses the box and the flag with it.
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeats by" }), "");
    expect(screen.queryByRole("checkbox", { name: "Can Have Multiples" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(2));
    expect(
      sa_setSystemStatBlockDefinition.mock.calls[1].arguments[1].groups[0].canHaveMultiples,
    ).toBe(false);
  });

  it("offers Roll all on the line of a group that repeats, and saves it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={keyable} />);

    expect(screen.queryByRole("checkbox", { name: "Roll all" })).toBeNull();
    await openGroup(user, "attack");
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeats by" }), "ar");
    const box = screen.getByRole("checkbox", { name: "Roll all" });
    await user.hover(box);
    expect(
      await screen.findByText("Offer a die on the group that rolls the first die of every row"),
    ).toBeInTheDocument();
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    expect(sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1].groups[0].rollAll).toBe(true);
    // Made plain again, the group loses the box and the flag with it.
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeats by" }), "");
    expect(screen.queryByRole("checkbox", { name: "Roll all" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(2));
    expect(sa_setSystemStatBlockDefinition.mock.calls[1].arguments[1].groups[0].rollAll).toBe(
      false,
    );
  });

  it("offers Up/down only on a stat held to a number, saying what it does, and saves it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    // Neither AR nor SDC is held to a number yet, so neither has the box.
    expect(screen.queryByRole("checkbox", { name: "Up/down" })).toBeNull();
    const formats = screen.getAllByRole("combobox", { name: "Format" });
    // SDC held to a number shows its box, ticked as the template has it.
    await user.selectOptions(formats[1], "number");
    const box = screen.getByRole("checkbox", { name: "Up/down" });
    expect(box).toBeChecked();
    await user.hover(box);
    expect(
      await screen.findByText("Show up/down changer on editable number values"),
    ).toBeInTheDocument();
    // AR held to a number gets the box too, and loses it, unticked, with the number.
    await user.selectOptions(formats[0], "number");
    expect(screen.getAllByRole("checkbox", { name: "Up/down" })).toHaveLength(2);
    await user.click(screen.getAllByRole("checkbox", { name: "Up/down" })[0]);
    await user.selectOptions(formats[0], "");
    expect(screen.getAllByRole("checkbox", { name: "Up/down" })).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "Up/down" }));
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const saved = sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1];
    expect(saved.groups[0].stats.map((stat) => stat.upDown)).toEqual([false, false]);
  });

  it("offers Global only on a stat with a die, saying what it does, and saves it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    // AR is a display with no format, so only the SDC pool has the box.
    expect(screen.getAllByRole("checkbox", { name: "Global" })).toHaveLength(1);
    await user.hover(screen.getByRole("checkbox", { name: "Global" }));
    expect(
      await screen.findByText("Offer to roll this for all participants from the run page"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Global" }));
    // AR held to a number gets the box too, and loses it, unticked, with the number.
    const formats = screen.getAllByRole("combobox", { name: "Format" });
    await user.selectOptions(formats[0], "number");
    expect(screen.getAllByRole("checkbox", { name: "Global" })).toHaveLength(2);
    await user.click(screen.getAllByRole("checkbox", { name: "Global" })[0]);
    await user.selectOptions(formats[0], "");
    expect(screen.getAllByRole("checkbox", { name: "Global" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const saved = sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1];
    expect(saved.groups[0].stats.map((stat) => stat.global)).toEqual([false, true]);
  });

  it("gives a pool or a stack a die that picks its roll, a preset or a custom one", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    // AR is a display with no format, so only SDC has a die, ghost while
    // nothing is set; held to a number, AR gets one too, and loses it again
    // with the format.
    expect(screen.queryByRole("button", { name: "Roll for AR" })).not.toBeInTheDocument();
    const formats = screen.getAllByRole("combobox", { name: "Format" });
    await user.selectOptions(formats[0], "number +/-");
    expect(screen.getByRole("button", { name: "Roll for AR" })).toBeInTheDocument();
    await user.selectOptions(formats[0], "");
    expect(screen.queryByRole("button", { name: "Roll for AR" })).not.toBeInTheDocument();
    const die = screen.getByRole("button", { name: "Roll for SDC" });
    expect(die).not.toHaveAttribute("data-roll");
    await user.click(die);
    const select = await screen.findByRole("combobox", { name: "Roll" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["<none>", "1d6", "2d6", "1d8", "1d10", "1d12", "1d20", "Custom"]);
    await user.selectOptions(select, "1d8");
    expect(die).toHaveAttribute("data-roll", "1d8");

    await user.selectOptions(select, "custom");
    const customBox = await screen.findByRole("textbox", { name: "Custom roll" });
    expect(customBox).toHaveValue("");
    await user.type(customBox, "2d6+1");
    expect(die).toHaveAttribute("data-roll", "2d6+1");

    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const saved = sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1];
    expect(saved.groups[0].stats.map((stat) => stat.roll)).toEqual(["", "2d6+1"]);
  });

  it("says in the die's popover when a custom roll cannot be read, and does not save", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    await user.click(screen.getByRole("button", { name: "Roll for SDC" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Roll" }), "custom");
    await user.type(await screen.findByRole("textbox", { name: "Custom roll" }), "twelve");
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    expect(
      await screen.findByText("That is not a roll I can read. Try 2d6+1."),
    ).toBeInTheDocument();
    expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(0);
  });

  it("saves the definition with each rack split, and says so", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <SystemStatBlockEditor system={system} />
        <Toaster />
      </>,
    );
    await openGroup(user, "defense");

    await user.click(screen.getByRole("button", { name: "Add stat" }));
    await user.type(screen.getAllByRole("textbox", { name: "Name" })[2], "die");
    await user.type(
      screen.getAllByRole("textbox", { name: "Description (optional)" })[2],
      "The die the weapon rolls",
    );
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Type" })[2], "Rack");
    await user.type(await screen.findByRole("textbox", { name: "Rack entries" }), "d4, d6, 8");
    await user.click(screen.getByRole("button", { name: "Save stat block" }));

    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const [idSystem, definition] = sa_setSystemStatBlockDefinition.mock.calls[0].arguments;
    expect(idSystem).toBe(-90);
    expect(definition.groups[0].stats[2]).toEqual({
      name: "die",
      label: "",
      description: "The die the weapon rolls",
      type: "rack",
      rack: ["d4", "d6", 8],
      connectedTo: "",
      computedAs: "",
      visible: true,
      format: "",
      sticky: false,
      static: false,
      roll: "",
      global: false,
      upDown: false,
    });
    expect(await screen.findByText("Stat block saved.")).toBeInTheDocument();
    // The save resets the form; the group that was open stays open.
    expect(groupTrigger("defense")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("defense");
  });

  it("puts the action's field error on its field, opening its group, and a root error above the form", async () => {
    const user = userEvent.setup();
    sa_setSystemStatBlockDefinition.mock.mockImplementation(async () => ({
      ok: false,
      errors: {
        "groups.0.stats.1.connectedTo": "Not that one.",
        root: "That system is no longer there.",
      },
    }));
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    expect(await screen.findByText("Not that one.")).toBeInTheDocument();
    expect(groupTrigger("defense")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("That system is no longer there.");
  });

  it("shows the definition as JSON on its tab, following the form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    await openGroup(user, "defense");

    await user.type(screen.getAllByRole("textbox", { name: "Label (optional)" })[0], "!");
    await user.click(screen.getByRole("tab", { name: "JSON" }));
    const panel = await screen.findByRole("tabpanel");
    expect(within(panel).getByText(/"label": "AR!"/)).toBeInTheDocument();
    expect(within(panel).getByText(/"rack": \[\]/)).toBeInTheDocument();
    expect(panel.textContent?.match(/"visible": true/g)).toHaveLength(2);
  });
});
