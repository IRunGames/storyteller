import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { useState } from "react";
import userEvent from "@testing-library/user-event";

import type { AnnotationOp, SaveAnnotationInput } from "@/lib/annotation-schemas";
import type { PictureAnnotation } from "@/lib/annotations";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";

type SaveResult = { ok: true; revision: number } | { ok: false; error: string; stale?: true };

type Opened = { ok: true; annotation: PictureAnnotation } | { ok: false; error: string };
const sa_openAnnotation = mock.fn<(idAttachment: number) => Promise<Opened>>();
const sa_getAnnotation = mock.fn(async (_idAttachment: number) => null);
const sa_saveAnnotation =
  mock.fn<(idAttachment: number, input: SaveAnnotationInput) => Promise<SaveResult>>();
const sa_refreshPlayersCopy = mock.fn(async () => ({ ok: true }));
const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

let AnnotatorDialog: typeof import("./annotator-dialog").AnnotatorDialog;
let UserPreferencesProvider: typeof import("@/components/preferences/user-preferences-provider").UserPreferencesProvider;
let SAVE_DELAY_MS: number;

const fog: AnnotationOp = { t: "rect", mode: "reveal", x: 0, y: 0, w: 10, h: 10 };
const drawing: PictureAnnotation = {
  idAttachment: 5,
  imageUrl: "https://abc.public.blob.vercel-storage.com/uploads/u/map.png",
  isActive: true,
  width: 400,
  height: 200,
  ops: [fog],
  revision: 2,
  fogOpacityPlayers: 100,
  fogColor: "#1b1d23",
};

before(async () => {
  mock.module("./actions", {
    namedExports: { sa_openAnnotation, sa_getAnnotation, sa_saveAnnotation, sa_refreshPlayersCopy },
  });
  mock.module("@/components/preferences/actions", { namedExports: { sa_setUserPreference } });
  ({ AnnotatorDialog } = await import("./annotator-dialog"));
  ({ SAVE_DELAY_MS } = await import("./use-annotation-session"));
  ({ UserPreferencesProvider } =
    await import("@/components/preferences/user-preferences-provider"));
});

describe("AnnotatorDialog", () => {
  const onOpenChange = mock.fn((_open: boolean) => {});

  beforeEach(() => {
    sa_openAnnotation.mock.resetCalls();
    sa_openAnnotation.mock.mockImplementation(async () => ({ ok: true, annotation: drawing }));
    sa_saveAnnotation.mock.resetCalls();
    sa_saveAnnotation.mock.mockImplementation(async (_p, input) => ({
      ok: true,
      revision: input.baseRevision + 1,
    }));
    sa_setUserPreference.mock.resetCalls();
    onOpenChange.mock.resetCalls();
  });

  afterEach(() => mock.restoreAll());

  // The picture shown at half its size, from the page's corner. Only the
  // surface is measured: a size on every element would send the popovers'
  // positioning after an IntersectionObserver jsdom does not have.
  function measured(surface: HTMLElement) {
    mock.method(surface, "getBoundingClientRect", () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    return surface;
  }

  function open(isOpen = true) {
    return renderWithProviders(
      <UserPreferencesProvider preferences={{}}>
        <AnnotatorDialog
          idAttachment={5}
          label="Harbour map"
          open={isOpen}
          onOpenChange={onOpenChange}
        />
      </UserPreferencesProvider>,
    );
  }

  it("loads the drawing over the raw picture, with the tools above it", async () => {
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    expect(await within(dialog).findByRole("img", { name: "Harbour map" })).toHaveAttribute(
      "src",
      drawing.imageUrl,
    );
    expect(within(dialog).getByRole("toolbar", { name: "Annotation tools" })).toBeInTheDocument();
    expect(sa_openAnnotation.mock.calls[0].arguments).toEqual([5]);
  });

  it("saves a rectangle drawn with the fog rectangle", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    await user.click(await within(dialog).findByRole("radio", { name: "Fog rectangle" }));
    const surface = measured(within(dialog).getByRole("application", { name: "Drawing surface" }));
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 60, clientY: 40, pointerId: 1 });

    await waitFor(() => expect(sa_saveAnnotation.mock.callCount()).toBe(1));
    expect(sa_saveAnnotation.mock.calls[0].arguments).toEqual([
      5,
      {
        baseRevision: 2,
        keep: 1,
        append: [{ t: "rect", mode: "reveal", x: 20, y: 20, w: 100, h: 60 }],
      },
    ]);
  });

  it("undoes the last step with Ctrl+Z, and covers the picture whole from the toolbar", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    await within(dialog).findByRole("toolbar", { name: "Annotation tools" });
    await user.keyboard("{Control>}z{/Control}");
    await user.click(within(dialog).getByRole("button", { name: "Cover all" }));

    await waitFor(() => expect(sa_saveAnnotation.mock.callCount()).toBe(1));
    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toEqual({
      baseRevision: 2,
      keep: 0,
      append: [{ t: "fogAll", mode: "cover" }],
    });
  });

  it("puts Undo and whether the drawing is saved beside the title", async () => {
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    await within(dialog).findByRole("toolbar", { name: "Annotation tools" });
    const title = within(dialog).getByRole("heading", { name: "Annotate Harbour map" });
    const header = title.parentElement!;
    expect(within(header).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(within(header).getByRole("status")).toHaveTextContent("Saved");
  });

  it("hides the fog from the storyteller's own view, saving nothing", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    await within(dialog).findByRole("toolbar", { name: "Annotation tools" });
    const surface = within(dialog).getByRole("application", { name: "Drawing surface" });
    expect(surface.querySelector('[data-layer="fog"]')).not.toBeNull();

    await user.click(within(dialog).getByRole("switch", { name: "Show fog" }));
    expect(surface.querySelector('[data-layer="fog"]')).toBeNull();
    await user.click(within(dialog).getByRole("switch", { name: "Show fog" }));
    expect(surface.querySelector('[data-layer="fog"]')).not.toBeNull();
    expect(sa_saveAnnotation.mock.callCount()).toBe(0);
  });

  it("keeps the pen's color among the storyteller's preferences", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    await user.click(await within(dialog).findByRole("button", { name: "Pen" }));
    await user.click(within(dialog).getByRole("button", { name: "Pen color" }));
    await user.click(await within(dialog).findByRole("radio", { name: "Green" }));
    expect(sa_setUserPreference.mock.calls.map((call) => call.arguments[0])).toEqual([
      { key: "annotation.penColor", value: "#43a047" },
    ]);
  });

  it("saves what is waiting as it closes, without the pause", async () => {
    const user = userEvent.setup();
    const view = open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    await user.click(await within(dialog).findByRole("button", { name: "Erase all annotations" }));
    expect(sa_saveAnnotation.mock.callCount()).toBe(0);

    view.rerender(
      <UserPreferencesProvider preferences={{}}>
        <AnnotatorDialog
          idAttachment={5}
          label="Harbour map"
          open={false}
          onOpenChange={onOpenChange}
        />
      </UserPreferencesProvider>,
    );
    await waitFor(() => expect(sa_saveAnnotation.mock.callCount()).toBe(1));
    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toMatchObject({
      append: [{ t: "penClear" }],
    });
  });

  const walled: PictureAnnotation = {
    ...drawing,
    ops: [{ t: "wall", points: [200, 0, 200, 200] }],
  };

  // Clicks with the wall pen at points on the screen, a press let go where it went down.
  function corners(surface: HTMLElement, points: [number, number][]) {
    for (const [clientX, clientY] of points) {
      fireEvent.pointerDown(surface, { clientX, clientY, pointerId: 1, button: 0 });
      fireEvent.pointerUp(surface, { clientX, clientY, pointerId: 1 });
    }
  }

  // The wall pen taken in hand, and the surface it draws on.
  async function wallPen(dialog: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
    await user.click(await within(dialog).findByRole("radio", { name: "Wall pen" }));
    return measured(within(dialog).getByRole("application", { name: "Drawing surface" }));
  }

  it("opens with the flood in hand on a drawing with walls, and the brush on one without", async () => {
    sa_openAnnotation.mock.mockImplementation(async () => ({ ok: true, annotation: walled }));
    const view = open();
    let dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    expect(await within(dialog).findByRole("radio", { name: "Flood" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    view.unmount();

    sa_openAnnotation.mock.mockImplementation(async () => ({ ok: true, annotation: drawing }));
    open();
    dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    expect(await within(dialog).findByRole("radio", { name: "Fog brush" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(dialog).getByRole("radio", { name: "Flood" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  // At half size, the screen's (20, 20), (60, 20) and (60, 60) are the
  // picture's (40, 40), (120, 40) and (120, 120), all in open space, so
  // Escape closes the wall back to its first corner.
  it("finishes a wall on Escape and stays open, and closes on the next Escape", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    const surface = await wallPen(dialog, user);
    corners(surface, [
      [20, 20],
      [60, 20],
      [60, 60],
    ]);
    expect(within(dialog).getByRole("button", { name: "Finish wall" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onOpenChange.mock.callCount()).toBe(0);
    expect(within(dialog).queryByRole("button", { name: "Finish wall" })).toBeNull();
    await waitFor(() => expect(sa_saveAnnotation.mock.callCount()).toBe(1));
    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toEqual({
      baseRevision: 2,
      keep: 1,
      append: [{ t: "wall", points: [40, 40, 120, 40, 120, 120, 40, 40] }],
    });

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(onOpenChange.mock.calls.map((call) => call.arguments[0])).toEqual([false]),
    );
  });

  // Closed from its own close button, the annotator is shut by whoever holds
  // it, as the pages do: the wall is finished before the workspace goes, so
  // the save made as it closes carries it.
  it("finishes a wall in progress when it is closed, and saves it as it closes", async () => {
    const user = userEvent.setup();
    function Holder() {
      const [isOpen, setOpen] = useState(true);
      return (
        <UserPreferencesProvider preferences={{}}>
          <AnnotatorDialog
            idAttachment={5}
            label="Harbour map"
            open={isOpen}
            onOpenChange={(next) => {
              onOpenChange(next);
              setOpen(next);
            }}
          />
        </UserPreferencesProvider>
      );
    }
    renderWithProviders(<Holder />);
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    const surface = await wallPen(dialog, user);
    corners(surface, [
      [20, 20],
      [60, 20],
      [60, 60],
    ]);

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onOpenChange.mock.calls.map((call) => call.arguments[0])).toEqual([false]);
    await waitFor(() => expect(sa_saveAnnotation.mock.callCount()).toBe(1));
    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toEqual({
      baseRevision: 2,
      keep: 1,
      append: [{ t: "wall", points: [40, 40, 120, 40, 120, 120, 40, 40] }],
    });
  });

  it("takes back the last corner on Ctrl+Z while a wall is drawn, saving nothing", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    const surface = await wallPen(dialog, user);
    corners(surface, [
      [20, 20],
      [60, 20],
    ]);
    await user.keyboard("{Control>}z{/Control}");
    expect(within(dialog).getByRole("button", { name: "Finish wall" })).toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(within(dialog).queryByRole("button", { name: "Finish wall" })).toBeNull();

    // Past the pause a change waits for: nothing went, and the drawing's own
    // step is still there to undo.
    await new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS + 100));
    expect(sa_saveAnnotation.mock.callCount()).toBe(0);
    expect(within(dialog).getByRole("status")).toHaveTextContent("Saved");
    expect(within(dialog).getByRole("button", { name: "Undo" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("takes back the last corner with the Undo button while a wall is drawn", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    const surface = await wallPen(dialog, user);
    corners(surface, [[20, 20]]);
    await user.click(within(dialog).getByRole("button", { name: "Undo" }));
    expect(within(dialog).queryByRole("button", { name: "Finish wall" })).toBeNull();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Saved");
  });

  it("finishes the wall in progress with Finish wall, for a screen with no Escape", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    const surface = await wallPen(dialog, user);
    corners(surface, [
      [20, 20],
      [60, 20],
      [60, 60],
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Finish wall" }));
    expect(within(dialog).queryByRole("button", { name: "Finish wall" })).toBeNull();

    await waitFor(() => expect(sa_saveAnnotation.mock.callCount()).toBe(1));
    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toMatchObject({
      append: [{ t: "wall", points: [40, 40, 120, 40, 120, 120, 40, 40] }],
    });
  });

  it("finishes the wall in progress when another tool is taken", async () => {
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    const surface = await wallPen(dialog, user);
    corners(surface, [
      [20, 20],
      [60, 20],
      [60, 60],
    ]);
    await user.click(within(dialog).getByRole("radio", { name: "Fog brush" }));

    await waitFor(() => expect(sa_saveAnnotation.mock.callCount()).toBe(1));
    expect(sa_saveAnnotation.mock.calls[0].arguments[1]).toMatchObject({
      append: [{ t: "wall", points: [40, 40, 120, 40, 120, 120, 40, 40] }],
    });
  });

  it("says why when the picture cannot be opened in it", async () => {
    sa_openAnnotation.mock.mockImplementation(async () => ({
      ok: false,
      error: "Only a picture uploaded to the story can be annotated.",
    }));
    open();
    const dialog = await screen.findByRole("dialog", { name: "Annotate Harbour map" });
    expect(
      await within(dialog).findByText("Only a picture uploaded to the story can be annotated."),
    ).toBeInTheDocument();
  });
});
