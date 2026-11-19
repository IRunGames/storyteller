import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import userEvent from "@testing-library/user-event";

import type { StoryElement } from "@/lib/elements";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";

// The element rows' pictures: a cover pill beside the status, which opens the
// cover full size, and a count of the element's other pictures.

const copy = "https://abc.public.blob.vercel-storage.com/annotations/1/copy.webp";
const zed: StoryElement = {
  idElement: 5,
  status: "READY",
  name: "Zed",
  title: null,
  description: null,
  coverUrl: copy,
  otherPictures: 2,
};
const plain: StoryElement = {
  idElement: 6,
  status: "READY",
  name: "Abbey",
  title: null,
  description: null,
  coverUrl: null,
  otherPictures: 0,
};

let PrepElements: typeof import("./prep-elements").PrepElements;

describe("PrepElements", () => {
  before(async () => {
    mock.module("@/components/prep/actions", {
      namedExports: { sa_listStoryElements: async () => [] },
    });
    mock.module("@/components/status/actions", {
      namedExports: {
        sa_listStatusOptions: async () => [],
        sa_setRowStatus: async () => ({ ok: true, status: "READY" }),
      },
    });
    ({ PrepElements } = await import("./prep-elements"));
  });

  function render(elements: StoryElement[]) {
    renderWithProviders(
      <PrepElements
        idStory={7}
        kind="PERSON"
        initial={elements}
        filter=""
        shownStatuses={["READY"]}
        statusOptions={[{ key: "READY", label: "Ready", description: null, from: null }]}
        canEdit
      />,
    );
    return screen.getAllByRole("listitem");
  }

  it("puts a cover pill beside the status, which opens the cover full size", async () => {
    const user = userEvent.setup();
    const [row] = render([zed]);
    const pill = within(row).getByRole("button", { name: "Preview Zed's cover" });
    expect(pill.querySelector("img")).toHaveAttribute("src", copy);

    await user.click(pill);
    const preview = await screen.findByRole("dialog", { name: "Zed" });
    expect(within(preview).getByRole("img", { name: "Zed" })).toHaveAttribute("src", copy);
  });

  it("counts the element's other pictures after it, saying so in a tooltip", async () => {
    const user = userEvent.setup();
    const [row] = render([zed]);
    const count = within(row).getByRole("img", { name: "2 other pictures" });
    expect(count).toHaveTextContent("2");
    await user.hover(count);
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("2 other pictures"));
  });

  it("shows neither for an element with no pictures", () => {
    const [row] = render([plain]);
    expect(within(row).queryByRole("button", { name: /cover/ })).toBeNull();
    expect(within(row).queryByRole("img", { name: /other picture/ })).toBeNull();
  });

  it("names one other picture as one", () => {
    const [row] = render([{ ...zed, otherPictures: 1 }]);
    expect(within(row).getByRole("img", { name: "1 other picture" })).toBeInTheDocument();
  });
});
