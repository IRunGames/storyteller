import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { UserProvider, useUser } from "./user-provider";

const user = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: "Gandalf",
};

function WhoAmI() {
  const me = useUser();
  return <p>{`${me.name} <${me.email}> aka ${me.nickName}`}</p>;
}

describe("UserProvider", () => {
  it("hands the signed-in user to any client component below it", () => {
    renderWithProviders(
      <UserProvider user={user}>
        <WhoAmI />
      </UserProvider>,
    );

    expect(
      screen.getByText("Paul Stafford <storyteller@irun.games> aka Gandalf"),
    ).toBeInTheDocument();
  });

  it("refuses to be read outside a logged-in page", () => {
    // React logs the thrown error as well as rethrowing it; silence the log
    // for this one render so the test output stays clean.
    const consoleError = console.error;
    console.error = () => {};
    try {
      expect(() => renderWithProviders(<WhoAmI />)).toThrow(
        "useUser() can only be called inside a logged-in page",
      );
    } finally {
      console.error = consoleError;
    }
  });
});
