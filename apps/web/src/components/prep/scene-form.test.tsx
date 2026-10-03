import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { SceneValues } from "@/lib/scene-schemas";

const sessions = [
  { idStorySession: 2, label: "Session 1" },
  { idStorySession: 3, label: "2. Kildealg" },
];

type Result = { ok: false; errors: Record<string, string> };
const noErrors = async (): Promise<Result> => ({ ok: false, errors: {} });

// The form imports both actions itself; mocked so it renders without a
// database, and so each test can see which one it called and with what.
const sa_createStoryScene =
  mock.fn<(idStory: number, values: SceneValues) => Promise<Result>>(noErrors);
const sa_updateStoryScene =
  mock.fn<(idScene: number, values: SceneValues) => Promise<Result>>(noErrors);

let SceneForm: typeof import("./scene-form").SceneForm;

describe("SceneForm", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_createStoryScene, sa_updateStoryScene },
    });
    // The edit form's pictures field has a test file of its own.
    mock.module("@/components/uploads/attachment-list-field", {
      namedExports: {
        AttachmentListField: ({ idExternal }: { idExternal: number }) => (
          <p>Pictures of scene {idExternal}</p>
        ),
      },
    });
    ({ SceneForm } = await import("./scene-form"));
  });

  beforeEach(() => {
    sa_createStoryScene.mock.resetCalls();
    sa_createStoryScene.mock.mockImplementation(noErrors);
    sa_updateStoryScene.mock.resetCalls();
    sa_updateStoryScene.mock.mockImplementation(noErrors);
  });

  it("refuses to submit without a title and does not call the action", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SceneForm idStory={-15} storyTitle="Vampire" sessions={sessions} />);

    await user.click(screen.getByRole("button", { name: "Create scene" }));

    expect(await screen.findByText("Please give the scene a title.")).toBeInTheDocument();
    expect(sa_createStoryScene.mock.callCount()).toBe(0);
  });

  it("creates a scene on the story with what was typed and the sitting picked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SceneForm idStory={-15} storyTitle="Vampire" sessions={sessions} />);

    expect(screen.getByText("For Vampire.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "The vault");
    await user.type(screen.getByRole("textbox", { name: /Description/ }), "Two guards.");
    await user.selectOptions(screen.getByRole("combobox", { name: /Session/ }), "2. Kildealg");
    await user.click(screen.getByRole("button", { name: "Create scene" }));

    await waitFor(() => expect(sa_createStoryScene.mock.callCount()).toBe(1));
    expect(sa_createStoryScene.mock.calls[0].arguments).toEqual([
      -15,
      { title: "The vault", description: "Two guards.", idStorySession: 3 },
    ]);
    // Pictures wait for the scene to exist.
    expect(screen.queryByText(/Pictures of scene/)).not.toBeInTheDocument();
  });

  it("starts from the scene's values when editing, saves through the update action, and has its pictures", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SceneForm
        idStory={-15}
        sessions={sessions}
        scene={{
          idStoryScene: 7,
          values: { title: "The vault", description: "", idStorySession: null },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Edit scene" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Title/ })).toHaveValue("The vault");
    expect(screen.getByRole("combobox", { name: /Session/ })).toHaveValue("");
    expect(screen.getByText("Pictures of scene 7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(sa_updateStoryScene.mock.callCount()).toBe(1));
    expect(sa_updateStoryScene.mock.calls[0].arguments).toEqual([
      7,
      { title: "The vault", description: "", idStorySession: null },
    ]);
  });

  it("puts a field error on its field, and one with no field on top", async () => {
    const user = userEvent.setup();
    sa_updateStoryScene.mock.mockImplementation(async () => ({
      ok: false,
      errors: { "": "A completed scene can no longer be edited." },
    }));
    sa_createStoryScene.mock.mockImplementation(async () => ({
      ok: false,
      errors: { idStorySession: "That session is not part of this story." },
    }));

    const { unmount } = renderWithProviders(<SceneForm idStory={-15} sessions={sessions} />);
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "The vault");
    await user.click(screen.getByRole("button", { name: "Create scene" }));
    expect(await screen.findByText("That session is not part of this story.")).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <SceneForm
        idStory={-15}
        sessions={sessions}
        scene={{
          idStoryScene: 7,
          values: { title: "The vault", description: "", idStorySession: null },
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("A completed scene can no longer be edited."),
    ).toBeInTheDocument();
  });

  it("goes back to the story's board on Cancel", () => {
    renderWithProviders(<SceneForm idStory={-15} sessions={sessions} />);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/libraries/-15");
  });
});
