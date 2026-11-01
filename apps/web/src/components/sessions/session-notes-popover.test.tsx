import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster } from "@/components/ui/toaster";
import type { SessionNotes, SetSessionNotesResult } from "./actions";

const sa_getSessionNotes = mock.fn<(id: number) => Promise<SessionNotes | null>>(async () => ({
  notes: "Kept so far.",
  lingeringQuestions: null,
}));
const sa_setSessionNotes = mock.fn<(id: number, input: unknown) => Promise<SetSessionNotesResult>>(
  async (_id, input) => {
    const values = input as { notes: string; lingeringQuestions: string };
    return {
      ok: true,
      notes: {
        notes: values.notes || null,
        lingeringQuestions: values.lingeringQuestions || null,
      },
    };
  },
);

let SessionNotesPopover: typeof import("./session-notes-popover").SessionNotesPopover;

function renderPopover() {
  return renderWithProviders(
    <>
      <SessionNotesPopover idStorySession={-30} heading="3. Kildealg" />
      <Toaster />
    </>,
  );
}

describe("SessionNotesPopover", () => {
  before(async () => {
    mock.module("./actions", { namedExports: { sa_getSessionNotes, sa_setSessionNotes } });
    ({ SessionNotesPopover } = await import("./session-notes-popover"));
  });

  beforeEach(() => {
    sa_getSessionNotes.mock.resetCalls();
    sa_setSessionNotes.mock.resetCalls();
  });

  afterEach(cleanup);

  it("opens on the session's notes as stored, and saves both fields", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Session notes" }));
    expect(await screen.findByRole("dialog", { name: "3. Kildealg" })).toBeInTheDocument();
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    expect(notes).toHaveValue("Kept so far.");
    expect(screen.getByRole("textbox", { name: "Lingering questions" })).toHaveValue("");
    expect(sa_getSessionNotes.mock.calls[0].arguments).toEqual([-30]);

    await user.type(notes, " And more.");
    await user.type(screen.getByRole("textbox", { name: "Lingering questions" }), "Who?");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(sa_setSessionNotes.mock.calls[0]?.arguments).toEqual([
        -30,
        { notes: "Kept so far. And more.", lingeringQuestions: "Who?" },
      ]),
    );
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument(),
    );
  });

  it("shows what the action refused, and keeps the panel open", async () => {
    sa_setSessionNotes.mock.mockImplementationOnce(async () => ({
      ok: false,
      errors: { root: "This session is not at a table of yours." },
    }));
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Session notes" }));
    await screen.findByRole("textbox", { name: "Notes" });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This session is not at a table of yours.",
    );
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("says so in place of the fields when the session is not the caller's to write", async () => {
    sa_getSessionNotes.mock.mockImplementationOnce(async () => null);
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Session notes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This session is not at a table of yours.",
    );
    expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument();
  });

  it("closes without saving on Cancel", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Session notes" }));
    await screen.findByRole("textbox", { name: "Notes" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument(),
    );
    expect(sa_setSessionNotes.mock.callCount()).toBe(0);
  });
});
