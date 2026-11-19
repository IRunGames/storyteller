import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { Attachment } from "@/lib/attachments";
import { currentUser, mockNavigation } from "@/test/mocks";

// What HolderPictures does for an element's own pictures, beside what
// ScenePictures' suite covers for a scene's: the holder named in its words,
// and each uploaded picture's annotation controls.

const user = currentUser();
const ELEMENT_ID = 5;

function picture(
  idAttachment: number,
  fileName: string,
  isCover: boolean,
  isUploaded = true,
): Attachment {
  return {
    idAttachment,
    idStory: 7,
    kind: "ELEMENT",
    idExternal: ELEMENT_ID,
    idAttachmentUse: idAttachment + 100,
    status: "READY",
    url: `https://abc.public.blob.vercel-storage.com/uploads/u/${fileName}`,
    isUploaded,
    fileName,
    isCover,
    tags: [],
    createdAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    drawing: null,
  };
}

const map = { ...picture(1, "map.png", true), drawing: { isActive: true } };
const sketch = picture(2, "sketch.png", false, false);
const sa_listAttachments = mock.fn(async (_kind: string, _idExternal: number) => [map, sketch]);
type Detached = { ok: true; detached: number[] } | { ok: false; error: string };
const sa_detachFromHolder = mock.fn(
  async (_kind: string, _idExternal: number, ids: number[]): Promise<Detached> => ({
    ok: true,
    detached: ids,
  }),
);
const sa_setAnnotated = mock.fn(async (_picture: number, _on: boolean) => ({
  ok: true as const,
  annotation: null,
}));

let HolderPictures: typeof import("./holder-pictures").HolderPictures;

describe("HolderPictures, for an element", () => {
  before(async () => {
    mockNavigation();
    mock.module("@/components/uploads/actions", {
      namedExports: {
        sa_createAttachment: mock.fn(),
        sa_markAttachmentReady: mock.fn(),
        sa_markAttachmentError: mock.fn(),
        sa_retryAttachment: mock.fn(),
        sa_deleteAttachment: mock.fn(),
        sa_listAttachments,
        sa_setAttachmentCover: mock.fn(async () => {}),
        sa_setAttachmentTags: mock.fn(),
        sa_detachFromHolder,
      },
    });
    mock.module("@/components/annotations/actions", {
      namedExports: {
        sa_openAnnotation: mock.fn(async () => ({ ok: false as const, error: "Not here." })),
        sa_getPictureState: mock.fn(async () => null),
        sa_setAnnotated,
        sa_getAnnotation: mock.fn(async () => null),
        sa_saveAnnotation: mock.fn(),
        sa_refreshPlayersCopy: mock.fn(async () => ({ ok: true, behind: false })),
        sa_getScenePicture: mock.fn(async () => null),
      },
    });
    // The picker's own suite covers it.
    mock.module("@/components/uploads/story-attachment-picker", {
      namedExports: { StoryAttachmentPicker: () => <p>Picker</p> },
    });
    ({ HolderPictures } = await import("./holder-pictures"));
  });

  beforeEach(() => {
    sa_listAttachments.mock.resetCalls();
    sa_detachFromHolder.mock.resetCalls();
    sa_setAnnotated.mock.resetCalls();
  });

  afterEach(() => cleanup());

  function render() {
    return renderWithProviders(
      <UserProvider user={user}>
        <HolderPictures
          idStory={7}
          holder={{ kind: "ELEMENT", idExternal: ELEMENT_ID }}
          headingLevel={2}
          canAnnotate
        />
      </UserProvider>,
    );
  }

  it("lists the element's pictures, its cover apart, and says which one the element shows", async () => {
    render();
    const cover = screen.getByRole("region", { name: "Cover" });
    expect(await within(cover).findByText("map.png")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Other pictures" })).getByText("sketch.png"),
    ).toBeInTheDocument();
    expect(sa_listAttachments.mock.calls[0].arguments).toEqual(["ELEMENT", ELEMENT_ID]);
    expect(screen.getByText(/Press Cover on the one the element shows/)).toBeInTheDocument();
  });

  it("offers an uploaded picture's annotation controls, as it stands", async () => {
    const u = userEvent.setup();
    render();
    const cover = screen.getByRole("region", { name: "Cover" });
    const toggle = await within(cover).findByRole("button", { name: "Annotate for players" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(within(cover).getByRole("button", { name: "Open annotator" })).toBeInTheDocument();
    // A typed link is fetched by no server, so it is not drawn on.
    const others = screen.getByRole("region", { name: "Other pictures" });
    expect(within(others).queryByRole("button", { name: "Annotate for players" })).toBeNull();

    // Turning it off asks first, since the players are then shown the picture.
    await u.click(toggle);
    const ask = await screen.findByRole("dialog", {
      name: "Show the players the picture as it is?",
    });
    await u.click(within(ask).getByRole("button", { name: "Show it" }));
    expect(sa_setAnnotated.mock.calls[0].arguments).toEqual([1, false]);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
  });

  it("takes a picture off the element from its trashcan, saying so, without deleting it", async () => {
    const u = userEvent.setup();
    render();
    const others = screen.getByRole("region", { name: "Other pictures" });
    await u.click(await within(others).findByRole("button", { name: "Remove sketch.png" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Remove this picture from the element?",
    });
    expect(dialog).toHaveTextContent("leaves this element and stays in the story's library");
    await u.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(sa_detachFromHolder.mock.callCount()).toBe(1));
    expect(sa_detachFromHolder.mock.calls[0].arguments).toEqual(["ELEMENT", ELEMENT_ID, [2]]);
  });
});
