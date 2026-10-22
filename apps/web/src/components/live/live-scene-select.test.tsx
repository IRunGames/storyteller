import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { RunPlaySpace, RunScene } from "@/lib/run";
import type { StatusOption } from "@/lib/status";

const statusOptions: StatusOption[] = ["PENDING", "ACTIVE", "COMPLETE"].map((key) => ({
  key,
  label: key.charAt(0) + key.slice(1).toLowerCase(),
  description: null,
  from: null,
}));

const current: RunScene = { idStoryScene: -15, title: "The docks", status: "ACTIVE" };

// Oldest first, as the page hands them over.
const sessions = [
  { idStorySession: -31, label: "Session 1" },
  { idStorySession: -30, label: "2. Kildealg" },
];

type Search = { query: string; statuses: string[]; sessions: number[] };
const found: RunScene[] = [
  current,
  { idStoryScene: -16, title: "The abbey", status: "PENDING", sessionHeading: null },
  { idStoryScene: -17, title: "The vault", status: "COMPLETE", sessionHeading: "2. Kildealg" },
];
const sa_searchLiveScenes = mock.fn(
  async (_idStory: number, _search: Search): Promise<RunScene[]> => found,
);
const sa_createLiveScene = mock.fn(
  async (
    _idStory: number,
    values: { title: string },
  ): Promise<{ ok: true; space: RunPlaySpace }> => ({
    ok: true,
    space: {
      scene: { idStoryScene: -18, title: values.title, status: "PENDING" },
      tags: [],
      coverUrl: null,
      inPlay: [],
    },
  }),
);

// Zag selects only the highlighted item, and a lone synthetic hover does not
// reliably highlight it; see status-pill.test.tsx.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

/** The last search the selector sent, once one has gone. */
async function lastSearch(): Promise<Search> {
  await waitFor(() => expect(sa_searchLiveScenes.mock.callCount()).toBeGreaterThan(0));
  return sa_searchLiveScenes.mock.calls.at(-1)!.arguments[1];
}

let LiveSceneSelect: typeof import("./live-scene-select").LiveSceneSelect;

describe("LiveSceneSelect", () => {
  before(async () => {
    Element.prototype.scrollIntoView = () => {};
    mock.module("@/app/(app)/scenes/[id]/live/actions", {
      namedExports: { sa_searchLiveScenes },
    });
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: { sa_createLiveScene, sa_createRunScene: mock.fn() },
    });
    ({ LiveSceneSelect } = await import("./live-scene-select"));
  });

  beforeEach(() => {
    sa_searchLiveScenes.mock.resetCalls();
    sa_createLiveScene.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  function render(onChoose: (id: number) => void = () => {}) {
    return renderWithProviders(
      <>
        <LiveSceneSelect
          idStory={-4}
          scene={current}
          sessions={sessions}
          statusOptions={statusOptions}
          onChoose={onChoose}
        />
        <Toaster />
      </>,
    );
  }

  it("starts on every status and no session, so it looks for the scenes in none", async () => {
    render();

    expect(await lastSearch()).toEqual({
      query: "",
      statuses: ["PENDING", "ACTIVE", "COMPLETE"],
      sessions: [],
    });
    const button = screen.getByRole("button", { name: "Sessions: 0 selected" });
    expect(button).toHaveTextContent("0");
  });

  it("asks again with a status switched off, and with what is typed", async () => {
    const user = userEvent.setup();
    render();
    await lastSearch();

    await user.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(async () => expect((await lastSearch()).statuses).toEqual(["PENDING", "ACTIVE"]));

    await user.type(screen.getByRole("combobox", { name: "Scene" }), "vau");
    await waitFor(async () => expect((await lastSearch()).query).toBe("vau"));
  });

  it("narrows to the sessions ticked, newest first, and says on the button how many", async () => {
    const user = userEvent.setup();
    render();
    await lastSearch();

    await user.click(screen.getByRole("button", { name: "Sessions: 0 selected" }));
    const items = await screen.findAllByRole("menuitemcheckbox");
    expect(items.map((item) => item.textContent)).toEqual(["2. Kildealg", "Session 1"]);

    await choose(user, items[0]);
    expect(await screen.findByRole("button", { name: "Sessions: 1 selected" })).toHaveTextContent(
      "1",
    );
    await waitFor(async () => expect((await lastSearch()).sessions).toEqual([-30]));

    await choose(user, items[1]);
    await screen.findByRole("button", { name: "Sessions: 2 selected" });
    // In the story's order, whatever order they were ticked in.
    await waitFor(async () => expect((await lastSearch()).sessions).toEqual([-31, -30]));
  });

  it("lists each scene with its status and sitting, and goes to the one chosen", async () => {
    const user = userEvent.setup();
    const onChoose = mock.fn<(id: number) => void>();
    render(onChoose);
    await lastSearch();

    await user.click(screen.getByRole("combobox", { name: "Scene" }));
    const vault = await screen.findByRole("option", { name: /The vault/ });
    expect(vault).toHaveTextContent("2. Kildealg");
    expect(vault).toHaveTextContent("Complete");
    expect(screen.getByRole("option", { name: /The docks/ })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await user.click(vault);
    await waitFor(() => expect(onChoose.mock.calls[0]?.arguments).toEqual([-17]));
  });

  it("makes a new scene from the + beside the box, and goes to it", async () => {
    const user = userEvent.setup();
    const onChoose = mock.fn<(id: number) => void>();
    render(onChoose);

    await user.click(screen.getByRole("button", { name: "New scene" }));
    const dialog = await screen.findByRole("dialog", { name: "New scene" });
    await user.type(within(dialog).getByRole("textbox", { name: /^Title/ }), "The ambush");
    await user.click(within(dialog).getByRole("button", { name: "Create scene" }));

    await waitFor(() => expect(sa_createLiveScene.mock.callCount()).toBe(1));
    expect(sa_createLiveScene.mock.calls[0].arguments).toEqual([
      -4,
      { title: "The ambush", description: "" },
    ]);
    await waitFor(() => expect(onChoose.mock.calls[0]?.arguments).toEqual([-18]));
  });
});
