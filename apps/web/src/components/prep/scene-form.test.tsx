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

type Result = { ok: true } | { ok: false; errors: Record<string, string> };
const noErrors = async (): Promise<Result> => ({ ok: false, errors: {} });

// The form imports both actions itself; mocked so it renders without a
// database, and so each test can see which one it called and with what.
const sa_createStoryScene =
  mock.fn<(idStory: number, values: SceneValues) => Promise<Result>>(noErrors);
const sa_updateStoryScene =
  mock.fn<(idScene: number, values: SceneValues) => Promise<Result>>(noErrors);

// The scene workflow as the pill is handed it. Made up apart from the locked
// status, which is the one name the form itself knows.
const statusOptions = [
  { key: "PENDING", label: "Pending", description: null, from: ["COMPLETE"] },
  { key: "COMPLETE", label: "Complete", description: null, from: ["PENDING"] },
];

const sa_setRowStatus = mock.fn(async (_table: string, _id: number, status: string) => ({
  ok: true as const,
  status,
}));

// The pill's menu items take a pointer move before a click; see status-pill.test.tsx.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

let SceneForm: typeof import("./scene-form").SceneForm;

describe("SceneForm", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_createStoryScene, sa_updateStoryScene },
    });
    mock.module("@/components/status/actions", { namedExports: { sa_setRowStatus } });
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
    sa_setRowStatus.mock.resetCalls();
  });

  it("refuses to submit without a title and does not call the action", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SceneForm idStory={-15} sessions={sessions} />);

    await user.click(screen.getByRole("button", { name: "Create scene" }));

    expect(await screen.findByText("Please give the scene a title.")).toBeInTheDocument();
    expect(sa_createStoryScene.mock.callCount()).toBe(0);
  });

  it("creates a scene on the story with what was typed and the sitting picked, then says it is done", async () => {
    const user = userEvent.setup();
    sa_createStoryScene.mock.mockImplementation(async () => ({ ok: true }));
    const created = mock.fn();
    renderWithProviders(<SceneForm idStory={-15} sessions={sessions} onCreated={created} />);

    // The dialog it sits in carries the title, so the form has no heading.
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "The vault");
    await user.type(screen.getByRole("textbox", { name: /Description/ }), "Two guards.");
    await user.selectOptions(screen.getByRole("combobox", { name: /Session/ }), "2. Kildealg");
    await user.click(screen.getByRole("button", { name: "Create scene" }));

    await waitFor(() => expect(sa_createStoryScene.mock.callCount()).toBe(1));
    expect(sa_createStoryScene.mock.calls[0].arguments).toEqual([
      -15,
      { title: "The vault", description: "Two guards.", idStorySession: 3 },
    ]);
    await waitFor(() => expect(created.mock.callCount()).toBe(1));
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
          status: "PENDING",
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
          status: "PENDING",
          values: { title: "The vault", description: "", idStorySession: null },
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("A completed scene can no longer be edited."),
    ).toBeInTheDocument();
  });

  it("closes its dialog on Cancel when new, and goes back to the board when editing", async () => {
    const user = userEvent.setup();
    const cancel = mock.fn();
    const { unmount } = renderWithProviders(
      <SceneForm idStory={-15} sessions={sessions} onCancel={cancel} />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel.mock.callCount()).toBe(1);
    unmount();

    renderWithProviders(
      <SceneForm
        idStory={-15}
        sessions={sessions}
        scene={{
          idStoryScene: 7,
          status: "PENDING",
          values: { title: "The vault", description: "", idStorySession: null },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/libraries/-15");
  });

  it("moves the scene's status from a pill on the edit form, and stops saving once it is complete", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SceneForm
        idStory={-15}
        sessions={sessions}
        statusOptions={statusOptions}
        scene={{
          idStoryScene: 7,
          status: "PENDING",
          values: { title: "The vault", description: "", idStorySession: null },
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Pending" }));
    await choose(user, await screen.findByRole("menuitem", { name: "Complete" }));

    await waitFor(() => expect(sa_setRowStatus.mock.callCount()).toBe(1));
    expect(sa_setRowStatus.mock.calls[0].arguments).toEqual(["story_scenes", 7, "COMPLETE"]);
    expect(await screen.findByText(/can no longer be changed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("has no status pill on a new scene", () => {
    renderWithProviders(
      <SceneForm idStory={-15} sessions={sessions} statusOptions={statusOptions} />,
    );
    expect(screen.queryByRole("button", { name: "Pending" })).not.toBeInTheDocument();
  });
});
