import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

const sa_getJoinLink = mock.fn(async (_idStory: number) => ({
  code: "AbCdEfGhIjKl",
  joined: 2,
  cap: 3,
}));

let JoinLinkButton: typeof import("./join-link-button").JoinLinkButton;

describe("JoinLinkButton", () => {
  before(async () => {
    mock.module("@/app/(app)/run/[id]/actions", { namedExports: { sa_getJoinLink } });
    ({ JoinLinkButton } = await import("./join-link-button"));
  });

  beforeEach(() => sa_getJoinLink.mock.resetCalls());

  it("fetches the link as it opens, ready to copy, with how many have joined by it", async () => {
    const u = userEvent.setup();
    renderWithProviders(<JoinLinkButton idStory={7} />);
    expect(sa_getJoinLink.mock.callCount()).toBe(0);

    await u.click(screen.getByRole("button", { name: "Join link" }));

    const field = await screen.findByRole("textbox", { name: "Join link" });
    expect(field).toHaveValue(`${window.location.origin}/join/AbCdEfGhIjKl`);
    expect(screen.getByText(/2 of 3 have joined this way/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy the link" })).toBeInTheDocument();
    expect(sa_getJoinLink.mock.calls[0].arguments).toEqual([7]);
  });

  it("says so when the link cannot be had", async () => {
    sa_getJoinLink.mock.mockImplementationOnce(async () => null as never);
    const u = userEvent.setup();
    renderWithProviders(<JoinLinkButton idStory={7} />);

    await u.click(screen.getByRole("button", { name: "Join link" }));

    expect(await screen.findByText("The link could not be made. Try again.")).toBeInTheDocument();
  });
});
