import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import userEvent from "@testing-library/user-event";

import type { PictureState } from "@/lib/annotations";
import { Toaster, toaster } from "@/components/ui/toaster";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import { AttachmentPreviewDialog } from "@/components/uploads/attachment-preview";

type SetResult = { ok: true; annotation: null } | { ok: false; error: string };

const sa_setAnnotated = mock.fn(async (_picture: number, _on: boolean): Promise<SetResult> => ({
  ok: true,
  annotation: null,
}));
const onAnnotatedChange = mock.fn((_annotated: boolean) => {});
// The picture read back after a change, as the server holds it.
const shownState = {
  idAttachment: 5,
  shownUrl: "https://abc.public.blob.vercel-storage.com/annotations/5/copy.webp",
  canAnnotate: true,
  hasDrawing: true,
  isAnnotated: true,
  behind: false,
};
const sa_getPictureState = mock.fn(async (_picture: number) => shownState);
const onPictureChange = mock.fn((_state: PictureState) => {});
// What the page is told: the picture without the read's own `behind`.
const { behind: _behind, ...shownPicture } = shownState;

let AnnotationControls: typeof import("./annotation-controls").AnnotationControls;

before(async () => {
  mock.module("./actions", {
    namedExports: {
      sa_setAnnotated,
      sa_getAnnotation: mock.fn(async () => null),
      sa_saveAnnotation: mock.fn(),
      sa_refreshPlayersCopy: mock.fn(async () => ({ ok: true, behind: false })),
      sa_getScenePicture: mock.fn(async () => null),
      sa_getPictureState,
      sa_openAnnotation: mock.fn(async () => ({ ok: false, error: "Not here." })),
    },
  });
  ({ AnnotationControls } = await import("./annotation-controls"));
});

describe("AnnotationControls", () => {
  beforeEach(() => {
    sa_setAnnotated.mock.resetCalls();
    sa_setAnnotated.mock.restore();
    onAnnotatedChange.mock.resetCalls();
    onPictureChange.mock.resetCalls();
    sa_getPictureState.mock.resetCalls();
  });

  afterEach(() => toaster.remove());

  function controls(isAnnotated: boolean) {
    renderWithProviders(
      <>
        <AnnotationControls
          idAttachment={5}
          label="Harbour map"
          isAnnotated={isAnnotated}
          onAnnotatedChange={onAnnotatedChange}
          onPictureChange={onPictureChange}
        />
        <Toaster />
      </>,
    );
    return screen.getByRole("button", { name: "Annotate for players" });
  }

  it("annotates the picture for the players at one press", async () => {
    const user = userEvent.setup();
    const toggle = controls(false);
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(sa_setAnnotated.mock.calls[0].arguments).toEqual([5, true]);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
    expect(onAnnotatedChange.mock.calls.map((call) => call.arguments[0])).toEqual([true]);
    expect(screen.getByRole("button", { name: "Open annotator" })).toBeInTheDocument();
  });

  // Turning it off shows the players the picture as it is, which they may
  // keep once seen, so it is asked about first.
  it("asks before showing the players the picture as it is, and Cancel changes nothing", async () => {
    const user = userEvent.setup();
    const toggle = controls(true);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    let ask = await screen.findByRole("dialog", {
      name: "Show the players the original picture (no fog)?",
    });
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(sa_setAnnotated.mock.callCount()).toBe(0);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    ask = await screen.findByRole("dialog", {
      name: "Show the players the original picture (no fog)?",
    });
    await user.click(within(ask).getByRole("button", { name: "Show it" }));

    expect(sa_setAnnotated.mock.calls[0].arguments).toEqual([5, false]);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
    expect(onAnnotatedChange.mock.calls.map((call) => call.arguments[0])).toEqual([false]);
  });

  // In a full-size preview's bottom bar the fog switch is a pill at the
  // bar's start that says whether fog is on, the pencil after it.
  function inPreview(isAnnotated: boolean) {
    renderWithProviders(
      <AttachmentPreviewDialog
        open
        onOpenChange={() => {}}
        url="https://x.test/copy.webp"
        label="Harbour map"
        tags={["map"]}
        isCover={false}
        actions={
          <AnnotationControls
            idAttachment={5}
            label="Harbour map"
            isAnnotated={isAnnotated}
            onAnnotatedChange={onAnnotatedChange}
            onPictureChange={onPictureChange}
            portalled={false}
          />
        }
      />,
    );
    return screen.getByTestId("preview-foot");
  }

  it("draws the fog switch in a preview's bar as a pill saying fog is on, the pencil after it", async () => {
    const user = userEvent.setup();
    const bar = inPreview(true);
    const pill = within(bar).getByRole("button", { name: "FOG OF WAR ACTIVE" });
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(pill.querySelector("svg")).toHaveAttribute("fill", "currentColor");
    expect(within(bar).queryByRole("button", { name: "Annotate for players" })).toBeNull();
    const pencil = within(bar).getByRole("button", { name: "Open annotator" });
    expect(pill.compareDocumentPosition(pencil) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      pencil.compareDocumentPosition(within(bar).getByText("map")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Pressed, it asks first, as the cloud does, then turns the fog off.
    await user.click(pill);
    const ask = await screen.findByRole("dialog", {
      name: "Show the players the original picture (no fog)?",
    });
    await user.click(within(ask).getByRole("button", { name: "Show it" }));
    expect(sa_setAnnotated.mock.calls[0].arguments).toEqual([5, false]);
    const off = await within(bar).findByRole("button", { name: "FOG OF WAR OFF" });
    expect(off).toHaveAttribute("aria-pressed", "false");
    expect(off.querySelector("svg")).toHaveAttribute("fill", "none");
  });

  it("turns the fog on from a preview's bar at one press of the pill", async () => {
    const user = userEvent.setup();
    const bar = inPreview(false);
    const pill = within(bar).getByRole("button", { name: "FOG OF WAR OFF" });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(pill.querySelector("svg")).toHaveAttribute("fill", "none");

    await user.click(pill);

    expect(sa_setAnnotated.mock.calls[0].arguments).toEqual([5, true]);
    const on = await within(bar).findByRole("button", { name: "FOG OF WAR ACTIVE" });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(onAnnotatedChange.mock.calls.map((call) => call.arguments[0])).toEqual([true]);
  });

  it("puts the toggle back and says why when the action refuses", async () => {
    sa_setAnnotated.mock.mockImplementation(async () => ({
      ok: false,
      error: "Only a picture uploaded to the story can be annotated.",
    }));
    const user = userEvent.setup();
    const toggle = controls(false);

    await user.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
    expect(
      await screen.findByText("Only a picture uploaded to the story can be annotated."),
    ).toBeInTheDocument();
    expect(onAnnotatedChange.mock.calls.map((call) => call.arguments[0])).toEqual([true, false]);
  });

  // A picture can be opened in the annotator before it has a drawing; a
  // change made there turns it on (sa_saveAnnotation).
  it("offers the annotator before the picture has a drawing", () => {
    controls(false);
    expect(screen.getByRole("button", { name: "Open annotator" })).toBeInTheDocument();
  });

  // The pictures on the page show the players' copy once it is rendered.
  it("reads the picture back once a press has gone through, for the page to show", async () => {
    const user = userEvent.setup();
    const toggle = controls(false);
    await user.click(toggle);
    await waitFor(() => expect(onPictureChange.mock.callCount()).toBeGreaterThan(0));
    expect(sa_getPictureState.mock.calls[0].arguments).toEqual([5]);
    expect(onPictureChange.mock.calls.at(-1)?.arguments[0]).toEqual(shownPicture);
  });

  it("reads the picture again while its players' copy is behind", async () => {
    sa_getPictureState.mock.mockImplementationOnce(async () => ({ ...shownState, behind: true }));
    const user = userEvent.setup();
    await user.click(controls(false));
    await waitFor(() => expect(sa_getPictureState.mock.callCount()).toBe(2), { timeout: 4000 });
    expect(onPictureChange.mock.callCount()).toBe(2);
    expect(onPictureChange.mock.calls.at(-1)?.arguments[0]).toEqual(shownPicture);
  });
});
