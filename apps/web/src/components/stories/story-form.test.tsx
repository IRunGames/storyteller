import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
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
const sa_createStory = mock.fn<(values: StoryValues) => Promise<Result>>(noErrors);
const sa_updateStory = mock.fn<(idGame: number, values: StoryValues) => Promise<Result>>(noErrors);

let StoryForm: typeof import("./story-form").StoryForm;

const existing = {
  idGame: -15,
  values: {
    title: "Vampire",
    idSystem: -6,
    summary: "A city of the dead.",
    imageUrl: "https://rpg.irun.games/images/vampire.jpg",
    isLookingForPlayers: true,
    isActive: true,
    isArchived: false,
  },
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

  it("submits the typed values with the chosen system", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryForm systems={systems} />);
    expect(screen.getByRole("heading", { name: "New story" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.selectOptions(screen.getByLabelText(/System/), "-26");
    await user.type(screen.getByLabelText(/Summary/), "A gala in Satyrine.");
    await user.click(screen.getByLabelText(/Looking for players/));
    await user.click(screen.getByRole("button", { name: "Create story" }));

    await waitFor(() => expect(sa_createStory.mock.callCount()).toBe(1));
    expect(sa_createStory.mock.calls[0].arguments[0]).toEqual({
      title: "Embers Leap",
      idSystem: -26,
      summary: "A gala in Satyrine.",
      imageUrl: "",
      isLookingForPlayers: true,
      isActive: true,
      isArchived: false,
    });
    expect(sa_updateStory.mock.callCount()).toBe(0);
  });

  it("starts a new story active, with nothing to archive yet", () => {
    renderWithProviders(<StoryForm systems={systems} />);

    expect(screen.getByLabelText(/Active/)).toBeChecked();
    expect(screen.queryByRole("button", { name: /Archive/ })).not.toBeInTheDocument();
  });

  it("shows server-side field errors", async () => {
    const user = userEvent.setup();
    sa_createStory.mock.mockImplementation(async () => ({
      ok: false,
      errors: { imageUrl: "Please enter a valid URL." },
    }));

    renderWithProviders(<StoryForm systems={systems} />);
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.type(screen.getByLabelText(/Image URL/), "https://example.com/x.jpg");
    await user.click(screen.getByRole("button", { name: "Create story" }));

    expect(await screen.findByText("Please enter a valid URL.")).toBeInTheDocument();
  });

  it("starts from the story's values when editing, and saves through the update action", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryForm systems={systems} story={existing} />);
    expect(screen.getByRole("heading", { name: "Edit story" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toHaveValue("Vampire");
    expect(screen.getByLabelText(/System/)).toHaveValue("-6");
    expect(screen.getByLabelText(/Summary/)).toHaveValue("A city of the dead.");
    expect(screen.getByLabelText(/Image URL/)).toHaveValue(
      "https://rpg.irun.games/images/vampire.jpg",
    );
    expect(screen.getByLabelText(/Looking for players/)).toBeChecked();

    await user.clear(screen.getByLabelText(/Title/));
    await user.type(screen.getByLabelText(/Title/), "Vampire: Chicago");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(sa_updateStory.mock.callCount()).toBe(1));
    expect(sa_updateStory.mock.calls[0].arguments).toEqual([
      -15,
      { ...existing.values, title: "Vampire: Chicago" },
    ]);
    expect(sa_createStory.mock.callCount()).toBe(0);
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
