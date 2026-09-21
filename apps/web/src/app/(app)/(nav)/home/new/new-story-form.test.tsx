import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { NewStoryValues } from "@/lib/story-schemas";
import { NewStoryForm } from "./new-story-form";

const systems = [
  { idSystem: -6, label: "Daggerheart (1e)" },
  { idSystem: -26, label: "Cypher System · Numenera (Revised)" },
];

describe("NewStoryForm", () => {
  it("refuses to submit without a title and does not call the action", async () => {
    const user = userEvent.setup();
    const onCreate = mock.fn(async () => ({ ok: false as const, errors: {} }));

    renderWithProviders(<NewStoryForm systems={systems} onCreate={onCreate} />);
    await user.click(screen.getByRole("button", { name: "Create story" }));

    expect(await screen.findByText("Please give the story a title.")).toBeInTheDocument();
    expect(onCreate.mock.callCount()).toBe(0);
  });

  it("submits the typed values with the chosen system", async () => {
    const user = userEvent.setup();
    const onCreate = mock.fn<(values: NewStoryValues) => Promise<{ ok: false; errors: Record<string, string> }>>(
      async () => ({ ok: false, errors: {} }),
    );

    renderWithProviders(<NewStoryForm systems={systems} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.selectOptions(screen.getByLabelText(/System/), "-26");
    await user.type(screen.getByLabelText(/Summary/), "A gala in Satyrine.");
    await user.click(screen.getByLabelText(/Looking for players/));
    await user.click(screen.getByRole("button", { name: "Create story" }));

    await waitFor(() => expect(onCreate.mock.callCount()).toBe(1));
    expect(onCreate.mock.calls[0].arguments[0]).toEqual({
      title: "Embers Leap",
      idSystem: -26,
      summary: "A gala in Satyrine.",
      imageUrl: "",
      isLookingForPlayers: true,
    });
  });

  it("shows server-side field errors", async () => {
    const user = userEvent.setup();
    const onCreate = async () => ({
      ok: false as const,
      errors: { imageUrl: "Please enter a valid URL." },
    });

    renderWithProviders(<NewStoryForm systems={systems} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/Title/), "Embers Leap");
    await user.type(screen.getByLabelText(/Image URL/), "https://example.com/x.jpg");
    await user.click(screen.getByRole("button", { name: "Create story" }));

    expect(await screen.findByText("Please enter a valid URL.")).toBeInTheDocument();
  });
});
