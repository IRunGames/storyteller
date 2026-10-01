import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";

// The ids attachments.search_text would match, answered by hand.
const sa_searchAttachments = mock.fn<
  (kind: string, idExternal: number, query: string) => Promise<number[]>
>(async () => [8]);

// What the field was last told, drawn as text so a test can read it.
type FieldProps = { shownIds: ReadonlySet<number> | null; hideCovers: boolean; showAdd: boolean };

let PrepAttachments: typeof import("./prep-attachments").PrepAttachments;

describe("PrepAttachments", () => {
  before(async () => {
    mock.module("@/components/uploads/actions", { namedExports: { sa_searchAttachments } });
    // The field loads and draws the cards and has a test file of its own.
    mock.module("@/components/uploads/attachment-list-field", {
      namedExports: {
        AttachmentListField: ({ shownIds, hideCovers, showAdd }: FieldProps) => (
          <p data-testid="field">
            {shownIds === null ? "all" : [...shownIds].join(",")} /{" "}
            {hideCovers ? "no covers" : "covers"} / {showAdd ? "adding" : "cards only"}
          </p>
        ),
      },
    });
    ({ PrepAttachments } = await import("./prep-attachments"));
  });

  beforeEach(() => {
    sa_searchAttachments.mock.resetCalls();
  });

  it("shows every card, covers included, without the adding controls, until searched", () => {
    renderWithProviders(<PrepAttachments idStory={-1} filter="" showCovers showAdd={false} />);

    expect(screen.getByTestId("field")).toHaveTextContent("all / covers / cards only");
    expect(sa_searchAttachments.mock.callCount()).toBe(0);
  });

  it("asks the database which attachments match the search box, and shows only those", async () => {
    const { rerender } = renderWithProviders(
      <PrepAttachments idStory={-1} filter="" showCovers showAdd={false} />,
    );
    rerender(<PrepAttachments idStory={-1} filter=" map " showCovers showAdd={false} />);

    await waitFor(() => expect(screen.getByTestId("field")).toHaveTextContent("8 / covers"));
    expect(sa_searchAttachments.mock.calls[0].arguments).toEqual(["STORY", -1, "map"]);

    // Cleared, everything comes back without another question.
    rerender(<PrepAttachments idStory={-1} filter="" showCovers showAdd={false} />);
    await waitFor(() => expect(screen.getByTestId("field")).toHaveTextContent("all /"));
    expect(sa_searchAttachments.mock.callCount()).toBe(1);
  });

  it("opens the adding controls when the column's + asks", () => {
    renderWithProviders(<PrepAttachments idStory={-1} filter="" showCovers showAdd />);

    expect(screen.getByTestId("field")).toHaveTextContent("adding");
  });

  it("leaves the cover out when the board's Covers pill is off", () => {
    renderWithProviders(
      <PrepAttachments idStory={-1} filter="" showCovers={false} showAdd={false} />,
    );

    expect(screen.getByTestId("field")).toHaveTextContent("no covers");
  });
});
