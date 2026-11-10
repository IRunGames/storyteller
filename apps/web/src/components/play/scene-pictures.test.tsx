import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { Attachment } from "@/lib/attachments";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -10,
  isAnonymous: false,
};

const SCENE_ID = 42;

function picture(idAttachment: number, fileName: string, isCover: boolean): Attachment {
  return {
    idAttachment,
    idStory: 7,
    kind: "STORY_SCENE",
    idExternal: SCENE_ID,
    idAttachmentUse: idAttachment + 100,
    status: "READY",
    url: `https://x.test/${fileName}`,
    isUploaded: true,
    fileName,
    isCover,
    tags: [],
    createdAt: "2026-10-13T10:00:00.000Z",
    updatedAt: "2026-10-13T10:00:00.000Z",
  };
}

const docks = picture(1, "docks.png", true);
const gull = picture(2, "gull.png", false);
const sa_listAttachments = mock.fn(async (_kind: string, _idExternal: number) => [docks, gull]);
const sa_setAttachmentCover = mock.fn(
  async (_kind: string, _idExternal: number, _id: number, _isCover: boolean) => {},
);
const sa_deleteAttachment = mock.fn(async (_id: number) => {});
type Detached = { ok: true; detached: number[] } | { ok: false; error: string };
const sa_detachFromHolder = mock.fn(
  async (_kind: string, _idExternal: number, ids: number[]): Promise<Detached> => ({
    ok: true,
    detached: ids,
  }),
);

let ScenePictures: typeof import("./scene-pictures").ScenePictures;

describe("ScenePictures", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { useRouter: () => ({ refresh: mock.fn(), push: mock.fn() }) },
    });
    // The field's own test file covers adding, uploading and tagging.
    mock.module("@/components/uploads/actions", {
      namedExports: {
        sa_createAttachment: mock.fn(),
        sa_markAttachmentReady: mock.fn(),
        sa_markAttachmentError: mock.fn(),
        sa_retryAttachment: mock.fn(),
        sa_deleteAttachment,
        sa_listAttachments,
        sa_setAttachmentCover,
        sa_setAttachmentTags: mock.fn(),
        sa_detachFromHolder,
      },
    });
    // So does the picker's.
    mock.module("@/components/uploads/story-attachment-picker", {
      namedExports: { StoryAttachmentPicker: () => <p>Picker</p> },
    });
    ({ ScenePictures } = await import("./scene-pictures"));
  });

  beforeEach(() => {
    sa_listAttachments.mock.resetCalls();
    sa_setAttachmentCover.mock.resetCalls();
    sa_deleteAttachment.mock.resetCalls();
    sa_detachFromHolder.mock.resetCalls();
  });

  afterEach(() => {
    cleanup();
  });

  function render(onCoverChange?: (url: string | null) => void, onPicturesChange?: () => void) {
    return renderWithProviders(
      <UserProvider user={user}>
        <ScenePictures
          idStory={7}
          idStoryScene={SCENE_ID}
          onCoverChange={onCoverChange}
          onPicturesChange={onPicturesChange}
        />
      </UserProvider>,
    );
  }

  it("shows the scene's cover in an area of its own and the rest under it, with the picker at the end", async () => {
    render();

    const cover = screen.getByRole("region", { name: "Cover" });
    const others = screen.getByRole("region", { name: "Other pictures" });
    expect(await within(cover).findByText("docks.png")).toBeInTheDocument();
    expect(within(cover).queryByText("gull.png")).not.toBeInTheDocument();
    expect(within(others).getByText("gull.png")).toBeInTheDocument();
    expect(within(others).queryByText("docks.png")).not.toBeInTheDocument();
    expect(sa_listAttachments.mock.calls[0].arguments).toEqual(["STORY_SCENE", SCENE_ID]);
    // Order on the page: the heading, the cover, the others, the picker.
    const heading = screen.getByRole("heading", { name: "Pictures" });
    const picker = screen.getByText("Picker");
    expect(heading.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cover.compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(others.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moves a picture into the cover area when Cover is pressed on it, and reports the new cover", async () => {
    const u = userEvent.setup();
    const onCoverChange = mock.fn<(url: string | null) => void>();
    const onPicturesChange = mock.fn<() => void>();
    render(onCoverChange, onPicturesChange);

    const others = screen.getByRole("region", { name: "Other pictures" });
    await within(others).findByRole("button", { name: "Cover gull.png" });
    // Loading the rows is not a change.
    expect(onPicturesChange.mock.callCount()).toBe(0);
    await u.click(within(others).getByRole("button", { name: "Cover gull.png" }));

    await waitFor(() => expect(sa_setAttachmentCover.mock.callCount()).toBe(1));
    expect(sa_setAttachmentCover.mock.calls[0].arguments).toEqual([
      "STORY_SCENE",
      SCENE_ID,
      2,
      true,
    ]);
    const cover = screen.getByRole("region", { name: "Cover" });
    await waitFor(() => expect(within(cover).getByText("gull.png")).toBeInTheDocument());
    expect(within(others).getByText("docks.png")).toBeInTheDocument();
    expect(onCoverChange.mock.calls.at(-1)?.arguments).toEqual(["https://x.test/gull.png"]);
    expect(onPicturesChange.mock.callCount()).toBeGreaterThan(0);
  });

  it("says when there is no cover, and takes the cover off the scene from its trashcan without deleting the picture", async () => {
    const u = userEvent.setup();
    const onCoverChange = mock.fn<(url: string | null) => void>();
    sa_listAttachments.mock.mockImplementationOnce(async () => [gull]);
    render(onCoverChange);

    const cover = screen.getByRole("region", { name: "Cover" });
    expect(
      await within(cover).findByText("No cover yet. Press Cover on a picture below."),
    ).toBeInTheDocument();

    cleanup();
    render(onCoverChange);
    const again = screen.getByRole("region", { name: "Cover" });
    await u.click(await within(again).findByRole("button", { name: "Remove docks.png" }));
    // The question is about the scene, not the attachment: the picture is
    // the story's and stays in its library.
    const dialog = await screen.findByRole("dialog", {
      name: "Remove this picture from the scene?",
    });
    expect(dialog).toHaveTextContent("stays in the story's library");
    expect(dialog).toHaveTextContent("It is the cover");
    sa_listAttachments.mock.mockImplementationOnce(async () => [gull]);
    await u.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(sa_detachFromHolder.mock.callCount()).toBe(1));
    expect(sa_detachFromHolder.mock.calls[0].arguments).toEqual(["STORY_SCENE", SCENE_ID, [1]]);
    expect(sa_deleteAttachment.mock.callCount()).toBe(0);
    expect(onCoverChange.mock.calls.at(-1)?.arguments).toEqual([null]);
    // The list is read again without it.
    await waitFor(() => expect(within(again).queryByText("docks.png")).not.toBeInTheDocument());
  });

  it("opens the link input and dropzone from the + beside the heading", async () => {
    const u = userEvent.setup();
    render();

    expect(screen.queryByRole("textbox", { name: "Link" })).not.toBeInTheDocument();
    const plus = screen.getByRole("button", { name: "Add a picture" });
    await u.click(plus);
    expect(plus).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("textbox", { name: "Link" })).toBeInTheDocument();
  });
});
