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
import type { UserListQuery } from "@/lib/user-list-schemas";

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

// The component imports its action itself, so the module is mocked before
// the dynamic import below loads it. Each call answers with the one row,
// so a test can tell a fresh page from the one it opened with.
const answer: UserListPage = { rows: [rows[1]], total: 1 };
const sa_listUsers = mock.fn(async (_query: unknown): Promise<UserListPage> => answer);

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
    mock.module("@/app/(app)/(nav)/admin/users/actions", { namedExports: { sa_listUsers } });
    ({ UsersAdmin } = await import("./users-admin"));
  });

  beforeEach(() => {
    sa_listUsers.mock.resetCalls();
    sa_listUsers.mock.mockImplementation(async () => answer);
  });

  afterEach(cleanup);

  it("shows the page it opened with and asks for nothing", () => {
    renderWithProviders(<UsersAdmin types={types} initial={{ rows, total: 3 }} />);

    expect(bodyEmails()).toEqual(["ada@example.test", "bram@example.test", "guest@example.test"]);
    expect(screen.getByText("1–3 of 3")).toBeInTheDocument();
    expect(sa_listUsers.mock.callCount()).toBe(0);
  });

  it("hides an unpressed status or type, from the first page", async () => {
    const u = userEvent.setup();
    renderWithProviders(<UsersAdmin types={types} initial={{ rows, total: 3 }} />);

    await u.click(
      within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: "Guest" }),
    );
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(1));
    expect(lastQuery()).toMatchObject({ statuses: ["active", "inactive"], page: 0 });
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
    renderWithProviders(<UsersAdmin types={types} initial={{ rows, total: 3 }} />);

    await u.type(screen.getByRole("searchbox", { name: "Search users" }), "bram");
    expect(sa_listUsers.mock.callCount()).toBe(0);

    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(1), { timeout: 1500 });
    expect(lastQuery()).toMatchObject({ search: "bram", page: 0 });
  });

  it("sorts on the server from a header", async () => {
    const u = userEvent.setup();
    renderWithProviders(<UsersAdmin types={types} initial={{ rows, total: 3 }} />);

    await u.click(screen.getByRole("button", { name: "Email" }));
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(1));
    expect(lastQuery()).toMatchObject({ sortBy: "email", sortDesc: false });

    await u.click(screen.getByRole("button", { name: "Email" }));
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(2));
    expect(lastQuery()).toMatchObject({ sortBy: "email", sortDesc: true });
  });

  it("pages, and goes back to the first page when the size changes", async () => {
    const u = userEvent.setup();
    renderWithProviders(<UsersAdmin types={types} initial={{ rows, total: 60 }} />);

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await u.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(1));
    expect(lastQuery()).toMatchObject({ page: 1, pageSize: 25 });

    await u.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "50");
    await waitFor(() => expect(sa_listUsers.mock.callCount()).toBe(2));
    expect(lastQuery()).toMatchObject({ page: 0, pageSize: 50 });
  });
});
