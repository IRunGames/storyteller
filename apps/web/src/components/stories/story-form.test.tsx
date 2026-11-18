import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StoryValues } from "@/lib/story-schemas";

const systems = [
  { idSystem: -6, label: "Daggerheart (1e)" },
  { idSystem: -26, label: "Cypher System · Numenera (Revised)" },
];

type Result = { ok: false; errors: Record<string, string> };
const noErrors = async (): Promise<Result> => ({ ok: false, errors: {} });

// The form imports both actions itself; mocked so it can be rendered without
// a database, and so each test can see which one it called and with what.
const sa_createStory =
  mock.fn<(values: StoryValues, afterCreate?: string) => Promise<Result>>(noErrors);
const sa_updateStory =
  mock.fn<
    (idStory: number, values: StoryValues, options: { dropStatBlock: boolean }) => Promise<Result>
  >(noErrors);

let StoryForm: typeof import("./story-form").StoryForm;

const existing = {
  idStory: -15,
  values: {
    title: "Vampire",
    idSystem: -6,
    summary: "A city of the dead.",
    isLookingForPlayers: true,
    isActive: true,
    isArchived: false,
    isPublic: false,
  },
  hasOwnStatBlock: false,
};

describe("StoryForm", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_createStory, sa_updateStory },
    });
    ({ StoryForm } = await import("./story-form"));
  });

  beforeEach(() => {
    sa_createStory.mock.resetCalls();
    sa_createStory.mock.mockImplementation(noErrors);
    sa_updateStory.mock.resetCalls();
    sa_updateStory.mock.mockImplementation(noErrors);
  });

  it("refuses to submit without a title and does not call the action", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryForm systems={systems} />);
    await user.click(screen.getByRole("button", { name: "Create story" }));

    expect(await screen.findByText("Please give the story a title.")).toBeInTheDocument();
    expect(sa_createStory.mock.callCount()).toBe(0);
  });

  it("hands where to go afterwards on to the create action", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryForm systems={systems} afterCreate="/stories" />);
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.click(screen.getByRole("button", { name: "Create story" }));

    await waitFor(() => expect(sa_createStory.mock.callCount()).toBe(1));
    expect(sa_createStory.mock.calls[0].arguments[1]).toBe("/stories");
  });

  it("submits the typed values with the chosen system", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryForm systems={systems} />);
    expect(screen.getByRole("heading", { name: "New story" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.selectOptions(screen.getByLabelText(/System/), "-26");
    await user.type(screen.getByLabelText(/Summary/), "A gala in Satyrine.");
    await user.click(screen.getByLabelText(/Looking for players/));
    await user.click(screen.getByLabelText(/Public/));
    await user.click(screen.getByRole("button", { name: "Create story" }));

    await waitFor(() => expect(sa_createStory.mock.callCount()).toBe(1));
    expect(sa_createStory.mock.calls[0].arguments[0]).toEqual({
      title: "Embers Leap",
      idSystem: -26,
      summary: "A gala in Satyrine.",
      isLookingForPlayers: true,
      isActive: true,
      isArchived: false,
      isPublic: true,
    });
    expect(sa_updateStory.mock.callCount()).toBe(0);
  });

  it("starts a new story active, with nothing to archive yet", () => {
    renderWithProviders(<StoryForm systems={systems} />);

    expect(screen.getByLabelText(/Active/)).toBeChecked();
    expect(screen.queryByRole("button", { name: /Archive/ })).not.toBeInTheDocument();
    // Among the fields, after the title.
    expect(
      screen.getByLabelText(/Title/).compareDocumentPosition(screen.getByLabelText(/Active/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows server-side field errors", async () => {
    const user = userEvent.setup();
    sa_createStory.mock.mockImplementation(async () => ({
      ok: false,
      errors: { summary: "Keep the summary under 4000 characters." },
    }));

    renderWithProviders(<StoryForm systems={systems} />);
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.click(screen.getByRole("button", { name: "Create story" }));

    expect(await screen.findByText("Keep the summary under 4000 characters.")).toBeInTheDocument();
  });

  it("starts from the story's values when editing, and saves through the update action", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryForm systems={systems} story={existing} />);
    expect(screen.getByRole("heading", { name: "Edit story" })).toBeInTheDocument();
    // Cancel is a link back to the story's page, beside Save.
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/stories/-15");
    // Active is on the heading's line, before the fields, beside Archive.
    const active = screen.getByLabelText(/Active/);
    expect(
      active.compareDocumentPosition(screen.getByLabelText(/Title/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      active.compareDocumentPosition(screen.getByRole("button", { name: "Archive" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByLabelText(/Title/)).toHaveValue("Vampire");
    expect(screen.getByLabelText(/System/)).toHaveValue("-6");
    expect(screen.getByLabelText(/Summary/)).toHaveValue("A city of the dead.");
    expect(screen.getByLabelText(/Looking for players/)).toBeChecked();

    await user.clear(screen.getByLabelText(/Title/));
    await user.type(screen.getByLabelText(/Title/), "Vampire: Chicago");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(sa_updateStory.mock.callCount()).toBe(1));
    expect(sa_updateStory.mock.calls[0].arguments).toEqual([
      -15,
      { ...existing.values, title: "Vampire: Chicago" },
      { dropStatBlock: false },
    ]);
    expect(sa_createStory.mock.callCount()).toBe(0);
  });

  it("warns before a change of system deletes the story's own stat block, and saves only as Save and delete", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <StoryForm systems={systems} story={{ ...existing, hasOwnStatBlock: true }} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await user.selectOptions(screen.getByLabelText(/System/), "-26");
    const warning = screen.getByRole("alert");
    expect(
      within(warning).getByText("This deletes the story's own stat block."),
    ).toBeInTheDocument();
    expect(warning).toHaveTextContent(
      "It was copied from Daggerheart (1e) and stands in for that system's alone, so saving with another system deletes it and every change made to it. This cannot be undone. Choose Daggerheart (1e) again to keep it.",
    );
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save and delete stat block" }));

    await waitFor(() => expect(sa_updateStory.mock.callCount()).toBe(1));
    expect(sa_updateStory.mock.calls[0].arguments).toEqual([
      -15,
      { ...existing.values, idSystem: -26 },
      { dropStatBlock: true },
    ]);

    // Back on the system it was copied from, nothing goes. The form's own
    // error from the mocked save (which never redirects) is an alert too, so
    // the warning is looked for by its words.
    await user.selectOptions(screen.getByLabelText(/System/), "-6");
    expect(screen.queryByText(/It was copied from/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("changes the system of a story with no stat block of its own without a warning", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryForm systems={systems} story={existing} />);
    await user.selectOptions(screen.getByLabelText(/System/), "");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(sa_updateStory.mock.callCount()).toBe(1));
    expect(sa_updateStory.mock.calls[0].arguments).toEqual([
      -15,
      { ...existing.values, idSystem: null },
      { dropStatBlock: false },
    ]);
  });

  it("archiving turns off active and looking for players, and unarchiving frees them again", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryForm systems={systems} story={existing} />);
    const archive = screen.getByRole("button", { name: "Archive" });
    expect(archive).toHaveAttribute("aria-pressed", "false");

    await user.click(archive);
    const unarchive = screen.getByRole("button", { name: "Unarchive" });
    expect(unarchive).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Active/)).not.toBeChecked();
    expect(screen.getByLabelText(/Active/)).toBeDisabled();
    expect(screen.getByLabelText(/Looking for players/)).not.toBeChecked();
    expect(screen.getByLabelText(/Looking for players/)).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(sa_updateStory.mock.callCount()).toBe(1));
    expect(sa_updateStory.mock.calls[0].arguments[1]).toEqual({
      ...existing.values,
      isLookingForPlayers: false,
      isActive: false,
      isArchived: true,
    });

    // Unarchiving does not tick the boxes back: the storyteller decides.
    await user.click(unarchive);
    expect(screen.getByRole("button", { name: "Archive" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByLabelText(/Active/)).toBeEnabled();
    expect(screen.getByLabelText(/Active/)).not.toBeChecked();
  });
});
