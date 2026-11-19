import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

const sa_searchAttachments = mock.fn(
  async (_kind: string, _idExternal: number, _needle: string): Promise<number[]> => [3, 5],
);

let StoryAttachments: typeof import("./story-attachments").StoryAttachments;

describe("StoryAttachments", () => {
  before(async () => {
    // The field uploads to Blob and has a test file of its own; here it only
    // has to show what it was told: the search's ids, the page size and
    // whether the cover is left out are the section's business.
    mock.module("@/components/uploads/attachment-list-field", {
      namedExports: {
        AttachmentListField: ({
          idExternal,
          showAdd,
          addId,
          shownIds,
          hideCovers,
          pageSize,
        }: {
          idExternal: number;
          showAdd: boolean;
          addId: string;
          shownIds: ReadonlySet<number> | null;
          hideCovers: boolean;
          pageSize?: number;
        }) => (
          <div id={showAdd ? addId : undefined}>
            Field for {idExternal}, {showAdd ? "adding" : "cards only"}, {pageSize} a page, covers{" "}
            {hideCovers ? "hidden" : "shown"}, showing{" "}
            {shownIds === null ? "all" : [...shownIds].join(",")}
          </div>
        ),
      },
    });
    mock.module("@/components/uploads/actions", { namedExports: { sa_searchAttachments } });
    ({ StoryAttachments } = await import("./story-attachments"));
  });

  beforeEach(() => {
    sa_searchAttachments.mock.resetCalls();
  });

  it("draws the cards ten a page with the cover among them, narrows them by the search box, and leaves the cover out when its pill is off", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryAttachments idStory={-15} onImage={false} />);

    expect(
      screen.getByText("Field for -15, cards only, 10 a page, covers shown, showing all"),
    ).toBeInTheDocument();

    // The search goes to the database, as the board's column does.
    await user.type(screen.getByRole("searchbox", { name: "Search Attachments" }), "map");
    await waitFor(() => expect(sa_searchAttachments.mock.callCount()).toBe(1));
    expect(sa_searchAttachments.mock.calls[0].arguments).toEqual(["STORY", -15, "map"]);
    expect(
      await screen.findByText("Field for -15, cards only, 10 a page, covers shown, showing 3,5"),
    ).toBeInTheDocument();

    const covers = screen.getByRole("button", { name: "Covers" });
    expect(covers).toHaveAttribute("aria-pressed", "true");
    await user.click(covers);
    expect(
      screen.getByText("Field for -15, cards only, 10 a page, covers hidden, showing 3,5"),
    ).toBeInTheDocument();
  });

  it("opens on the cards, and the + shows and hides the adding controls", async () => {
    const user = userEvent.setup();

    renderWithProviders(<StoryAttachments idStory={-15} onImage={false} />);
    expect(screen.getByRole("region", { name: "Attachments" })).toBeInTheDocument();
    expect(screen.getByText(/Field for -15, cards only/)).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Add Attachments" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Field for -15, adding/)).toBeInTheDocument();
    // aria-controls names the block the field draws when adding.
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toHaveTextContent(
      "adding",
    );

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/Field for -15, cards only/)).toBeInTheDocument();
  });
});
