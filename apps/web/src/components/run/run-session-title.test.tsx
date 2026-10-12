import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { SetSessionTitleResult } from "@/app/(app)/run/[id]/actions";

const sa_setSessionTitle = mock.fn(
  async (_story: number, _session: number, title: string): Promise<SetSessionTitleResult> => ({
    ok: true,
    title: title.trim() || null,
  }),
);

let RunSessionTitle: typeof import("./run-session-title").RunSessionTitle;

describe("RunSessionTitle", () => {
  before(async () => {
    mock.module("@/app/(app)/run/[id]/actions", { namedExports: { sa_setSessionTitle } });
    ({ RunSessionTitle } = await import("./run-session-title"));
  });

  beforeEach(() => {
    sa_setSessionTitle.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  const render = (title: string | null = "Kildealg") =>
    renderWithProviders(
      <>
        <RunSessionTitle idStory={-4} session={{ idStorySession: -30, number: 3, title }} />
        <Toaster />
      </>,
    );

  it("renames the session in place, editing the title without its number", async () => {
    const u = userEvent.setup();
    render();

    await u.click(screen.getByRole("button", { name: "3. Kildealg, rename the session" }));
    const input = screen.getByRole("textbox", { name: "Session title" });
    expect(input).toHaveValue("Kildealg");
    expect(input).toHaveFocus();

    await u.clear(input);
    await u.type(input, "The drowned bell{Enter}");

    expect(
      await screen.findByRole("button", { name: "3. The drowned bell, rename the session" }),
    ).toBeInTheDocument();
    // Saved once, though the input blurs as it goes.
    expect(sa_setSessionTitle.mock.callCount()).toBe(1);
    expect(sa_setSessionTitle.mock.calls[0].arguments).toEqual([-4, -30, "The drowned bell"]);
  });

  it("saves when the field is left", async () => {
    const u = userEvent.setup();
    render();

    await u.click(screen.getByRole("button", { name: "3. Kildealg, rename the session" }));
    await u.type(screen.getByRole("textbox", { name: "Session title" }), " again");
    await u.tab();

    expect(
      await screen.findByRole("button", { name: "3. Kildealg again, rename the session" }),
    ).toBeInTheDocument();
    expect(sa_setSessionTitle.mock.calls[0].arguments).toEqual([-4, -30, "Kildealg again"]);
  });

  it("puts it back with Escape, saving nothing", async () => {
    const u = userEvent.setup();
    render();

    await u.click(screen.getByRole("button", { name: "3. Kildealg, rename the session" }));
    await u.type(screen.getByRole("textbox", { name: "Session title" }), "xyz{Escape}");

    expect(
      screen.getByRole("button", { name: "3. Kildealg, rename the session" }),
    ).toBeInTheDocument();
    expect(sa_setSessionTitle.mock.callCount()).toBe(0);
  });

  it("goes back to Session 3 when the title is cleared", async () => {
    const u = userEvent.setup();
    render();

    await u.click(screen.getByRole("button", { name: "3. Kildealg, rename the session" }));
    await u.clear(screen.getByRole("textbox", { name: "Session title" }));
    await u.keyboard("{Enter}");

    expect(
      await screen.findByRole("button", { name: "Session 3, rename the session" }),
    ).toBeInTheDocument();
    expect(sa_setSessionTitle.mock.calls[0].arguments).toEqual([-4, -30, ""]);
  });

  it("puts the old title back, with a toast, when the action refuses", async () => {
    sa_setSessionTitle.mock.mockImplementationOnce(async () => ({
      ok: false,
      error: "That session is not part of this story.",
    }));
    const u = userEvent.setup();
    render();

    await u.click(screen.getByRole("button", { name: "3. Kildealg, rename the session" }));
    await u.type(screen.getByRole("textbox", { name: "Session title" }), "!{Enter}");

    expect(await screen.findByText("That session is not part of this story.")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "3. Kildealg, rename the session" }),
      ).toBeInTheDocument(),
    );
  });
});
