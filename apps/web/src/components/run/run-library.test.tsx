import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { Attachment } from "@/lib/attachments";
import type { ElementKind, StoryElement } from "@/lib/elements";
import type { PlayItem } from "@/lib/run";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
};

const attachment = (
  idAttachment: number,
  fileName: string,
  url: string | null = `https://x.test/${idAttachment}.png`,
): Attachment => ({
  idAttachment,
  kind: "STORY",
  idExternal: -4,
  status: url ? "READY" : "UPLOADING",
  url,
  isUploaded: true,
  fileName,
  isCover: false,
  // One tag on the second, for the preview's tag list.
  tags: idAttachment === 2 ? ["map"] : [],
});

// Twelve ready attachments and one still uploading, so the list has more
// than it shows and something it must leave out.
const attachments: Attachment[] = [
  ...Array.from({ length: 12 }, (_, i) => attachment(i + 1, `Handout ${i + 1}`)),
  attachment(99, "Half uploaded", null),
];

const people: StoryElement[] = [
  { idElement: 5, status: "ACTIVE", name: "Dafydd", title: "Shell seller", description: null },
  { idElement: 6, status: "ACTIVE", name: "Aldric", title: null, description: null },
];

// The scene's own attachments, apart from the story's.
const sceneAttachments: Attachment[] = [
  { ...attachment(70, "Docks map"), kind: "STORY_SCENE", idExternal: 15 },
];

const sa_listAttachments = mock.fn(async (kind: string, _id: number) =>
  kind === "STORY_SCENE" ? sceneAttachments : attachments,
);
const sa_searchAttachments = mock.fn(async (_kind: string, _id: number, _q: string) => [3, 7]);
const sa_createAttachment = mock.fn(async (_input: unknown) => ({
  idAttachment: 50,
  status: "READY",
}));
const sa_setAttachmentCover = mock.fn(async (_id: number, _isCover: boolean) => {});
const sa_setAttachmentTags = mock.fn(async (_id: number, _tags: string[]) => {});
const sa_listStoryElements = mock.fn(
  async (_id: number, kind: ElementKind, _offset: number, _q?: string) =>
    kind === "PERSON" ? people : [],
);

let RunLibrary: typeof import("./run-library").RunLibrary;

describe("RunLibrary", () => {
  before(async () => {
    // The + draws the attachments field's own link input and dropzone, which
    // brings the rest of the attachment actions and the router with it.
    mock.module("@/components/uploads/actions", {
      namedExports: {
        sa_listAttachments,
        sa_searchAttachments,
        sa_createAttachment,
        sa_deleteAttachment: mock.fn(),
        sa_markAttachmentError: mock.fn(),
        sa_markAttachmentReady: mock.fn(),
        sa_retryAttachment: mock.fn(),
        sa_setAttachmentCover,
        sa_setAttachmentTags,
      },
    });
    mock.module("next/navigation", {
      namedExports: { useRouter: () => ({ push: mock.fn(), refresh: mock.fn() }) },
    });
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_listStoryElements },
    });
    ({ RunLibrary } = await import("./run-library"));
  });

  beforeEach(() => {
    sa_listAttachments.mock.resetCalls();
    sa_searchAttachments.mock.resetCalls();
    sa_listStoryElements.mock.resetCalls();
    sa_createAttachment.mock.resetCalls();
    sa_setAttachmentCover.mock.resetCalls();
    sa_setAttachmentTags.mock.resetCalls();
  });

  const render = (onAdd: (item: PlayItem) => void = () => {}, idStoryScene: number | null = 15) =>
    renderWithProviders(
      <UserProvider user={user}>
        <RunLibrary idStory={-4} idStoryScene={idStoryScene} onAdd={onAdd} />
      </UserProvider>,
    );

  it("offers a search and a tab for attachments and each kind of element", () => {
    render();

    expect(screen.getByRole("searchbox", { name: "Search the library" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Attachments",
      "People",
      "Places",
      "Things",
      "Other",
      "Ephemera",
    ]);
    expect(screen.getByRole("tab", { name: "Attachments" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("lists the story's first ten ready attachments, each with a way into play", async () => {
    render();

    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");
    expect(
      within(panel).getAllByRole("button", { name: /^Add .* to the play space$/ }),
    ).toHaveLength(10);
    expect(within(panel).queryByText("Handout 11")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Half uploaded")).not.toBeInTheDocument();
    expect(sa_listAttachments.mock.calls[0].arguments).toEqual(["STORY", -4]);
  });

  it("opens an attachment's picture full size, with its tags, as the library page does", async () => {
    const user = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    await user.click(await within(panel).findByRole("button", { name: "Preview Handout 2" }));

    const preview = await screen.findByRole("dialog", { name: "Handout 2" });
    expect(within(preview).getByRole("img", { name: "Handout 2" })).toHaveAttribute(
      "src",
      "https://x.test/2.png",
    );
    expect(within(preview).getByRole("list", { name: "Tags" })).toHaveTextContent("map");
  });

  it("adds an attachment from its +, as the library page does, and lists it at once", async () => {
    const u = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");
    const plus = within(panel).getByRole("button", { name: "New attachment" });
    expect(plus).toHaveAttribute("aria-expanded", "false");
    expect(within(panel).queryByRole("textbox", { name: "Link" })).not.toBeInTheDocument();

    await u.click(plus);
    expect(plus).toHaveAttribute("aria-expanded", "true");
    await u.type(
      within(panel).getByRole("textbox", { name: "Link" }),
      "https://x.test/maps/harbour.png",
    );
    await u.click(within(panel).getByRole("button", { name: "Add link" }));

    expect(sa_createAttachment.mock.calls[0].arguments[0]).toEqual({
      kind: "STORY",
      idExternal: -4,
      url: "https://x.test/maps/harbour.png",
    });
    const added = await within(panel).findByRole("button", {
      name: "Add harbour.png to the play space",
    });
    // Newest first, as the library page lists them.
    expect(within(panel).getAllByRole("listitem")[0]).toContainElement(added);
  });

  it("lists the story's attachments, or switches to the scene's", async () => {
    const u = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");
    expect(within(panel).getByRole("radio", { name: "Story" })).toBeChecked();

    await u.click(within(panel).getByText("Scene"));

    expect(await within(panel).findByText("Docks map")).toBeInTheDocument();
    expect(within(panel).queryByText("Handout 1")).not.toBeInTheDocument();
    expect(within(panel).getByRole("radio", { name: "Scene" })).toBeChecked();
    expect(sa_listAttachments.mock.calls.at(-1)?.arguments).toEqual(["STORY_SCENE", 15]);

    // The search and the + follow the switch.
    await u.type(screen.getByRole("searchbox", { name: "Search the library" }), "map");
    await waitFor(() =>
      expect(sa_searchAttachments.mock.calls.at(-1)?.arguments).toEqual(["STORY_SCENE", 15, "map"]),
    );
    await u.click(within(panel).getByRole("button", { name: "New attachment" }));
    await u.type(within(panel).getByRole("textbox", { name: "Link" }), "https://x.test/tide.png");
    await u.click(within(panel).getByRole("button", { name: "Add link" }));
    expect(sa_createAttachment.mock.calls[0].arguments[0]).toEqual({
      kind: "STORY_SCENE",
      idExternal: 15,
      url: "https://x.test/tide.png",
    });
  });

  it("offers no scene to switch to when the table is on none", async () => {
    render(() => {}, null);
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    expect(within(panel).getByRole("radio", { name: "Scene" })).toBeDisabled();
  });

  it("tags an attachment and makes it the cover, with the controls its card has", async () => {
    const u = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");

    const cover = within(panel).getByRole("button", { name: "Cover Handout 2" });
    expect(cover).toHaveAttribute("aria-pressed", "false");
    await u.click(cover);
    await waitFor(() => expect(cover).toHaveAttribute("aria-pressed", "true"));
    expect(sa_setAttachmentCover.mock.calls[0].arguments).toEqual([2, true]);

    await u.click(within(panel).getByRole("button", { name: "Tags for Handout 2" }));
    const popover = await screen.findByRole("dialog", { name: "Tags" });
    // The popover moves focus onto itself as it opens; typing before it has
    // would lose every key after the first to that move.
    await waitFor(() => expect(popover).toHaveFocus());
    await u.type(within(popover).getByRole("textbox", { name: "New tag" }), "harbour{Enter}");

    await waitFor(() => expect(sa_setAttachmentTags.mock.callCount()).toBe(1));
    expect(sa_setAttachmentTags.mock.calls[0].arguments).toEqual([2, ["map", "harbour"]]);
    expect(within(popover).getByRole("list", { name: "Tags" })).toHaveTextContent("harbour");
  });

  it("edits the tags from the full-size preview too", async () => {
    const u = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    await u.click(await within(panel).findByRole("button", { name: "Preview Handout 2" }));
    const preview = await screen.findByRole("dialog", { name: "Handout 2" });
    await u.click(within(preview).getByRole("button", { name: "Tags for Handout 2" }));
    const popover = await screen.findByRole("dialog", { name: "Tags" });
    await waitFor(() => expect(popover).toHaveFocus());
    await u.type(within(popover).getByRole("textbox", { name: "New tag" }), "tide{Enter}");

    await waitFor(() => expect(sa_setAttachmentTags.mock.callCount()).toBe(1));
    expect(sa_setAttachmentTags.mock.calls[0].arguments).toEqual([2, ["map", "tide"]]);
    // The preview's own tag list follows.
    expect(within(preview).getAllByRole("list", { name: "Tags" })[0]).toHaveTextContent("tide");
  });

  it("narrows the attachments to what the search finds", async () => {
    const user = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");

    await user.type(screen.getByRole("searchbox", { name: "Search the library" }), "map");

    await waitFor(() => expect(within(panel).queryByText("Handout 1")).not.toBeInTheDocument());
    expect(sa_searchAttachments.mock.calls.at(-1)?.arguments).toEqual(["STORY", -4, "map"]);
    expect(within(panel).getByText("Handout 3")).toBeInTheDocument();
    expect(within(panel).getByText("Handout 7")).toBeInTheDocument();
  });

  it("lists a kind's elements when its tab is chosen, searching with what the box holds", async () => {
    const user = userEvent.setup();
    render();

    await user.type(screen.getByRole("searchbox", { name: "Search the library" }), "sea");
    await user.click(screen.getByRole("tab", { name: "People" }));

    const panel = await screen.findByRole("tabpanel", { name: "People" });
    expect(await within(panel).findByText("Dafydd")).toBeInTheDocument();
    expect(within(panel).getByText("Shell seller")).toBeInTheDocument();
    await waitFor(() =>
      expect(sa_listStoryElements.mock.calls.at(-1)?.arguments).toEqual([-4, "PERSON", 0, "sea"]),
    );
  });

  it("hands an item to the play space with its arrow", async () => {
    const user = userEvent.setup();
    const onAdd = mock.fn<(item: PlayItem) => void>();
    render(onAdd);

    await user.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    await user.click(
      await within(panel).findByRole("button", { name: "Add Dafydd to the play space" }),
    );

    expect(onAdd.mock.calls[0].arguments[0]).toEqual({
      key: "PERSON:5",
      kind: "PERSON",
      label: "Dafydd",
      detail: "Shell seller",
      imageUrl: null,
    });
  });

  it("says when a tab has nothing to show", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("tab", { name: "Places" }));

    const panel = await screen.findByRole("tabpanel", { name: "Places" });
    expect(await within(panel).findByText("Nothing here yet.")).toBeInTheDocument();
  });
});
