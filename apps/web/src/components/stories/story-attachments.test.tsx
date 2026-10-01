import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

let StoryAttachments: typeof import("./story-attachments").StoryAttachments;

describe("StoryAttachments", () => {
  before(async () => {
    // The field uploads to Blob and has a test file of its own; here it only
    // has to show what it was told.
    mock.module("@/components/uploads/attachment-list-field", {
      namedExports: {
        AttachmentListField: ({
          idExternal,
          showAdd,
          addId,
        }: {
          idExternal: number;
          showAdd: boolean;
          addId: string;
        }) => (
          <div id={showAdd ? addId : undefined}>
            Field for {idExternal}, {showAdd ? "adding" : "cards only"}
          </div>
        ),
      },
    });
    ({ StoryAttachments } = await import("./story-attachments"));
  });

  it("opens on the cards, and the chevron toggle shows and hides the adding controls", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryAttachments idStory={-15} onImage={false} />);
    expect(screen.getByRole("region", { name: "Attachments" })).toBeInTheDocument();
    expect(screen.getByText("Field for -15, cards only")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Add Attachments" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Field for -15, adding")).toBeInTheDocument();
    // aria-controls names the block the field draws when adding.
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toHaveTextContent(
      "adding",
    );

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Field for -15, cards only")).toBeInTheDocument();
  });
});
