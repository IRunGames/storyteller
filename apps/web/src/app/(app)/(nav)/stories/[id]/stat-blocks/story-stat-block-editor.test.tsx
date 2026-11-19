import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { StatBlockDefinition } from "@/lib/stat-blocks";

const sa_setStoryStatBlockDefinition = mock.fn<
  (idStory: number, definition: StatBlockDefinition) => Promise<{ ok: true }>
>(async () => ({ ok: true }));

let StoryStatBlockEditor: typeof import("./story-stat-block-editor").StoryStatBlockEditor;

// The editor itself is tested beside it (stat-block-definition-editor.test.tsx);
// this is only that the story's page saves over the story's copy.
describe("StoryStatBlockEditor", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/[id]/actions", {
      namedExports: { sa_setStoryStatBlockDefinition },
    });
    ({ StoryStatBlockEditor } = await import("./story-stat-block-editor"));
  });

  it("says the stat block is the story's in place of its system's, saves over the story, and links back to it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryStatBlockEditor
        idStory={-15}
        systemLabel="Vampire: The Masquerade (5th)"
        definition={{ groups: [], updatedAt: "2026-11-01T00:00:00.000Z" }}
      />,
    );

    expect(
      screen.getByText(/in place of Vampire: The Masquerade \(5th\)'s, which other stories/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to story" })).toHaveAttribute(
      "href",
      "/stories/-15",
    );
    await user.click(screen.getByRole("button", { name: "Save stat block" }));
    await waitFor(() => expect(sa_setStoryStatBlockDefinition.mock.callCount()).toBe(1));
    // The stamp is the action's to write; the form posts the groups.
    expect(sa_setStoryStatBlockDefinition.mock.calls[0].arguments).toEqual([-15, { groups: [] }]);
  });
});
