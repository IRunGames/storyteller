import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { JoinByLinkResult } from "./actions";

const push = mock.fn((_href: string) => {});
const anonymous = mock.fn(async () => ({ data: {}, error: null as { message?: string } | null }));
const sa_joinByLink = mock.fn(
  async (_code: string, _nickname: string): Promise<JoinByLinkResult> => ({ ok: true, idStory: 7 }),
);

let JoinForm: typeof import("./join-form").JoinForm;

const base = {
  code: "AbCdEfGhIjKl",
  title: "Psychoneira",
  isFull: false,
  hasSession: false,
  member: null,
  suggested: "Ferocious Hamster",
};

describe("JoinForm", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { useRouter: () => ({ push, refresh: mock.fn() }) },
    });
    mock.module("@/lib/auth-client", { namedExports: { signIn: { anonymous } } });
    mock.module("./actions", { namedExports: { sa_joinByLink } });
    ({ JoinForm } = await import("./join-form"));
  });

  beforeEach(() => {
    push.mock.resetCalls();
    anonymous.mock.resetCalls();
    sa_joinByLink.mock.resetCalls();
  });

  it("signs a visitor in as a guest under the name they keep, and takes them to the table", async () => {
    const u = userEvent.setup();
    renderWithProviders(<JoinForm {...base} />);

    const name = screen.getByRole("textbox", { name: /What should the table call you/ });
    expect(name).toHaveValue("Ferocious Hamster");
    await u.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => expect(push.mock.calls[0]?.arguments).toEqual(["/table/7"]));
    expect(anonymous.mock.callCount()).toBe(1);
    expect(sa_joinByLink.mock.calls[0].arguments).toEqual(["AbCdEfGhIjKl", "Ferocious Hamster"]);
  });

  it("rolls another name", async () => {
    const u = userEvent.setup();
    renderWithProviders(<JoinForm {...base} suggested="" />);

    await u.click(screen.getByRole("button", { name: "Another name" }));

    const name = screen.getByRole<HTMLInputElement>("textbox", {
      name: /What should the table call you/,
    });
    expect(name.value).toMatch(/^\w+ \w+$/);
  });

  it("joins someone with an account as themselves, with no guest sign-in", async () => {
    const u = userEvent.setup();
    renderWithProviders(<JoinForm {...base} hasSession member="Harry" />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Harry")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => expect(push.mock.callCount()).toBe(1));
    expect(anonymous.mock.callCount()).toBe(0);
  });

  it("says when the table is full, and stays", async () => {
    sa_joinByLink.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "This table is full.",
    }));
    const u = userEvent.setup();
    renderWithProviders(<JoinForm {...base} />);

    await u.click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByText("This table is full.")).toBeInTheDocument();
    expect(push.mock.callCount()).toBe(0);
  });

  it("offers no form when every seat is taken", () => {
    renderWithProviders(<JoinForm {...base} isFull />);

    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
    expect(screen.getByText(/This table is full/)).toBeInTheDocument();
  });
});
