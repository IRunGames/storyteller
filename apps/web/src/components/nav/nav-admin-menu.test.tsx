import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import { USER_TYPES } from "@/lib/user-types";
import { NavAdminMenu } from "./nav-admin-menu";

const as = (idUserType: number): CurrentUser => ({
  id: "u1",
  name: "Fixture",
  email: "fixture@example.test",
  image: null,
  nickName: null,
  idUserType,
  isAnonymous: false,
});

describe("NavAdminMenu", () => {
  it("gives an administrator the wrench, with Invitations in its menu", async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <UserProvider user={as(USER_TYPES.administrator)}>
        <NavAdminMenu />
      </UserProvider>,
    );

    await u.click(screen.getByRole("button", { name: "Admin tools" }));
    const item = await screen.findByRole("menuitem", { name: "Invitations" });
    expect(item).toHaveAttribute("href", "/admin/invitations");
  });

  it("is not drawn for a paid storyteller", () => {
    renderWithProviders(
      <UserProvider user={as(USER_TYPES.paidStoryteller)}>
        <NavAdminMenu />
      </UserProvider>,
    );
    expect(screen.queryByRole("button", { name: "Admin tools" })).not.toBeInTheDocument();
  });
});
