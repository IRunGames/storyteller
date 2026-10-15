import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { Attachment } from "@/lib/attachments";

const STORY = -15;
const SCENE = 7;

const attachment = (id: number, values: Partial<Attachment> = {}): Attachment => ({
  idAttachment: id,
  idStory: STORY,
  kind: "STORY",
  idExternal: STORY,
  idAttachmentUse: null,
  status: "READY",
  url: `https://example.com/${id}.jpg`,
  isUploaded: false,
  fileName: `picture-${id}.jpg`,
  isCover: false,
  tags: [],
  ...values,
});

// The story's attachments: three that can be attached, its cover among
// them, and one still uploading, which has no business being offered.
const storyRows = [
  attachment(1, { fileName: "map-of-the-dun.jpg" }),
  attachment(2, { fileName: "the-wizard.jpg" }),
  attachment(3, { fileName: "cover.jpg", isCover: true }),
  attachment(4, { fileName: "half-sent.jpg", status: "UPLOADING", url: null }),
];

const sa_listAttachments = mock.fn(async () => storyRows);
// The search answers as attachments.search_text would: by file name here.
const sa_searchAttachments = mock.fn(async (_kind: string, _id: number, query: string) =>
  storyRows.filter((row) => row.fileName?.includes(query)).map((row) => row.idAttachment),
);
const sa_attachToHolder = mock.fn(
  async (
    _kind: string,
    _holder: number,
    ids: number[],
  ): Promise<{ ok: true; attached: number[] } | { ok: false; error: string }> => ({
    ok: true,
    attached: ids,
  }),
);

let StoryAttachmentPicker: typeof import("./story-attachment-picker").StoryAttachmentPicker;

async function openFold(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Add from the story's attachments/ }));
}

describe("StoryAttachmentPicker", () => {
  before(async () => {
    mock.module("./actions", {
      namedExports: {
        sa_listAttachments,
        sa_searchAttachments,
        sa_attachToHolder,
      },
    });
    ({ StoryAttachmentPicker } = await import("./story-attachment-picker"));
  });

  beforeEach(() => {
    sa_listAttachments.mock.resetCalls();
    sa_searchAttachments.mock.resetCalls();
    sa_attachToHolder.mock.resetCalls();
    sa_attachToHolder.mock.mockImplementation(async (_kind, _holder, ids) => ({
      ok: true,
      attached: ids,
    }));
  });

  it("starts closed and fetches nothing until it is opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryAttachmentPicker idStory={STORY} holder={{ kind: "STORY_SCENE", idExternal: SCENE }} />,
    );

    expect(sa_listAttachments.mock.callCount()).toBe(0);
    await openFold(user);
    await waitFor(() => expect(sa_listAttachments.mock.callCount()).toBe(1));
    expect(sa_listAttachments.mock.calls[0].arguments).toEqual(["STORY", STORY]);
  });

  it("offers the story's finished attachments, its cover among them", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryAttachmentPicker idStory={STORY} holder={{ kind: "STORY_SCENE", idExternal: SCENE }} />,
    );
    await openFold(user);

    expect(await screen.findByRole("checkbox", { name: "map-of-the-dun.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "the-wizard.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "cover.jpg" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "half-sent.jpg" })).not.toBeInTheDocument();
  });

  it("narrows the list by what the search box holds, asking the database", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StoryAttachmentPicker idStory={STORY} holder={{ kind: "STORY_SCENE", idExternal: SCENE }} />,
    );
    await openFold(user);
    await screen.findByRole("checkbox", { name: "map-of-the-dun.jpg" });

    await user.type(
      screen.getByRole("searchbox", { name: "Search the story's attachments" }),
      "wiz",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("checkbox", { name: "map-of-the-dun.jpg" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("checkbox", { name: "the-wizard.jpg" })).toBeInTheDocument();
    expect(sa_searchAttachments.mock.calls.at(-1)?.arguments).toEqual(["STORY", STORY, "wiz"]);
  });

  it("attaches every ticked attachment to the scene, then drops them from the list", async () => {
    const user = userEvent.setup();
    const attached: number[][] = [];
    renderWithProviders(
      <StoryAttachmentPicker
        idStory={STORY}
        holder={{ kind: "STORY_SCENE", idExternal: SCENE }}
        onAttached={(ids) => attached.push(ids)}
      />,
    );
    await openFold(user);

    const add = await screen.findByRole("button", { name: "Add to this scene" });
    expect(add).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "map-of-the-dun.jpg" }));
    await user.click(screen.getByRole("checkbox", { name: "the-wizard.jpg" }));
    await user.click(screen.getByRole("button", { name: "Add 2 to this scene" }));

    await waitFor(() => expect(sa_attachToHolder.mock.callCount()).toBe(1));
    expect(sa_attachToHolder.mock.calls[0].arguments).toEqual(["STORY_SCENE", SCENE, [1, 2]]);
    expect(await screen.findByRole("status")).toHaveTextContent("Added 2 to this scene.");
    expect(attached).toEqual([[1, 2]]);
    // The cover is still on offer.
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("says why when the scene has no room, and attaches nothing", async () => {
    sa_attachToHolder.mock.mockImplementation(async () => ({
      ok: false,
      error: "This scene has room for 1 more. Choose fewer.",
    }));
    const user = userEvent.setup();
    renderWithProviders(
      <StoryAttachmentPicker idStory={STORY} holder={{ kind: "STORY_SCENE", idExternal: SCENE }} />,
    );
    await openFold(user);

    await user.click(await screen.findByRole("checkbox", { name: "map-of-the-dun.jpg" }));
    await user.click(screen.getByRole("checkbox", { name: "the-wizard.jpg" }));
    await user.click(screen.getByRole("button", { name: "Add 2 to this scene" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("room for 1 more");
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("checkbox")).toHaveLength(3);
  });
});
