import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import { USER_TYPES } from "@/lib/user-types";
import { UserTypeVisibility } from "./user-type-visibility";

const as = (idUserType: number): CurrentUser => ({
  id: "u1",
  name: "Fixture",
  email: "fixture@example.test",
  image: null,
  nickName: null,
  idUserType,
  isAnonymous: false,
});

describe("UserTypeVisibility", () => {
  it("shows its children to a user type above the one it is given", () => {
    renderWithProviders(
      <UserProvider user={as(USER_TYPES.unpaidStoryteller)}>
        <UserTypeVisibility showAbove={USER_TYPES.unpaidPlayer}>
          <p>Storyteller tools</p>
        </UserTypeVisibility>
      </UserProvider>,
    );
    expect(screen.getByText("Storyteller tools")).toBeInTheDocument();
  });

  it("hides them from that type, showing the fallback when there is one", () => {
    renderWithProviders(
      <UserProvider user={as(USER_TYPES.unpaidPlayer)}>
        <UserTypeVisibility showAbove={USER_TYPES.unpaidPlayer}>
          <p>Storyteller tools</p>
        </UserTypeVisibility>
        <UserTypeVisibility showAbove={USER_TYPES.unpaidPlayer} fallback={<p>Upgrade</p>}>
          <p>Also storyteller tools</p>
        </UserTypeVisibility>
      </UserProvider>,
    );
    expect(screen.queryByText("Storyteller tools")).not.toBeInTheDocument();
    expect(screen.queryByText("Also storyteller tools")).not.toBeInTheDocument();
    expect(screen.getByText("Upgrade")).toBeInTheDocument();
  });

  it("shows below a type", () => {
    renderWithProviders(
      <UserProvider user={as(USER_TYPES.paidStoryteller)}>
        <UserTypeVisibility showBelow={USER_TYPES.administrator}>
          <p>Not for admins</p>
        </UserTypeVisibility>
        <UserTypeVisibility showBelow={USER_TYPES.paidStoryteller}>
          <p>Below paid</p>
        </UserTypeVisibility>
      </UserProvider>,
    );
    expect(screen.getByText("Not for admins")).toBeInTheDocument();
    expect(screen.queryByText("Below paid")).not.toBeInTheDocument();
  });

  it("will not type-check without a level", () => {
    // @ts-expect-error -- at least one of showBelow and showAbove is required.
    const element = <UserTypeVisibility>hidden</UserTypeVisibility>;
    expect(element).toBeTruthy();
  });
});
