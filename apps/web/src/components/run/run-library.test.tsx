import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { useState, type ComponentProps } from "react";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { Attachment } from "@/lib/attachments";
import type { ElementKind, ElementSort, StoryElement } from "@/lib/elements";
import type { AttachmentSort, ElementDetail, PlayItem, RunLibrarySource } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { UserProvider } from "@/components/auth/user-provider";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { CurrentUser } from "@/lib/current-user";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -1,
};

const attachment = (
  idAttachment: number,
  fileName: string,
  url: string | null = `https://x.test/${idAttachment}.png`,
): Attachment => ({
  idAttachment,
  idStory: -4,
  kind: "STORY",
  idExternal: -4,
  idAttachmentUse: null,
  status: url ? "READY" : "UPLOADING",
  url,
  isUploaded: true,
  fileName,
  // The fifth is the story's cover, which the library leaves out.
  isCover: idAttachment === 5,
  // One tag on the second, for the preview's tag list.
  tags: idAttachment === 2 ? ["map"] : [],
  // Added a day apart in id order, the half-uploaded one last, for the
  // Created sort; no updated stamp, so the Updated sort keeps the order the
  // server listed them in.
  createdAt: `2026-09-${String(Math.min(idAttachment, 30)).padStart(2, "0")}T00:00:00.000Z`,
  updatedAt: null,
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
  { ...attachment(70, "Docks map"), kind: "STORY_SCENE", idExternal: 15, createdAt: null },
  {
    ...attachment(71, "Tide chart"),
    kind: "STORY_SCENE",
    idExternal: 15,
    isCover: true,
    createdAt: null,
  },
];

// A file attached to the scene stays in the story's list: it is the story's.
// An element's link has no pictures of its own here.
const sa_listAttachments = mock.fn(async (kind: string, _id: number) =>
  kind === "STORY_SCENE" ? sceneAttachments : kind === "STORY" ? attachments : [],
);
const sa_attachAsCover = mock.fn(async (_kind: string, _holder: number, id: number) => ({
  ok: true as const,
  url: `https://x.test/${id}.png`,
}));
const onSceneCoverChange = mock.fn((_url: string | null) => {});
const sa_attachToHolder = mock.fn(async (_kind: string, _holder: number, ids: number[]) => ({
  ok: true as const,
  attached: ids,
}));
const sa_detachFromHolder = mock.fn(async (_kind: string, _holder: number, ids: number[]) => ({
  ok: true as const,
  detached: ids,
}));
const sa_searchAttachments = mock.fn(async (_kind: string, _id: number, _q: string) => [3, 7]);
const sa_deleteAttachment = mock.fn(async (_id: number) => {});
const sa_createAttachment = mock.fn(async (_input: unknown) => ({
  idAttachment: 50,
  status: "READY",
}));
const sa_setAttachmentCover = mock.fn(
  async (_kind: string, _idExternal: number, _id: number, _isCover: boolean) => {},
);
const sa_setAttachmentTags = mock.fn(async (_id: number, _tags: string[]) => {});
const sa_listStoryElements = mock.fn(
  async (_id: number, kind: ElementKind, _offset: number, _q?: string) =>
    kind === "PERSON" ? people : [],
);

const dafydd: ElementDetail = {
  idElement: 5,
  kind: "PERSON",
  name: "Dafydd",
  initialName: "A hooded figure",
  title: "Shell seller",
  description: "Sells shells.\nKnows the tides.",
  notes: null,
  imageUrl: null,
  status: "ACTIVE",
  tags: ["harbour"],
  url: null,
  urlText: null,
};
// Dafydd is in scene 15, the one the table is on by default.
const sa_getElementDetail = mock.fn(
  async (_story: number, idElement: number, idStoryScene: number | null) =>
    idElement === 5
      ? {
          element: dafydd,
          link:
            idStoryScene === 15
              ? {
                  idSceneElement: 9,
                  status: "READY",
                  tags: ["scene"],
                  showInfo: true,
                  createdAt: null,
                }
              : null,
        }
      : null,
);
const sa_unlinkSceneElement = mock.fn(async (_story: number, _scene: number, _element: number) => ({
  ok: true as const,
}));
const onRemovedFromScene = mock.fn((_idElement: number) => {});
const onImageChange = mock.fn((_idElement: number, _imageUrl: string | null) => {});
const onElementEdited = mock.fn((_element: ElementDetail) => {});
const sa_updateStoryElement = mock.fn(
  async (_story: number, _element: number, values: Record<string, string>) => ({
    ok: true as const,
    element: { ...dafydd, name: values.name, title: values.title || null },
  }),
);
const sa_setElementImage = mock.fn(
  async (_story: number, _element: number, idAttachment: number | null) => ({
    ok: true as const,
    imageUrl: idAttachment === null ? null : `https://x.test/${idAttachment}.png`,
  }),
);
// Scene only: of the people, only Dafydd is in the scene.
const sa_listSceneLibraryElements = mock.fn(
  async (_story: number, _scene: number, kind: ElementKind, _q?: string) =>
    kind === "PERSON" ? people.slice(0, 1) : [],
);
const sa_listStatusOptions = mock.fn(async (_table: string): Promise<StatusOption[]> =>
  ["ACTIVE", "INACTIVE"].map((key) => ({ key, label: key, description: null, from: null })),
);

let RunLibrary: typeof import("./run-library").RunLibrary;
let UserPreferencesProvider: typeof import("@/components/preferences/user-preferences-provider").UserPreferencesProvider;

describe("RunLibrary", () => {
  before(async () => {
    // The + draws the attachments field's own link input and dropzone, which
    // brings the rest of the attachment actions and the router with it.
    mock.module("@/components/uploads/actions", {
      namedExports: {
        sa_listAttachments,
        sa_searchAttachments,
        sa_createAttachment,
        sa_deleteAttachment,
        sa_markAttachmentError: mock.fn(),
        sa_markAttachmentReady: mock.fn(),
        sa_retryAttachment: mock.fn(),
        sa_setAttachmentCover,
        sa_setAttachmentTags,
        sa_attachAsCover,
        sa_attachToHolder,
        sa_detachFromHolder,
      },
    });
    mock.module("next/navigation", {
      namedExports: { useRouter: () => ({ push: mock.fn(), refresh: mock.fn() }) },
    });
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_listStoryElements },
    });
    // An element's info button asks for the element and its workflow.
    mock.module("@/components/elements/actions", {
      namedExports: { sa_listElementHistory: mock.fn(async () => ({ rows: [], hasMore: false })) },
    });
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: {
        sa_setElementTags: mock.fn(),
        sa_getElementDetail,
        sa_setElementImage,
        sa_updateStoryElement,
        sa_updateSceneElement: mock.fn(),
        sa_moveSceneElement: mock.fn(),
        sa_unlinkSceneElement,
        sa_listSceneLibraryElements,
        sa_createSceneElement: mock.fn(),
      },
    });
    // An element tab's + reads the Add as invisible preference.
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference: mock.fn() },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions, sa_setRowStatus: mock.fn() },
    });
    ({ RunLibrary } = await import("./run-library"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    sa_listAttachments.mock.resetCalls();
    sa_deleteAttachment.mock.resetCalls();
    sa_searchAttachments.mock.resetCalls();
    sa_listStoryElements.mock.resetCalls();
    sa_getElementDetail.mock.resetCalls();
    sa_unlinkSceneElement.mock.resetCalls();
    sa_setElementImage.mock.resetCalls();
    sa_updateStoryElement.mock.resetCalls();
    onElementEdited.mock.resetCalls();
    onImageChange.mock.resetCalls();
    sa_listSceneLibraryElements.mock.resetCalls();
    onRemovedFromScene.mock.resetCalls();
    sa_createAttachment.mock.resetCalls();
    sa_setAttachmentCover.mock.resetCalls();
    sa_setAttachmentTags.mock.resetCalls();
    sa_attachAsCover.mock.resetCalls();
    sa_attachToHolder.mock.resetCalls();
    sa_detachFromHolder.mock.resetCalls();
    onSceneCoverChange.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  // The table holds the tab, for the sort menu beside its heading; this
  // stands in for it.
  function Harness(props: Omit<ComponentProps<typeof RunLibrary>, "tab" | "onTabChange">) {
    const [tab, setTab] = useState<RunLibrarySource>("ATTACHMENT");
    return <RunLibrary {...props} tab={tab} onTabChange={setTab} />;
  }

  const library = (
    onAdd: (item: PlayItem) => void = () => {},
    idStoryScene: number | null = 15,
    sceneOnly = false,
    locked = false,
    attachmentSort: AttachmentSort = "updated",
    elementSort: ElementSort = "name",
  ) => (
    <UserProvider user={user}>
      <UserPreferencesProvider preferences={{}}>
        <Harness
          idStory={-4}
          idStoryScene={idStoryScene}
          attachmentSort={attachmentSort}
          elementSort={elementSort}
          sceneOnly={sceneOnly}
          onAdd={onAdd}
          onRemovedFromScene={onRemovedFromScene}
          onImageChange={onImageChange}
          onElementEdited={onElementEdited}
          onItemChange={() => {}}
          onSceneStatusChange={() => {}}
          onSceneCoverChange={onSceneCoverChange}
          onCreated={() => {}}
          stackTag={null}
          sceneStacks={["elements", "scene"]}
          locked={locked}
        />
      </UserPreferencesProvider>
      <Toaster />
    </UserProvider>
  );
  const render = (...args: Parameters<typeof library>) => renderWithProviders(library(...args));

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

  it("lists the story's first ten ready attachments but its cover, each with an arrow to the scene", async () => {
    render();

    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");
    expect(within(panel).getAllByRole("button", { name: /^Attach .* to the scene$/ })).toHaveLength(
      10,
    );
    expect(within(panel).queryByText("Handout 5")).not.toBeInTheDocument();
    expect(within(panel).getByText("Handout 11")).toBeInTheDocument();
    expect(within(panel).queryByText("Handout 12")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Half uploaded")).not.toBeInTheDocument();
    expect(sa_listAttachments.mock.calls[0].arguments).toEqual(["STORY", -4]);
  });

  it("offers a failed upload a delete button, and nothing else that would act on it", async () => {
    const user = userEvent.setup();
    const failed: Attachment = { ...attachment(98, "Broken upload", null), status: "ERROR" };
    sa_listAttachments.mock.mockImplementation(async (kind: string) =>
      kind === "STORY" ? [failed, ...attachments] : kind === "STORY_SCENE" ? sceneAttachments : [],
    );
    try {
      render();

      const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
      const row = (await within(panel).findByText("Broken upload")).closest("li")!;
      expect(within(row).queryByRole("button", { name: /to the scene$/ })).not.toBeInTheDocument();
      // A ready attachment has no delete button here.
      const ready = within(panel).getByText("Handout 1").closest("li")!;
      expect(within(ready).queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();

      await user.click(within(row).getByRole("button", { name: "Delete Broken upload" }));
      await waitFor(() => expect(sa_deleteAttachment.mock.calls[0]?.arguments).toEqual([98]));
      expect(within(panel).queryByText("Broken upload")).not.toBeInTheDocument();
    } finally {
      sa_listAttachments.mock.mockImplementation(async (kind: string) =>
        kind === "STORY_SCENE" ? sceneAttachments : kind === "STORY" ? attachments : [],
      );
    }
  });

  it("sorts the attachments as the table asks before taking the first ten", async () => {
    render(() => {}, 15, false, false, "created");

    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 12");
    const labels = within(panel)
      .getAllByRole("listitem")
      .map((item) => within(item).getByText(/^(Handout|Half)/).textContent);
    // Newest first: the one still uploading, then twelve down to three, the
    // cover (five) left out as ever.
    expect(labels).toEqual([
      "Half uploaded",
      "Handout 12",
      "Handout 11",
      "Handout 10",
      "Handout 9",
      "Handout 8",
      "Handout 7",
      "Handout 6",
      "Handout 4",
      "Handout 3",
    ]);
  });

  it("asks for an element tab in the sort the table holds, for the story's and the scene's", async () => {
    const user = userEvent.setup();
    const { unmount } = render(() => {}, 15, false, false, "updated", "title");

    await user.click(screen.getByRole("tab", { name: "People" }));
    await waitFor(() =>
      expect(sa_listStoryElements.mock.calls.at(-1)?.arguments).toEqual([
        -4,
        "PERSON",
        0,
        "",
        undefined,
        "title",
      ]),
    );
    unmount();

    render(() => {}, 15, true, false, "updated", "title");
    await user.click(screen.getByRole("tab", { name: "People" }));
    await waitFor(() =>
      expect(sa_listSceneLibraryElements.mock.calls.at(-1)?.arguments).toEqual([
        -4,
        15,
        "PERSON",
        "",
        "title",
      ]),
    );
  });

  it("names the previewed file at the top, and moves through the pictures with the arrow keys", async () => {
    const user = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    await user.click(await within(panel).findByRole("button", { name: "Preview Handout 2" }));
    let preview = await screen.findByRole("dialog", { name: "Handout 2" });
    expect(within(preview).getByRole("heading")).toHaveTextContent("Handout 2");
    // The dialog reads the arrow keys on its content, and moves focus into
    // itself a beat after it appears. A key pressed before then goes to the
    // Preview button still focused behind it and does nothing, so wait.
    await waitFor(() => expect(preview).toContainElement(document.activeElement as HTMLElement));

    // Down to the next picture, and on; the cover (five) is not in the
    // list, so four is followed by six.
    await user.keyboard("{ArrowDown}");
    preview = await screen.findByRole("dialog", { name: "Handout 3" });
    expect(within(preview).getByRole("img", { name: "Handout 3" })).toHaveAttribute(
      "src",
      "https://x.test/3.png",
    );
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await screen.findByRole("dialog", { name: "Handout 6" });

    // Back up, and no further than the first.
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}");
    preview = await screen.findByRole("dialog", { name: "Handout 1" });
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("dialog", { name: "Handout 1" })).toBe(preview);

    await user.click(within(preview).getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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
    // The + floats at the foot of the tab, outside the list that scrolls.
    const plus = screen.getByRole("button", { name: "New attachment" });
    expect(plus).toHaveAttribute("aria-expanded", "false");
    expect(within(panel).queryByRole("textbox", { name: "Link" })).not.toBeInTheDocument();

    await u.click(plus);
    expect(plus).toHaveAttribute("aria-expanded", "true");
    // Open, the + is a close button, and closes what it opened.
    expect(plus).toHaveAccessibleName("Close");
    expect(screen.queryByRole("button", { name: "New attachment" })).not.toBeInTheDocument();
    await u.click(plus);
    expect(within(panel).queryByRole("textbox", { name: "Link" })).not.toBeInTheDocument();
    expect(plus).toHaveAccessibleName("New attachment");
    await u.click(plus);
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
      name: "Attach harbour.png to the scene",
    });
    // Newest first, as the library page lists them.
    expect(within(panel).getAllByRole("listitem")[0]).toContainElement(added);
  });

  it("lists the story's attachments with All, and the scene's with Scene only", async () => {
    const u = userEvent.setup();
    const { rerender } = render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");
    // The library's own switch decides; the tab has none of its own.
    expect(within(panel).queryByRole("radio")).not.toBeInTheDocument();

    rerender(library(() => {}, 15, true));

    expect(await within(panel).findByText("Docks map")).toBeInTheDocument();
    expect(within(panel).queryByText("Handout 1")).not.toBeInTheDocument();
    expect(sa_listAttachments.mock.calls.at(-1)?.arguments).toEqual(["STORY_SCENE", 15]);

    // The search and the + follow the switch.
    await u.type(screen.getByRole("searchbox", { name: "Search the library" }), "map");
    await waitFor(() =>
      expect(sa_searchAttachments.mock.calls.at(-1)?.arguments).toEqual(["STORY_SCENE", 15, "map"]),
    );
    await u.click(screen.getByRole("button", { name: "New attachment" }));
    await u.type(within(panel).getByRole("textbox", { name: "Link" }), "https://x.test/tide.png");
    await u.click(within(panel).getByRole("button", { name: "Add link" }));
    expect(sa_createAttachment.mock.calls[0].arguments[0]).toEqual({
      kind: "STORY_SCENE",
      idExternal: 15,
      url: "https://x.test/tide.png",
    });
  });

  it("lists the story's attachments with Scene only but no scene at the table", async () => {
    render(() => {}, null, true);
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    expect(await within(panel).findByText("Handout 1")).toBeInTheDocument();
    expect(sa_listAttachments.mock.calls.at(-1)?.arguments).toEqual(["STORY", -4]);
  });

  it("tags an attachment and makes it the story's cover, with the controls its card has", async () => {
    const u = userEvent.setup();
    // With no scene at the table, Cover is the card's own toggle.
    render(() => {}, null);
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");

    await u.click(within(panel).getByRole("button", { name: "Tags for Handout 2" }));
    const popover = await screen.findByRole("dialog", { name: "Tags" });
    // The popover moves focus onto itself as it opens; typing before it has
    // would lose every key after the first to that move.
    await waitFor(() => expect(popover).toHaveFocus());
    await u.type(within(popover).getByRole("textbox", { name: "New tag" }), "harbour{Enter}");

    await waitFor(() => expect(sa_setAttachmentTags.mock.callCount()).toBe(1));
    expect(sa_setAttachmentTags.mock.calls[0].arguments).toEqual([2, ["map", "harbour"]]);
    expect(within(popover).getByRole("list", { name: "Tags" })).toHaveTextContent("harbour");
    await u.keyboard("{Escape}");

    const cover = within(panel).getByRole("button", { name: "Cover Handout 2" });
    expect(cover).toHaveAttribute("aria-pressed", "false");
    await u.click(cover);
    expect(sa_setAttachmentCover.mock.calls[0].arguments).toEqual(["STORY", -4, 2, true]);
    // The story's cover is not listed, so it leaves the list.
    await waitFor(() => expect(within(panel).queryByText("Handout 2")).not.toBeInTheDocument());
  });

  it("attaches a story attachment to the scene as its cover while the table is on one", async () => {
    const u = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    await u.click(await within(panel).findByRole("button", { name: "Cover Handout 2" }));

    await waitFor(() => expect(sa_attachAsCover.mock.callCount()).toBe(1));
    expect(sa_attachAsCover.mock.calls[0].arguments).toEqual(["STORY_SCENE", 15, 2]);
    expect(sa_setAttachmentCover.mock.callCount()).toBe(0);
    expect(onSceneCoverChange.mock.calls[0].arguments).toEqual(["https://x.test/2.png"]);
    expect(await screen.findByText("Attached to the scene as its cover")).toBeInTheDocument();
    // Still the story's, so still in the story's list once it has reloaded.
    await waitFor(() => expect(sa_listAttachments.mock.callCount()).toBeGreaterThan(1));
    expect(await within(panel).findByText("Handout 2")).toBeInTheDocument();
  });

  it("makes one of the scene's own attachments its cover, and tells the play space", async () => {
    const u = userEvent.setup();
    render(() => {}, 15, true);
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    await u.click(await within(panel).findByRole("button", { name: "Cover Docks map" }));

    await waitFor(() => expect(onSceneCoverChange.mock.callCount()).toBe(1));
    expect(sa_setAttachmentCover.mock.calls[0].arguments).toEqual(["STORY_SCENE", 15, 70, true]);
    expect(onSceneCoverChange.mock.calls[0].arguments).toEqual(["https://x.test/70.png"]);
    expect(sa_attachAsCover.mock.callCount()).toBe(0);
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
      expect(sa_listStoryElements.mock.calls.at(-1)?.arguments).toEqual([
        -4,
        "PERSON",
        0,
        "sea",
        undefined,
        "name",
      ]),
    );
  });

  it("attaches a story attachment to the scene with its arrow, keeping it in the list", async () => {
    const u = userEvent.setup();
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    await u.click(
      await within(panel).findByRole("button", { name: "Attach Handout 3 to the scene" }),
    );

    expect(sa_attachToHolder.mock.calls[0].arguments).toEqual(["STORY_SCENE", 15, [3]]);
    await waitFor(() => expect(sa_listAttachments.mock.callCount()).toBeGreaterThan(1));
    expect(await within(panel).findByText("Handout 3")).toBeInTheDocument();
    expect(onSceneCoverChange.mock.callCount()).toBe(0);
  });

  it("detaches a scene attachment, its cover leaving the play space", async () => {
    const u = userEvent.setup();
    render(() => {}, 15, true);
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });

    await u.click(
      await within(panel).findByRole("button", { name: "Detach Docks map from the scene" }),
    );
    await waitFor(() => expect(sa_detachFromHolder.mock.callCount()).toBe(1));
    expect(sa_detachFromHolder.mock.calls[0].arguments).toEqual(["STORY_SCENE", 15, [70]]);
    expect(onSceneCoverChange.mock.callCount()).toBe(0);

    await u.click(
      await within(panel).findByRole("button", { name: "Detach Tide chart from the scene" }),
    );
    await waitFor(() => expect(onSceneCoverChange.mock.callCount()).toBe(1));
    expect(onSceneCoverChange.mock.calls[0].arguments).toEqual([null]);
  });

  it("gives a story attachment no arrow with no scene to move it to", async () => {
    render(() => {}, null);
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");

    expect(within(panel).queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
  });

  it("hands an element to the play space with its arrow", async () => {
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

  it("shows everything about an element from its info button", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    await user.click(await within(panel).findByRole("button", { name: "About Dafydd" }));

    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });
    expect(await within(dialog).findByText("A hooded figure")).toBeInTheDocument();
    expect(within(dialog).getByText("Shell seller")).toBeInTheDocument();
    expect(within(dialog).getByText("harbour")).toBeInTheDocument();
    expect(sa_getElementDetail.mock.calls[0].arguments).toEqual([-4, 5, 15]);
  });

  it("edits a STORY element from its info popover, without anything about the scene", async () => {
    const user = userEvent.setup();
    // No scene at the table, so Dafydd is only the story's.
    render(() => {}, null);

    await user.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    await user.click(await within(panel).findByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });
    expect(await within(dialog).findByTestId("element-panel-where")).toHaveTextContent("STORY");
    expect(within(dialog).queryByRole("heading", { name: "In this scene" })).toBeNull();
    await user.click(await within(dialog).findByRole("button", { name: "Edit Dafydd" }));

    const name = await within(dialog).findByRole("textbox", { name: /^Name/ });
    expect(name).toHaveValue("Dafydd");
    // The library edits the element itself, not its place in a scene.
    expect(within(dialog).queryByText("In this scene")).toBeNull();
    await user.clear(name);
    await user.type(name, "Dafydd the Shell");
    const listedBefore = sa_listStoryElements.mock.callCount();
    await user.click(within(dialog).getByRole("button", { name: "Save element" }));

    await waitFor(() => expect(sa_updateStoryElement.mock.callCount()).toBe(1));
    const [story, element, values] = sa_updateStoryElement.mock.calls[0].arguments;
    expect([story, element]).toEqual([-4, 5]);
    expect(values).toMatchObject({ name: "Dafydd the Shell", status: "ACTIVE" });
    // Back on the detail, as saved; the play space and the list hear of it.
    expect(await within(dialog).findByText("Dafydd the Shell", { selector: "dd" })).toBeTruthy();
    expect(onElementEdited.mock.calls[0].arguments[0]).toMatchObject({ name: "Dafydd the Shell" });
    await waitFor(() =>
      expect(sa_listStoryElements.mock.callCount()).toBeGreaterThan(listedBefore),
    );
  });

  it("gives an element a picture from its info popover's Add picture", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    await user.click(await within(panel).findByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });
    await user.click(await within(dialog).findByRole("button", { name: "Add picture" }));
    await user.click(await within(dialog).findByRole("button", { name: "Add Handout 1" }));

    expect(sa_setElementImage.mock.calls[0].arguments).toEqual([-4, 5, 1]);
    // The play space hears of it, and the popover shows it with its −.
    await waitFor(() =>
      expect(onImageChange.mock.calls[0]?.arguments).toEqual([5, "https://x.test/1.png"]),
    );
    expect(within(dialog).getByRole("button", { name: "Remove picture" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Add picture" })).toBeNull();
  });

  it("removes an element in the scene from it, from its info popover", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    await user.click(await within(panel).findByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });
    await user.click(await within(dialog).findByRole("button", { name: "Remove from scene" }));

    expect(await screen.findByText("Removed from the scene")).toBeInTheDocument();
    expect(sa_unlinkSceneElement.mock.calls[0].arguments).toEqual([-4, 15, 5]);
    expect(onRemovedFromScene.mock.calls[0].arguments).toEqual([5]);
    // Out of the scene now, so the button goes; the element is still shown.
    expect(within(dialog).queryByRole("button", { name: "Remove from scene" })).toBeNull();
    expect(within(dialog).getByText("Shell seller")).toBeInTheDocument();
  });

  it("lists only the scene's elements with Scene only on", async () => {
    const user = userEvent.setup();
    render(() => {}, 15, true);

    await user.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    expect(await within(panel).findByText("Dafydd")).toBeInTheDocument();
    expect(within(panel).queryByText("Aldric")).not.toBeInTheDocument();
    expect(sa_listSceneLibraryElements.mock.calls.at(-1)?.arguments).toEqual([
      -4,
      15,
      "PERSON",
      "",
      "name",
    ]);
    expect(sa_listStoryElements.mock.callCount()).toBe(0);

    // Removed from the scene, so gone from the scene's list.
    await user.click(within(panel).getByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });
    await user.click(await within(dialog).findByRole("button", { name: "Remove from scene" }));
    await waitFor(() => expect(within(panel).queryByText("Dafydd")).not.toBeInTheDocument());
  });

  it("lists the whole story with Scene only on but no scene at the table", async () => {
    const user = userEvent.setup();
    render(() => {}, null, true);

    await user.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    expect(await within(panel).findByText("Aldric")).toBeInTheDocument();
    expect(sa_listSceneLibraryElements.mock.callCount()).toBe(0);
  });

  it("offers no Remove from scene with no scene at the table", async () => {
    const user = userEvent.setup();
    render(() => {}, null);

    await user.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    await user.click(await within(panel).findByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });

    expect(await within(dialog).findByText("Shell seller")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Remove from scene" })).toBeNull();
  });

  it("gives attachments no info button", async () => {
    render();
    const panel = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(panel).findByText("Handout 1");

    expect(within(panel).queryByRole("button", { name: /^About / })).not.toBeInTheDocument();
  });

  it("adds nothing to a complete scene and takes nothing out of it", async () => {
    const u = userEvent.setup();
    render(() => {}, 15, false, true);

    // The story's attachments cannot move into the scene.
    const attachments = await screen.findByRole("tabpanel", { name: "Attachments" });
    await within(attachments).findByText("Handout 1");
    expect(within(attachments).queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();

    await u.click(screen.getByRole("tab", { name: "People" }));
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    await within(panel).findByText("Dafydd");
    expect(within(panel).queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New element in the scene" }),
    ).not.toBeInTheDocument();

    // Its info still opens, without Remove from scene.
    await u.click(within(panel).getByRole("button", { name: "About Dafydd" }));
    const dialog = await screen.findByRole("dialog", { name: "Dafydd" });
    expect(await within(dialog).findByText("Shell seller")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Remove from scene" })).toBeNull();
  });

  it("gives an element tab a + for a new element in the scene, and none with no scene", async () => {
    const u = userEvent.setup();
    const { rerender } = render();

    await u.click(screen.getByRole("tab", { name: "Places" }));
    await screen.findByRole("tabpanel", { name: "Places" });
    expect(screen.getByRole("button", { name: "New element in the scene" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New attachment" })).not.toBeInTheDocument();

    rerender(library(() => {}, null));
    expect(
      screen.queryByRole("button", { name: "New element in the scene" }),
    ).not.toBeInTheDocument();
  });

  it("says when a tab has nothing to show", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("tab", { name: "Places" }));

    const panel = await screen.findByRole("tabpanel", { name: "Places" });
    expect(await within(panel).findByText("Nothing here yet.")).toBeInTheDocument();
  });
});
