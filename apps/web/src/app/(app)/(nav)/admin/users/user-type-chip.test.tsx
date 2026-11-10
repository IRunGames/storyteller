import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { SetUserTypeResult, UserTypeOption } from "./actions";

const types: UserTypeOption[] = [
  { idUserType: -10, label: "Unpaid Player" },
  { idUserType: -20, label: "Unpaid Storyteller" },
  { idUserType: -100, label: "Administrator" },
];

const ID = "01a0b60c-0000-7000-8000-000000000001";

const sa_setUserType = mock.fn<(idUser: string, idUserType: number) => Promise<SetUserTypeResult>>(
  async (_id, idUserType) => ({
    ok: true,
    idUserType,
    userTypeName: types.find((type) => type.idUserType === idUserType)?.label ?? "?",
  }),
);

// Zag only selects the highlighted item, and on open it sets its input
// modality to "virtual", which makes items ignore a single synthetic hover.
// The same nudge loop user-status-chip.test.tsx uses.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

let UserTypeChip: typeof import("./user-type-chip").UserTypeChip;

describe("UserTypeChip", () => {
  before(async () => {
    mock.module("./actions", { namedExports: { sa_setUserType } });
    ({ UserTypeChip } = await import("./user-type-chip"));
  });

  beforeEach(() => {
    sa_setUserType.mock.resetCalls();
    sa_setUserType.mock.mockImplementation(async (_id, idUserType) => ({
      ok: true,
      idUserType,
      userTypeName: types.find((type) => type.idUserType === idUserType)?.label ?? "?",
    }));
    toaster.remove();
  });

  afterEach(cleanup);

  const chip = (
    idUserType: number,
    readOnly = false,
    onChanged?: (type: { idUserType: number; userTypeName: string }) => void,
  ) =>
    renderWithProviders(
      <>
        <UserTypeChip
          idUser={ID}
          idUserType={idUserType}
          types={types}
          readOnly={readOnly}
          onChanged={onChanged}
        />
        <Toaster />
      </>,
    );

  it("only shows the type on a row that is read-only", () => {
    chip(-100, true);

    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a menu of every type with the account's own one checked", async () => {
    const user = userEvent.setup();
    chip(-20);

    await user.click(screen.getByRole("button", { name: "Unpaid Storyteller" }));

    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Unpaid Player",
      "Unpaid Storyteller",
      "Administrator",
    ]);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("saves the chosen type, showing it at once and reporting it", async () => {
    const user = userEvent.setup();
    const changed: { idUserType: number; userTypeName: string }[] = [];
    chip(-10, false, (type) => changed.push(type));

    await user.click(screen.getByRole("button", { name: "Unpaid Player" }));
    const items = await screen.findAllByRole("menuitemradio");
    await choose(user, items[1]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unpaid Storyteller" })).toBeInTheDocument();
    });
    expect(sa_setUserType.mock.calls[0].arguments).toEqual([ID, -20]);
    expect(changed).toEqual([{ idUserType: -20, userTypeName: "Unpaid Storyteller" }]);
  });

  it("does not ask the server for the type the account already has", async () => {
    const user = userEvent.setup();
    chip(-10);

    await user.click(screen.getByRole("button", { name: "Unpaid Player" }));
    const items = await screen.findAllByRole("menuitemradio");
    await choose(user, items[0]);

    expect(screen.getByRole("button", { name: "Unpaid Player" })).toBeInTheDocument();
    expect(sa_setUserType.mock.callCount()).toBe(0);
  });

  it("puts the old type back when the action refuses, and says why", async () => {
    sa_setUserType.mock.mockImplementation(async () => ({
      ok: false,
      error: "That account's type cannot be changed.",
    }));
    const user = userEvent.setup();
    chip(-10);

    await user.click(screen.getByRole("button", { name: "Unpaid Player" }));
    const items = await screen.findAllByRole("menuitemradio");
    await choose(user, items[2]);

    await waitFor(() => {
      expect(screen.getByText("That account's type cannot be changed.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Unpaid Player" })).toBeInTheDocument();
  });

  it("puts the old type back when the action throws", async () => {
    sa_setUserType.mock.mockImplementation(async () => {
      throw new Error("network");
    });
    const user = userEvent.setup();
    chip(-10);

    await user.click(screen.getByRole("button", { name: "Unpaid Player" }));
    const items = await screen.findAllByRole("menuitemradio");
    await choose(user, items[2]);

    await waitFor(() => {
      expect(screen.getByText("That type could not be changed.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Unpaid Player" })).toBeInTheDocument();
  });
});
