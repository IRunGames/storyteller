import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { fireEvent, screen } from "@testing-library/react";
import { Portal } from "@chakra-ui/react";

import { renderWithProviders } from "@/test/render";
import { AttachmentPreviewDialog } from "./attachment-preview";

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
