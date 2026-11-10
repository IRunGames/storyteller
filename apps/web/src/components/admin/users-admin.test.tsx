import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type {
  AdminUser,
  UserListPage,
  UserTypeOption,
} from "@/app/(app)/(nav)/admin/users/actions";
import type { StatusOption } from "@/lib/status";
import type { UserListQuery } from "@/lib/user-list-schemas";
import type { UserStatus } from "@/lib/user-types";

const types: UserTypeOption[] = [
  { idUserType: -10, label: "Unpaid Player" },
  { idUserType: -25, label: "Paid Storyteller" },
  { idUserType: -100, label: "Administrator" },
];

const row = (over: Partial<AdminUser>): AdminUser => ({
  id: "01a0b60c-0000-7000-8000-000000000001",
  name: "Ada Fixture",
  nickName: null,
  email: "ada@example.test",
  idUserType: -10,
  userTypeName: "Unpaid Player",
  status: "active",
  createdAt: new Date("2026-10-01T12:00:00Z"),
  lastLogin: new Date("2026-10-20T12:00:00Z"),
  hoursPlayed: 2.5,
  ...over,
});

const rows = [
  row({}),
  row({
    id: "01a0b60c-0000-7000-8000-000000000002",
    name: "Bram Fixture",
    nickName: "bram",
    email: "bram@example.test",
    idUserType: -25,
    userTypeName: "Paid Storyteller",
  }),
  row({
    id: "01a0b60c-0000-7000-8000-000000000003",
    name: "Guest Fixture",
    email: "guest@example.test",
    status: "guest",
  }),
];

// The Users Status Workflow as the chip needs it: only its keys and labels
// matter here, and which moves lead out of active.
const statusOptions: StatusOption[] = [
  { key: "ACTIVE", label: "Active", description: null, from: ["INACTIVE", "SUSPENDED", "LOCKED"] },
  { key: "INACTIVE", label: "Inactive", description: null, from: ["ACTIVE"] },
  {
    key: "SUSPENDED",
    label: "Suspended",
    description: null,
    from: ["ACTIVE", "INACTIVE", "LOCKED"],
  },
  { key: "LOCKED", label: "Locked", description: null, from: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
];
// The administrator looking at the page is the first fixture, Ada.
const VIEWER = rows[0].id;

// The component and the chip import their actions themselves, so the module
// is mocked before the dynamic import below loads it. Each list call answers
// with the one row, so a test can tell a fresh page from the one it opened
// with.
const answer: UserListPage = { rows: [rows[1]], total: 1 };
const sa_listUsers = mock.fn(async (_query: unknown): Promise<UserListPage> => answer);
const sa_setUserStatus = mock.fn(async (_idUser: string, status: string) => ({
  ok: true as const,
  status: status.toLowerCase() as UserStatus,
}));
const sa_setUserType = mock.fn(async (_idUser: string, idUserType: number) => ({
  ok: true as const,
  idUserType,
  userTypeName: types.find((type) => type.idUserType === idUserType)?.label ?? "?",
}));

let UsersAdmin: typeof import("./users-admin").UsersAdmin;

const lastQuery = () => sa_listUsers.mock.calls.at(-1)?.arguments[0] as UserListQuery;

function bodyEmails() {
  const table = screen.getByRole("table", { name: "Users" });
  const [, body] = within(table).getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((tr) => within(tr).getAllByRole("cell")[1].textContent);
}

describe("UsersAdmin", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/admin/users/actions", {
      namedExports: { sa_listUsers, sa_setUserStatus, sa_setUserType },
    });
    ({ UsersAdmin } = await import("./users-admin"));
  });

  beforeEach(() => {
    sa_listUsers.mock.resetCalls();
    sa_listUsers.mock.mockImplementation(async () => answer);
  });

  afterEach(cleanup);

  it("shows the page it opened with and asks for nothing", () => {
    renderWithProviders(
      <UsersAdmin
        types={types}
        statusOptions={statusOptions}
        viewerId={VIEWER}
        initial={{ rows, total: 3 }}
      />,
    );

    expect(bodyEmails()).toEqual(["ada@example.test", "bram@example.test", "guest@example.test"]);
    expect(screen.getByText("1–3 of 3")).toBeInTheDocument();
    expect(sa_listUsers.mock.callCount()).toBe(0);
  });

  it("hides an unpressed status or type, from the first page", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <UsersAdmin
        types={types}
        statusOptions={statusOptions}
        viewerId={VIEWER}
        initial={{ rows, total: 3 }}
      />,
    );

    await u.click(
      within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: "Guest" }),
    );
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(1));
    expect(lastQuery()).toMatchObject({
      statuses: ["active", "inactive", "suspended", "locked"],
      page: 0,
    });
    await waitFor(() => expect(bodyEmails()).toEqual(["bram@example.test"]));

    await u.click(
      within(screen.getByRole("group", { name: "Type" })).getByRole("button", {
        name: "Administrator",
      }),
    );
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(2));
    expect(lastQuery()).toMatchObject({ idUserTypes: [-10, -25] });
  });

  it("searches half a second after the typing stops", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <UsersAdmin
        types={types}
        statusOptions={statusOptions}
        viewerId={VIEWER}
        initial={{ rows, total: 3 }}
      />,
    );

    await u.type(screen.getByRole("searchbox", { name: "Search users" }), "bram");
    expect(sa_listUsers.mock.callCount()).toBe(0);

    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(1), { timeout: 1500 });
    expect(lastQuery()).toMatchObject({ search: "bram", page: 0 });
  });

  it("sorts on the server from a header", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <UsersAdmin
        types={types}
        statusOptions={statusOptions}
        viewerId={VIEWER}
        initial={{ rows, total: 3 }}
      />,
    );

    await u.click(screen.getByRole("button", { name: "Email" }));
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(1));
    expect(lastQuery()).toMatchObject({ sortBy: "email", sortDesc: false });

    await u.click(screen.getByRole("button", { name: "Email" }));
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(2));
    expect(lastQuery()).toMatchObject({ sortBy: "email", sortDesc: true });
  });

  it("pages, and goes back to the first page when the size changes", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <UsersAdmin
        types={types}
        statusOptions={statusOptions}
        viewerId={VIEWER}
        initial={{ rows, total: 60 }}
      />,
    );

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await u.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(1));
    expect(lastQuery()).toMatchObject({ page: 1, pageSize: 25 });

    await u.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "50");
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(2));
    expect(lastQuery()).toMatchObject({ page: 0, pageSize: 50 });
  });

  it("shows each status as a chip that opens, except on the viewer's own row and a guest's", () => {
    renderWithProviders(
      <UsersAdmin
        types={types}
        statusOptions={statusOptions}
        viewerId={VIEWER}
        initial={{ rows, total: 3 }}
      />,
    );

    const table = screen.getByRole("table", { name: "Users" });
    const [, body] = within(table).getAllByRole("rowgroup");
    const [ada, bram, guest] = within(body).getAllByRole("row");
    // Ada is the viewer: her own status is shown but not a button.
    expect(within(ada).getByText("Active")).toBeInTheDocument();
    expect(within(ada).queryByRole("button", { name: "Active" })).not.toBeInTheDocument();
    expect(within(bram).getByRole("button", { name: "Active" })).toBeInTheDocument();
    expect(within(guest).getByText("Guest")).toBeInTheDocument();
    expect(within(guest).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps a changed status in the row without asking the server again", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <UsersAdmin
        types={types}
        statusOptions={statusOptions}
        viewerId={VIEWER}
        initial={{ rows, total: 3 }}
      />,
    );

    // Within the table: the Status filters have a pressed "Active" too.
    const table = screen.getByRole("table", { name: "Users" });
    await u.click(within(table).getByRole("button", { name: "Active" }));
    const items = await screen.findAllByRole("menuitem");
    // Zag only selects the highlighted item, which a single synthetic hover
    // does not make it (user-status-chip.test.tsx says why).
    let step = 0;
    await waitFor(async () => {
      step += 1;
      await u.pointer({ target: items[1], coords: { clientX: step, clientY: step } });
      expect(items[1]).toHaveAttribute("data-highlighted");
    });
    await u.click(items[1]);
    await screen.findByRole("dialog", { name: "Suspend this account?" });
    await u.click(screen.getByRole("button", { name: "Suspend" }));

    await waitFor(() => {
      expect(within(table).getByRole("button", { name: "Suspended" })).toBeInTheDocument();
    });
    expect(sa_setUserStatus.mock.calls[0].arguments).toEqual([rows[1].id, "SUSPENDED"]);
    expect(sa_listUsers.mock.callCount()).toBe(0);
  });
  it("shows each type as a pill that opens, except on the viewer's own row and a guest's, and keeps a change in the row", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <UsersAdmin
        types={types}
        statusOptions={statusOptions}
        viewerId={VIEWER}
        initial={{ rows, total: 3 }}
      />,
    );

    const table = screen.getByRole("table", { name: "Users" });
    const [, body] = within(table).getAllByRole("rowgroup");
    const [ada, bram, guest] = within(body).getAllByRole("row");
    expect(within(ada).getByText("Unpaid Player")).toBeInTheDocument();
    expect(within(ada).queryByRole("button", { name: "Unpaid Player" })).not.toBeInTheDocument();
    expect(within(guest).getByText("Unpaid Player")).toBeInTheDocument();
    expect(within(guest).queryByRole("button")).not.toBeInTheDocument();

    await u.click(within(bram).getByRole("button", { name: "Paid Storyteller" }));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Unpaid Player",
      "Paid Storyteller",
      "Administrator",
    ]);
    let step = 0;
    await waitFor(async () => {
      step += 1;
      await u.pointer({ target: items[2], coords: { clientX: step, clientY: step } });
      expect(items[2]).toHaveAttribute("data-highlighted");
    });
    await u.click(items[2]);

    await waitFor(() => {
      expect(within(bram).getByRole("button", { name: "Administrator" })).toBeInTheDocument();
    });
    expect(sa_setUserType.mock.calls[0].arguments).toEqual([rows[1].id, -100]);
    expect(sa_listUsers.mock.callCount()).toBe(0);
  });
});
