import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
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

const sa_deleteElement = mock.fn<
  (idElement: number) => Promise<{ ok: true; idStory: number } | { ok: false; error: string }>
>(async () => ({ ok: true, idStory: -15 }));
const push = mock.fn((_href: string) => {});

let ElementForm: typeof import("./element-form").ElementForm;

describe("ElementForm", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_createElement, sa_updateElement, sa_deleteElement },
    });
    // Delete goes back to the board once the element is gone.
    mock.module("next/navigation", {
      namedExports: { useRouter: () => ({ push, refresh: mock.fn() }) },
    });
    ({ ElementForm } = await import("./element-form"));
  });

  beforeEach(() => {
    sa_createElement.mock.resetCalls();
    sa_createElement.mock.mockImplementation(async () => ({ ok: true }));
    sa_updateElement.mock.resetCalls();
    sa_deleteElement.mock.resetCalls();
    push.mock.resetCalls();
  });

  const editing = {
    idElement: 7,
    values: {
      kind: "PERSON" as const,
      name: "Glenys",
      initialName: "",
      title: "",
      description: "",
      notes: "",
    },
  };

  it("deletes an element once asked, and goes back to the board", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ElementForm idStory={-15} element={editing} />
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Delete element" }));
    const ask = await screen.findByRole("alertdialog", { name: "Delete Glenys?" });
    expect(ask).toHaveTextContent("from every scene it is in");
    expect(ask).toHaveTextContent("cannot be undone");
    expect(sa_deleteElement.mock.callCount()).toBe(0);
    await user.click(within(ask).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(push.mock.calls[0]?.arguments).toEqual(["/libraries/-15"]));
    expect(sa_deleteElement.mock.calls[0].arguments).toEqual([7]);
    expect(await screen.findByText("Glenys has been deleted.")).toBeInTheDocument();
    toaster.remove();
  });

  it("keeps the element when the question is cancelled, and says a refusal in place", async () => {
    sa_deleteElement.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That element is not one of your story's.",
    }));
    const user = userEvent.setup();
    renderWithProviders(<ElementForm idStory={-15} element={editing} />);

    await user.click(screen.getByRole("button", { name: "Delete element" }));
    let ask = await screen.findByRole("alertdialog", { name: "Delete Glenys?" });
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(sa_deleteElement.mock.callCount()).toBe(0);

    await user.click(screen.getByRole("button", { name: "Delete element" }));
    ask = await screen.findByRole("alertdialog", { name: "Delete Glenys?" });
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    expect(await within(ask).findByRole("alert")).toHaveTextContent(
      "That element is not one of your story's.",
    );
    expect(push.mock.callCount()).toBe(0);
  });

  it("offers no Delete on a new element", () => {
    renderWithProviders(<ElementForm idStory={-15} kind="PLACE" />);
    expect(screen.queryByRole("button", { name: "Delete element" })).not.toBeInTheDocument();
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
