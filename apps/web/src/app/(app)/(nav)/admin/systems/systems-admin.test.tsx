import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { toaster } from "@/components/ui/toaster";
import type { AdminSystem, CreateSystemResult, DeleteSystemResult } from "./actions";

// Sorted by label, as the action lists them.
const systems: AdminSystem[] = [
  { idSystem: -91, label: "Cypher System · Numenera (Revised)", groupCount: 0, statCount: 0 },
  {
    idSystem: -90,
    label: "Palladium Fantasy Role-Playing Game (2e)",
    groupCount: 4,
    statCount: 14,
  },
];

const sa_createSystem = mock.fn<(input: unknown) => Promise<CreateSystemResult>>(async () => ({
  ok: true,
  system: { idSystem: 7, label: "GURPS (4e)", groupCount: 0, statCount: 0 },
}));

const sa_deleteSystem = mock.fn<(idSystem: number) => Promise<DeleteSystemResult>>(async () => ({
  ok: true,
}));

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

let SystemsAdmin: typeof import("./systems-admin").SystemsAdmin;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

/** The page as the app mounts it, under the user's preferences. */
const renderPage = (preferences: Record<string, boolean> = {}, rows = systems) =>
  renderWithProviders(
    <UserPreferencesProvider preferences={preferences}>
      <SystemsAdmin systems={rows} />
    </UserPreferencesProvider>,
  );

// hidden, since the page behind an open dialog is aria-hidden.
const bodyLabels = () => {
  const table = screen.getByRole("table", { name: "Systems", hidden: true });
  const [, body] = within(table).getAllByRole("rowgroup", { hidden: true });
  return within(body)
    .getAllByRole("row", { hidden: true })
    .map((row) => within(row).getAllByRole("cell", { hidden: true })[0].textContent);
};

describe("SystemsAdmin", () => {
  before(async () => {
    mock.module("./actions", {
      namedExports: { sa_createSystem, sa_deleteSystem },
    });
    mock.module("@/components/preferences/actions", { namedExports: { sa_setUserPreference } });
    ({ SystemsAdmin } = await import("./systems-admin"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    sa_createSystem.mock.resetCalls();
    sa_deleteSystem.mock.resetCalls();
    sa_setUserPreference.mock.resetCalls();
  });
  afterEach(() => toaster.remove());

  it("shows the counts of a definition, and nothing at all for a system without one", () => {
    renderPage();
    const rows = within(screen.getByRole("table", { name: "Systems" })).getAllByRole("row");
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
    expect(cells(rows[1]).slice(1, 3)).toEqual(["", ""]);
    expect(cells(rows[2]).slice(1, 3)).toEqual(["4", "14"]);
  });

  it("hides the systems with no stats from the switch at the end of the search line, and shows them again", async () => {
    const user = userEvent.setup();
    renderPage();

    const toggle = screen.getByRole("switch", { name: "Show systems with no stats" });
    // On to start with: every system, as before there was a switch.
    expect(toggle).toBeChecked();
    expect(bodyLabels()).toEqual([
      "Cypher System · Numenera (Revised)",
      "Palladium Fantasy Role-Playing Game (2e)",
    ]);

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(bodyLabels()).toEqual(["Palladium Fantasy Role-Playing Game (2e)"]);
    // Kept among the user's preferences, for the next visit.
    expect(sa_setUserPreference.mock.calls.map((call) => call.arguments[0])).toEqual([
      { key: "admin.systems.showEmpty", value: false },
    ]);
    // The search still narrows what is left.
    await user.type(screen.getByRole("searchbox", { name: "Search systems" }), "cypher");
    expect(screen.getByText("No systems with stats match.")).toBeInTheDocument();

    await user.click(toggle);
    expect(bodyLabels()).toEqual(["Cypher System · Numenera (Revised)"]);
    expect(sa_setUserPreference.mock.calls.at(-1)?.arguments[0]).toEqual({
      key: "admin.systems.showEmpty",
      value: true,
    });
  });

  it("comes back with the switch as the user left it", () => {
    renderPage({ "admin.systems.showEmpty": false });
    expect(screen.getByRole("switch", { name: "Show systems with no stats" })).not.toBeChecked();
    expect(bodyLabels()).toEqual(["Palladium Fantasy Role-Playing Game (2e)"]);
  });

  it("makes a system from the New system dialog, and puts it in the list in order", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "New system" }));
    const dialog = await screen.findByRole("dialog", { name: "New system" });
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "GURPS");
    await user.type(within(dialog).getByRole("textbox", { name: "Version (optional)" }), "4e");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sa_createSystem.mock.callCount()).toBe(1));
    expect(sa_createSystem.mock.calls[0].arguments[0]).toEqual({
      systemName: "GURPS",
      systemVersion: "4e",
      variant: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bodyLabels()).toEqual([
      "Cypher System · Numenera (Revised)",
      "GURPS (4e)",
      "Palladium Fantasy Role-Playing Game (2e)",
    ]);
  });

  it("puts the action's refusal on the name, and keeps the dialog open", async () => {
    const user = userEvent.setup();
    sa_createSystem.mock.mockImplementationOnce(async () => ({
      ok: false,
      errors: { systemName: "There is already a GURPS (4e)." },
    }));
    renderPage();

    await user.click(screen.getByRole("button", { name: "New system" }));
    const dialog = await screen.findByRole("dialog", { name: "New system" });
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "GURPS");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("There is already a GURPS (4e).")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(bodyLabels()).toHaveLength(2);
  });

  it("asks for a name before calling the action", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "New system" }));
    const dialog = await screen.findByRole("dialog", { name: "New system" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Please enter a name.")).toBeInTheDocument();
    expect(sa_createSystem.mock.callCount()).toBe(0);
  });

  it("deletes a system from its row's trashcan after asking, and drops the row", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Delete Cypher System · Numenera (Revised)" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete Cypher System · Numenera (Revised)?",
    });
    expect(within(dialog).getByText(/This cannot be undone/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(sa_deleteSystem.mock.callCount()).toBe(1));
    expect(sa_deleteSystem.mock.calls[0].arguments).toEqual([-91]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bodyLabels()).toEqual(["Palladium Fantasy Role-Playing Game (2e)"]);
  });

  it("keeps the row and shows the refusal when a story is run in the system", async () => {
    const user = userEvent.setup();
    sa_deleteSystem.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "1 story is run in it, so it stays.",
    }));
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Delete Palladium Fantasy Role-Playing Game (2e)" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "1 story is run in it, so it stays.",
    );
    expect(bodyLabels()).toHaveLength(2);
  });
});
