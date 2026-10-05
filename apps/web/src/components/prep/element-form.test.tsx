import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { ElementValues } from "@/lib/element-schemas";

type Result = { ok: true } | { ok: false; errors: Record<string, string> };

// The form imports both actions itself; mocked so it renders without a
// database, and so each test can see which one it called and with what.
const sa_createElement = mock.fn<(idStory: number, values: ElementValues) => Promise<Result>>(
  async () => ({ ok: true }),
);
const sa_updateElement = mock.fn<(idElement: number, values: ElementValues) => Promise<Result>>(
  async () => ({ ok: false, errors: {} }),
);

let ElementForm: typeof import("./element-form").ElementForm;

describe("ElementForm", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_createElement, sa_updateElement },
    });
    ({ ElementForm } = await import("./element-form"));
  });

  beforeEach(() => {
    sa_createElement.mock.resetCalls();
    sa_createElement.mock.mockImplementation(async () => ({ ok: true }));
    sa_updateElement.mock.resetCalls();
  });

  it("starts a new element as the kind of the column it was opened from", () => {
    renderWithProviders(<ElementForm idStory={-15} kind="PLACE" />);
    expect(screen.getByRole("combobox", { name: /Kind/ })).toHaveValue("PLACE");
  });

  it("offers every kind, in the board's order", () => {
    renderWithProviders(<ElementForm idStory={-15} kind="PLACE" />);
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Person", "Place", "Thing", "Other", "Ephemera"]);
  });

  it("refuses to submit without a name and does not call the action", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" />);

    await user.click(screen.getByRole("button", { name: "Create element" }));
    expect(await screen.findByText("Please give the element a name.")).toBeInTheDocument();
    expect(sa_createElement.mock.callCount()).toBe(0);
  });

  it("creates the element as whatever kind the dropdown ends on, and says which", async () => {
    const user = userEvent.setup();
    const created: string[] = [];
    renderWithProviders(
      <ElementForm idStory={-15} kind="PERSON" onCreated={(kind) => created.push(kind)} />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /Kind/ }), "Thing");
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "The silver blade");
    await user.type(screen.getByRole("textbox", { name: /Notes/ }), "Glenys carries it.");
    await user.click(screen.getByRole("button", { name: "Create element" }));

    await waitFor(() => expect(sa_createElement.mock.callCount()).toBe(1));
    expect(sa_createElement.mock.calls[0].arguments).toEqual([
      -15,
      {
        kind: "THING",
        name: "The silver blade",
        initialName: "",
        title: "",
        description: "",
        notes: "Glenys carries it.",
      },
    ]);
    expect(created).toEqual(["THING"]);
  });

  it("starts from the element's values when editing, and saves through the update action", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ElementForm
        idStory={-15}
        element={{
          idElement: 9,
          values: {
            kind: "PERSON",
            name: "Aldric",
            initialName: "The stranger",
            title: "Magistrate",
            description: "",
            notes: "",
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Edit element" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Initial name/ })).toHaveValue("The stranger");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/libraries/-15");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(sa_updateElement.mock.callCount()).toBe(1));
    expect(sa_updateElement.mock.calls[0].arguments[0]).toBe(9);
  });

  it("puts a server's field error on its field", async () => {
    const user = userEvent.setup();
    sa_createElement.mock.mockImplementation(async () => ({
      ok: false,
      errors: { name: "That name is taken." },
    }));
    renderWithProviders(<ElementForm idStory={-15} kind="PERSON" />);

    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Aldric");
    await user.click(screen.getByRole("button", { name: "Create element" }));
    expect(await screen.findByText("That name is taken.")).toBeInTheDocument();
  });
});
