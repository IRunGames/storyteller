import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { fireEvent, screen, within } from "@testing-library/react";
import { Portal } from "@chakra-ui/react";

import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { AttachmentPreview, AttachmentPreviewDialog } from "./attachment-preview";

describe("AttachmentPreview", () => {
  // A players' copy fogged whole is a plain block of the fog's color, so
  // the thumbnail and the full-size preview both say what it is.
  it("says a picture covered in fog is, on its thumbnail and full size", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AttachmentPreview
        url="https://x.test/copy.webp"
        label="Harbour map"
        tags={[]}
        isCover={false}
        fogCovered
      />,
    );
    expect(screen.getByText("Image is covered in fog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview Harbour map" }));
    const dialog = await screen.findByRole("dialog", { name: "Harbour map" });
    expect(within(dialog).getByText("Image is covered in fog")).toBeInTheDocument();
  });

  it("says nothing over a picture that shows something", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AttachmentPreview
        url="https://x.test/map.png"
        label="Harbour map"
        tags={[]}
        isCover={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Preview Harbour map" }));
    await screen.findByRole("dialog", { name: "Harbour map" });
    expect(screen.queryByText("Image is covered in fog")).not.toBeInTheDocument();
  });
});

describe("AttachmentPreview with fog on it", () => {
  // A players' copy with fog anywhere on it is marked in the preview's
  // bottom bar, at its start, so the storyteller sees it at a glance; the
  // thumbnail carries no such mark.
  it("puts FOG OF WAR ACTIVE first in the bottom bar, and not on the thumbnail", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AttachmentPreview
        url="https://x.test/copy.webp"
        label="Harbour map"
        tags={["map"]}
        isCover={false}
        fogActive
      />,
    );
    expect(screen.queryByText("FOG OF WAR ACTIVE")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview Harbour map" }));
    const dialog = await screen.findByRole("dialog", { name: "Harbour map" });
    const pill = within(dialog).getByText("FOG OF WAR ACTIVE");
    const bar = pill.parentElement!;
    expect(bar.firstElementChild).toBe(pill);
    expect(within(bar).getByText("map")).toBeInTheDocument();
  });

  it("leaves the mark off a picture with no fog active", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AttachmentPreview
        url="https://x.test/map.png"
        label="Harbour map"
        tags={[]}
        isCover={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Preview Harbour map" }));
    await screen.findByRole("dialog", { name: "Harbour map" });
    expect(screen.queryByText("FOG OF WAR ACTIVE")).not.toBeInTheDocument();
  });

  it("shows the bar for the mark alone, with no tags and no controls", async () => {
    renderWithProviders(
      <AttachmentPreviewDialog
        open
        onOpenChange={() => {}}
        url="https://x.test/copy.webp"
        label="Harbour map"
        tags={[]}
        isCover={false}
        showTags={false}
        fogActive
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Harbour map" });
    expect(within(dialog).getByText("FOG OF WAR ACTIVE")).toBeInTheDocument();
    expect(within(dialog).queryByText("No tags")).not.toBeInTheDocument();
  });

  it("leaves the mark off with no tags, no controls and no fog active", async () => {
    renderWithProviders(
      <AttachmentPreviewDialog
        open
        onOpenChange={() => {}}
        url="https://x.test/map.png"
        label="Harbour map"
        tags={[]}
        isCover={false}
        showTags={false}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Harbour map" });
    expect(within(dialog).queryByText("FOG OF WAR ACTIVE")).not.toBeInTheDocument();
    // No empty bar under the picture either.
    expect(within(dialog).queryByTestId("preview-foot")).not.toBeInTheDocument();
  });

  // Where the storyteller can annotate the picture, the controls stand at
  // the bar's start, and their own fog switch says whether fog is on, so
  // the plain mark is left out.
  it("puts the controls first in the bar, before the tags, in place of the mark", async () => {
    renderWithProviders(
      <AttachmentPreviewDialog
        open
        onOpenChange={() => {}}
        url="https://x.test/copy.webp"
        label="Harbour map"
        tags={["map"]}
        isCover={false}
        fogActive
        actions={<button type="button">Fog switch</button>}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Harbour map" });
    const bar = within(dialog).getByTestId("preview-foot");
    const controls = within(bar).getByRole("button", { name: "Fog switch" });
    expect(bar.firstElementChild).toBe(controls);
    expect(
      controls.compareDocumentPosition(within(bar).getByText("map")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(dialog).queryByText("FOG OF WAR ACTIVE")).not.toBeInTheDocument();
  });
});

describe("AttachmentPreviewDialog", () => {
  // A dialog opened from the preview's controls, the annotator, is drawn in
  // a portal of its own but is still the preview's child to React, so its
  // keys bubble to the preview: the arrows there are the annotator's, not a
  // step through the list that would take the annotator away.
  it("steps through the list on the arrow keys pressed in the preview, not in a dialog over it", () => {
    const onStep = mock.fn((_direction: -1 | 1) => {});
    renderWithProviders(
      <AttachmentPreviewDialog
        open
        onOpenChange={() => {}}
        url="https://x.test/map.png"
        label="Harbour map"
        tags={[]}
        isCover={false}
        onStep={onStep}
        actions={
          <Portal>
            <button type="button">Over the preview</button>
          </Portal>
        }
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Over the preview" }), {
      key: "ArrowDown",
    });
    expect(onStep.mock.callCount()).toBe(0);

    fireEvent.keyDown(screen.getByRole("img", { name: "Harbour map" }), { key: "ArrowDown" });
    expect(onStep.mock.calls.map((call) => call.arguments[0])).toEqual([1]);
  });
});
