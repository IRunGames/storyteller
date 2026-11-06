import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
        stats: [
          { name: "ar", label: "AR", type: "display", rack: [], connectedTo: "", computedAs: "" },
          { name: "sdc", label: "SDC", type: "pool", rack: [], connectedTo: "", computedAs: "" },
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
        stats: [
          { name: "ar", label: "AR", type: "display", rack: [], connectedTo: "", computedAs: "" },
          { name: "sdc", label: "", type: "pool", rack: [], connectedTo: "", computedAs: "" },
          { name: "die", label: "", type: "rack", rack: ["d4"], connectedTo: "", computedAs: "" },
          {
            name: "shown",
            label: "",
            type: "display",
            rack: [],
            connectedTo: "ar",
            computedAs: "",
          },
        ],
      },
    ],
  },
};

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

  it("starts from the system's definition, and shows the fields each type uses", () => {
    renderWithProviders(<SystemStatBlockEditor system={system} />);
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("defense");
    const names = screen.getAllByRole("textbox", { name: "Name" });
    expect(names.map((input) => (input as HTMLInputElement).value)).toEqual(["ar", "sdc"]);
    expect(screen.getAllByRole("combobox", { name: "Type" })[1]).toHaveValue("pool");
    // A display and a pool take a connection; neither has a rack or a formula.
    expect(screen.getAllByRole("textbox", { name: /Connected to/ })).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: "Rack entries" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Formula" })).not.toBeInTheDocument();
  });

  it("adds a stat, and changing its type to rack brings the rack field out", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    await user.click(screen.getByRole("button", { name: "Add stat" }));
    const types = screen.getAllByRole("combobox", { name: "Type" });
    expect(types).toHaveLength(3);
    await user.selectOptions(types[2], "Rack");
    expect(await screen.findByRole("textbox", { name: "Rack entries" })).toBeInTheDocument();
    await user.selectOptions(types[2], "Computed");
    expect(await screen.findByRole("textbox", { name: "Formula" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Rack entries" })).not.toBeInTheDocument();
  });

  it("adds a group and removes one", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    await user.click(screen.getByRole("button", { name: "Add group" }));
    expect(screen.getAllByRole("textbox", { name: "Group name" })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "Remove group" })[0]);
    expect(screen.getAllByRole("textbox", { name: "Group name" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("");
  });

  it("moves a stat up or down its group, and saves the stats in that order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

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

  it("moves a group up or down the definition, and saves the groups in that order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    await user.click(screen.getByRole("button", { name: "Add group" }));
    await user.type(screen.getAllByRole("textbox", { name: "Group name" })[1], "saves");
    const groupNames = () =>
      screen
        .getAllByRole("textbox", { name: "Group name" })
        .map((input) => (input as HTMLInputElement).value);
    expect(screen.getAllByRole("button", { name: "Move group up" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move group down" })[1]).toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: "Move group up" })[1]);
    expect(groupNames()).toEqual(["saves", "defense"]);
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
    const keyed: AdminSystemDetail = {
      ...keyable,
      definition: { groups: [{ ...keyable.definition.groups[0], keyedBy: "ar" }] },
    };
    renderWithProviders(<SystemStatBlockEditor system={keyed} />);

    await user.click(screen.getAllByRole("button", { name: "Remove stat" })[0]);
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    expect(await screen.findByText("There is no stat ar in this group.")).toBeInTheDocument();
    expect(sa_setSystemStatBlockDefinition.mock.calls.length).toBe(0);
  });

  it("says in the browser where a formula points at nothing, and does not save", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    await user.click(screen.getByRole("button", { name: "Add stat" }));
    const row = screen.getAllByRole("textbox", { name: "Name" })[2];
    await user.type(row, "current_ar");
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Type" })[2], "Computed");
    await user.type(await screen.findByRole("textbox", { name: "Formula" }), "defense.armour - 2");
    await user.click(screen.getByRole("button", { name: "Save stat block" }));

    expect(await screen.findByText("There is no stat defense.armour.")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Add stat" }));
    await user.type(screen.getAllByRole("textbox", { name: "Name" })[2], "die");
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Type" })[2], "Rack");
    await user.type(await screen.findByRole("textbox", { name: "Rack entries" }), "d4, d6, 8");
    await user.click(screen.getByRole("button", { name: "Save stat block" }));

    await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.callCount()).toBe(1));
    const [idSystem, definition] = sa_setSystemStatBlockDefinition.mock.calls[0].arguments;
    expect(idSystem).toBe(-90);
    expect(definition.groups[0].stats[2]).toEqual({
      name: "die",
      label: "",
      type: "rack",
      rack: ["d4", "d6", 8],
      connectedTo: "",
      computedAs: "",
    });
    expect(await screen.findByText("Stat block saved.")).toBeInTheDocument();
  });

  it("puts the action's field error on its field, and a root error above the form", async () => {
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
    expect(screen.getByRole("alert")).toHaveTextContent("That system is no longer there.");
  });

  it("shows the definition as JSON on its tab, following the form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatBlockEditor system={system} />);

    await user.type(screen.getAllByRole("textbox", { name: "Label (optional)" })[0], "!");
    await user.click(screen.getByRole("tab", { name: "JSON" }));
    const panel = await screen.findByRole("tabpanel");
    expect(within(panel).getByText(/"label": "AR!"/)).toBeInTheDocument();
    expect(within(panel).getByText(/"rack": \[\]/)).toBeInTheDocument();
  });
});
