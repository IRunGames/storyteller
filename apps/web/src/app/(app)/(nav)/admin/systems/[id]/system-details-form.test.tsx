import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { AdminSystemDetail, UpdateSystemResult } from "../actions";

const system: AdminSystemDetail = {
  idSystem: -90,
  label: "Palladium Fantasy Role-Playing Game (2e)",
  systemName: "Palladium Fantasy Role-Playing Game",
  systemVersion: "2e",
  variant: null,
  definition: { groups: [] },
};

const sa_updateSystem = mock.fn<(idSystem: number, input: unknown) => Promise<UpdateSystemResult>>(
  async () => ({ ok: true, label: "Palladium Fantasy Role-Playing Game (3e)" }),
);
const refresh = mock.fn();

let SystemDetailsForm: typeof import("./system-details-form").SystemDetailsForm;

describe("SystemDetailsForm", () => {
  before(async () => {
    mock.module("../actions", { namedExports: { sa_updateSystem } });
    mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh }) } });
    ({ SystemDetailsForm } = await import("./system-details-form"));
  });

  beforeEach(() => {
    sa_updateSystem.mock.resetCalls();
    refresh.mock.resetCalls();
  });
  afterEach(() => toaster.remove());

  it("starts from the system's fields, saves them, and has the page redrawn", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <SystemDetailsForm system={system} />
        <Toaster />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Palladium Fantasy Role-Playing Game",
    );
    expect(screen.getByRole("textbox", { name: "Version (optional)" })).toHaveValue("2e");
    expect(screen.getByRole("textbox", { name: "Variant (optional)" })).toHaveValue("");

    await user.clear(screen.getByRole("textbox", { name: "Version (optional)" }));
    await user.type(screen.getByRole("textbox", { name: "Version (optional)" }), "3e");
    await user.click(screen.getByRole("button", { name: "Save details" }));

    await waitFor(() => expect(sa_updateSystem.mock.callCount()).toBe(1));
    expect(sa_updateSystem.mock.calls[0].arguments).toEqual([
      -90,
      { systemName: "Palladium Fantasy Role-Playing Game", systemVersion: "3e", variant: null },
    ]);
    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(refresh.mock.callCount()).toBe(1);
  });

  it("puts a refusal on its field, and a root error above the form", async () => {
    const user = userEvent.setup();
    sa_updateSystem.mock.mockImplementationOnce(async () => ({
      ok: false,
      errors: { systemName: "There is already a GURPS.", root: "That system is no longer there." },
    }));
    renderWithProviders(<SystemDetailsForm system={system} />);

    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("There is already a GURPS.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("That system is no longer there.");
    expect(refresh.mock.callCount()).toBe(0);
  });

  it("asks for a name before posting", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemDetailsForm system={system} />);
    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Please enter a name.")).toBeInTheDocument();
    expect(sa_updateSystem.mock.callCount()).toBe(0);
  });
});
