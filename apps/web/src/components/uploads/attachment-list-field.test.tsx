// Mocks @vercel/blob/client, ./actions and the user provider, per
// apps/web/docs/standards.md: "Mock modules in before, then import the
// component dynamically."
//
// @vercel/blob/client is a dual CJS/ESM package like @vercel/blob itself
// (see actions.test.ts). This workspace has no "type": "module", so tsx
// compiles this file's `import { upload } from "@vercel/blob/client"` to a
// require() call, which resolves to the CJS entry -- a different cache
// entry than the one mock.module's ESM-based interception patches. upload is
// monkey-patched on the shared require-cached module object instead, and
// restored in after().
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { createRequire } from "node:module";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

const requireHere = createRequire(__filename);

const URL_A = "https://abc123.public.blob.vercel-storage.com/uploads/u1/a-1111.jpg";
const SCENE_ID = 42;

/** A promise this test resolves by hand, for driving in-flight cases. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function imageFile(name: string) {
  return new File(["bytes"], name, { type: "image/jpeg" });
}

/** The file input FileUpload.HiddenInput renders; userEvent.upload needs the element. */
function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input rendered");
  return input as HTMLInputElement;
}

const upload = mock.fn<(path: string, file: File, options: unknown) => Promise<{ url: string }>>(
  async () => ({ url: URL_A }),
);
let originalUpload: unknown;

const sa_createAttachment = mock.fn<
  (input: {
    kind: string;
    idExternal: number | null;
    url?: string;
    fileName?: string;
    contentType?: string;
    byteSize?: number;
  }) => Promise<{ idAttachment: number; status: string }>
>();
const sa_markAttachmentReady = mock.fn<(id: number, url: string) => Promise<void>>(async () => {});
const sa_markAttachmentError = mock.fn<(id: number) => Promise<void>>(async () => {});
const sa_retryAttachment = mock.fn<(id: number) => Promise<void>>(async () => {});
const sa_deleteAttachment = mock.fn<(id: number) => Promise<void>>(async () => {});
const sa_listAttachments = mock.fn<
  (
    kind: string,
    idExternal: number,
  ) => Promise<
    Array<{
      idAttachment: number;
      kind: string;
      idExternal: number | null;
      status: string;
      url: string | null;
      isUploaded: boolean;
      fileName: string | null;
      isCover: boolean;
      tags: string[];
    }>
  >
>(async () => []);
const sa_setAttachmentCover = mock.fn<(id: number, isCover: boolean) => Promise<void>>(
  async () => {},
);
const sa_setAttachmentTags = mock.fn<(id: number, tags: string[]) => Promise<void>>(async () => {});
// The field re-renders the page around it after a cover change, since the
// cover that page draws is server-rendered.
const router = { refresh: mock.fn() };

let AttachmentListField: typeof import("./attachment-list-field").AttachmentListField;

before(async () => {
  const blobClientModule: { upload: unknown } = requireHere("@vercel/blob/client");
  originalUpload = blobClientModule.upload;
  blobClientModule.upload = upload;

  mock.module("./actions", {
    namedExports: {
      sa_createAttachment,
      sa_markAttachmentReady,
      sa_markAttachmentError,
      sa_retryAttachment,
      sa_deleteAttachment,
      sa_listAttachments,
      sa_setAttachmentCover,
      sa_setAttachmentTags,
    },
  });
  mock.module("next/navigation", { namedExports: { useRouter: () => router } });
  mock.module("@/components/auth/user-provider", {
    namedExports: { useUser: () => ({ id: "u1" }) },
  });

  ({ AttachmentListField } = await import("./attachment-list-field"));
});

after(() => {
  const blobClientModule: { upload: unknown } = requireHere("@vercel/blob/client");
  blobClientModule.upload = originalUpload;
});

describe("AttachmentListField", () => {
  let nextId = 1;

  beforeEach(() => {
    nextId = 1;
    upload.mock.resetCalls();
    upload.mock.mockImplementation(async () => ({ url: URL_A }));
    sa_createAttachment.mock.resetCalls();
    sa_createAttachment.mock.mockImplementation(async (input) => ({
      idAttachment: nextId++,
      status: input.url ? "READY" : "UPLOADING",
    }));
    sa_markAttachmentReady.mock.resetCalls();
    sa_markAttachmentReady.mock.mockImplementation(async () => {});
    sa_markAttachmentError.mock.resetCalls();
    sa_markAttachmentError.mock.mockImplementation(async () => {});
    sa_retryAttachment.mock.resetCalls();
    sa_retryAttachment.mock.mockImplementation(async () => {});
    sa_deleteAttachment.mock.resetCalls();
    sa_deleteAttachment.mock.mockImplementation(async () => {});
    sa_listAttachments.mock.resetCalls();
    sa_listAttachments.mock.mockImplementation(async () => []);
    sa_setAttachmentCover.mock.resetCalls();
    sa_setAttachmentCover.mock.mockImplementation(async () => {});
    router.refresh.mock.resetCalls();
    sa_setAttachmentTags.mock.resetCalls();
    sa_setAttachmentTags.mock.mockImplementation(async () => {});
  });

  /** Presses the one card's bin button and confirms in the popover it opens. */
  async function confirmRemove(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^remove /i }));
    const dialog = await screen.findByRole("dialog", { name: "Remove this attachment?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
  }

  /** Opens the tags popover on the row for `url` and returns its dialog. */
  async function openTags(user: ReturnType<typeof userEvent.setup>, url: string) {
    await user.click(await screen.findByRole("button", { name: `Tags for ${url}` }));
    return await screen.findByRole("dialog", { name: "Tags" });
  }

  it("adds a typed tag, lower-cased, and removes it again", async () => {
    const user = userEvent.setup();
    twoLinks();

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);
    const dialog = await openTags(user, "https://example.com/new.jpg");
    await user.type(within(dialog).getByRole("textbox", { name: "New tag" }), " Map {Enter}");

    expect(await within(dialog).findByText("map")).toBeInTheDocument();
    expect(sa_setAttachmentTags.mock.calls[0].arguments).toEqual([8, ["map"]]);

    await user.click(within(dialog).getByRole("button", { name: "Remove tag map" }));
    await waitFor(() => expect(within(dialog).queryByText("map")).not.toBeInTheDocument());
    expect(sa_setAttachmentTags.mock.calls[1].arguments).toEqual([8, []]);
  });

  it("makes a typed cover the cover, not a tag in the list", async () => {
    const user = userEvent.setup();
    twoLinks();

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);
    const dialog = await openTags(user, "https://example.com/new.jpg");
    await user.type(within(dialog).getByRole("textbox", { name: "New tag" }), "Cover{Enter}");

    expect(sa_setAttachmentCover.mock.calls[0].arguments).toEqual([8, true]);
    expect(sa_setAttachmentTags.mock.callCount()).toBe(0);
    // The starred chip, with its own way off, and nothing called "cover" among
    // the plain tags.
    expect(await within(dialog).findByRole("button", { name: "Remove cover" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /remove tag/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cover https://example.com/new.jpg" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("takes a refused tag back off and says so inside the popover", async () => {
    const user = userEvent.setup();
    twoLinks();
    sa_setAttachmentTags.mock.mockImplementation(async () => {
      throw new Error("refused");
    });

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);
    const dialog = await openTags(user, "https://example.com/new.jpg");
    await user.type(within(dialog).getByRole("textbox", { name: "New tag" }), "map{Enter}");

    expect(await within(dialog).findByText(/tag could not be added/i)).toBeInTheDocument();
    expect(within(dialog).queryByText("map")).not.toBeInTheDocument();
  });

  /** Two READY links on a scene, the first of them its cover. */
  function twoLinks() {
    sa_listAttachments.mock.mockImplementation(async () => [
      {
        idAttachment: 7,
        kind: "STORY_SCENE",
        idExternal: SCENE_ID,
        status: "READY",
        url: "https://example.com/old.jpg",
        isUploaded: false,
        fileName: null,
        isCover: true,
        tags: [],
      },
      {
        idAttachment: 8,
        kind: "STORY_SCENE",
        idExternal: SCENE_ID,
        status: "READY",
        url: "https://example.com/new.jpg",
        isUploaded: false,
        fileName: null,
        isCover: false,
        tags: [],
      },
    ]);
  }

  it("moves the cover to the row pressed and re-renders the page around it", async () => {
    const user = userEvent.setup();
    twoLinks();

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);

    const oldCover = await screen.findByRole("button", {
      name: "Cover https://example.com/old.jpg",
    });
    const newCover = screen.getByRole("button", { name: "Cover https://example.com/new.jpg" });
    expect(oldCover).toHaveAttribute("aria-pressed", "true");
    expect(newCover).toHaveAttribute("aria-pressed", "false");

    await user.click(newCover);

    expect(newCover).toHaveAttribute("aria-pressed", "true");
    expect(oldCover).toHaveAttribute("aria-pressed", "false");
    expect(sa_setAttachmentCover.mock.calls[0].arguments).toEqual([8, true]);
    await waitFor(() => expect(router.refresh.mock.callCount()).toBe(1));
  });

  it("says over the Cover button what pressing it will do", async () => {
    const user = userEvent.setup();
    twoLinks();

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);
    await user.hover(
      await screen.findByRole("button", { name: "Cover https://example.com/new.jpg" }),
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make this the cover image");

    await user.unhover(screen.getByRole("button", { name: "Cover https://example.com/new.jpg" }));
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await user.hover(screen.getByRole("button", { name: "Cover https://example.com/old.jpg" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Stop using this as the cover image",
    );
  });

  it("takes the cover off when the cover itself is pressed", async () => {
    const user = userEvent.setup();
    twoLinks();

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);
    const cover = await screen.findByRole("button", { name: "Cover https://example.com/old.jpg" });
    await user.click(cover);

    expect(cover).toHaveAttribute("aria-pressed", "false");
    expect(sa_setAttachmentCover.mock.calls[0].arguments).toEqual([7, false]);
  });

  it("puts the cover back and says so when the change is refused", async () => {
    const user = userEvent.setup();
    twoLinks();
    sa_setAttachmentCover.mock.mockImplementation(async () => {
      throw new Error("refused");
    });

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);
    const oldCover = await screen.findByRole("button", {
      name: "Cover https://example.com/old.jpg",
    });
    const newCover = screen.getByRole("button", { name: "Cover https://example.com/new.jpg" });
    await user.click(newCover);

    expect(await screen.findByText(/cover could not be changed/i)).toBeInTheDocument();
    expect(oldCover).toHaveAttribute("aria-pressed", "true");
    expect(newCover).toHaveAttribute("aria-pressed", "false");
    expect(router.refresh.mock.callCount()).toBe(0);
  });

  it("opens a picture full size, with its cover and tags along the bottom", async () => {
    const user = userEvent.setup();
    sa_listAttachments.mock.mockImplementation(async () => [
      {
        idAttachment: 7,
        kind: "STORY_SCENE",
        idExternal: SCENE_ID,
        status: "READY",
        url: "https://example.com/map.jpg",
        isUploaded: false,
        fileName: null,
        isCover: true,
        tags: ["map", "handout"],
      },
    ]);

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);
    await user.click(
      await screen.findByRole("button", { name: "Preview https://example.com/map.jpg" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "https://example.com/map.jpg" });
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://example.com/map.jpg");
    const tags = within(dialog).getAllByRole("listitem");
    expect(tags.map((tag) => tag.textContent)).toEqual(["Cover", "map", "handout"]);
  });

  it("asks before removing, says it is permanent, and Cancel removes nothing", async () => {
    const user = userEvent.setup();
    twoLinks();

    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} />);
    await user.click(
      await screen.findByRole("button", { name: "Remove https://example.com/old.jpg" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Remove this attachment?" });
    expect(dialog).toHaveTextContent(/permanently deletes/i);
    // old.jpg is the cover, and the popover says what removing it costs.
    expect(dialog).toHaveTextContent(/it is the cover/i);
    expect(sa_deleteAttachment.mock.callCount()).toBe(0);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeVisible());
    expect(sa_deleteAttachment.mock.callCount()).toBe(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("draws only the matched cards, can leave the cover out, and says when none are left", async () => {
    twoLinks();
    const onChange = mock.fn<(ids: number[]) => void>();

    const { rerender } = renderWithProviders(
      <AttachmentListField
        kind="STORY_SCENE"
        idExternal={SCENE_ID}
        onChange={onChange}
        shownIds={new Set([8])}
        showEmpty
      />,
    );
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(
      screen.getByRole("button", { name: "Preview https://example.com/new.jpg" }),
    ).toBeInTheDocument();
    // What is reported is still the whole set: the search only narrows the view.
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([7, 8]);

    // 7 is the cover; with covers left out and only 7 matched, nothing is left.
    rerender(
      <AttachmentListField
        kind="STORY_SCENE"
        idExternal={SCENE_ID}
        onChange={onChange}
        shownIds={new Set([7])}
        hideCovers
        showEmpty
      />,
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("says there are none yet once an object with no attachments has loaded", async () => {
    renderWithProviders(<AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} showEmpty />);
    expect(await screen.findByText("No attachments yet.")).toBeInTheDocument();
  });

  it("reports how many it holds once loaded, counting the cover even when it is hidden, and again after a delete", async () => {
    const user = userEvent.setup();
    twoLinks();
    const onCountChange = mock.fn<(count: number) => void>();

    renderWithProviders(
      <AttachmentListField
        kind="STORY_SCENE"
        idExternal={SCENE_ID}
        hideCovers
        onCountChange={onCountChange}
      />,
    );

    await waitFor(() => expect(onCountChange.mock.calls.at(-1)?.arguments[0]).toBe(2));
    // Nothing is said while the rows are still on their way: no (0) first.
    expect(onCountChange.mock.calls.map((call) => call.arguments[0])).toEqual([2]);

    await confirmRemove(user);
    await waitFor(() => expect(onCountChange.mock.calls.at(-1)?.arguments[0]).toBe(1));
  });

  it("draws the link input and dropzone into the box the page gives it", async () => {
    const user = userEvent.setup();
    const box = document.createElement("div");
    document.body.append(box);

    const { container } = renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} addTarget={box} />,
    );

    expect(box.querySelector('input[type="file"]')).not.toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    // Still the field's own: a link added there lands among its cards.
    await user.type(screen.getByRole("textbox", { name: /link/i }), "https://example.com/a.jpg");
    await user.click(screen.getByRole("button", { name: /add link/i }));
    expect(
      await screen.findByRole("button", { name: "Remove https://example.com/a.jpg" }),
    ).toBeInTheDocument();
    box.remove();
  });

  it("draws nothing while the page's box is not there yet", () => {
    const { container } = renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} addTarget={null} />,
    );

    expect(screen.queryByRole("textbox", { name: /link/i })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("hides the link input and dropzone when told to, still showing the cards", async () => {
    twoLinks();

    const { container } = renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} showAdd={false} />,
    );

    expect(
      await screen.findByRole("button", { name: "Tags for https://example.com/new.jpg" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /link/i })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("offers no Cover on a create form, where there is no object to be the cover of", async () => {
    const user = userEvent.setup();

    renderWithProviders(<AttachmentListField kind="STORY" idExternal={null} />);
    await user.type(screen.getByRole("textbox", { name: /link/i }), "https://example.com/a.jpg");
    await user.click(screen.getByRole("button", { name: /add link/i }));

    expect(await screen.findByRole("button", { name: /^remove /i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cover/i })).not.toBeInTheDocument();
  });

  it("adds a typed URL as an attachment and reports its id", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(ids: number[]) => void>();

    renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={onChange} />,
    );
    await user.type(screen.getByRole("textbox", { name: /link/i }), "https://example.com/a.jpg");
    await user.click(screen.getByRole("button", { name: /add link/i }));

    await waitFor(() => expect(onChange.mock.callCount()).toBeGreaterThan(0));
    expect(sa_createAttachment.mock.calls[0].arguments[0]).toMatchObject({
      kind: "STORY_SCENE",
      idExternal: SCENE_ID,
      url: "https://example.com/a.jpg",
    });
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([1]);
    expect(await screen.findByRole("img")).toHaveAttribute("src", "https://example.com/a.jpg");
  });

  it("uploads an accepted file: creates an UPLOADING row, uploads, then marks it ready", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(ids: number[]) => void>();
    const pending = deferred<{ url: string }>();
    upload.mock.mockImplementation(() => pending.promise);

    const { container } = renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={onChange} />,
    );
    await user.upload(fileInput(container), imageFile("cat.jpg"));

    await waitFor(() => expect(sa_createAttachment.mock.callCount()).toBe(1));
    expect(sa_createAttachment.mock.calls[0].arguments[0]).toMatchObject({
      kind: "STORY_SCENE",
      idExternal: SCENE_ID,
      fileName: "cat.jpg",
      contentType: "image/jpeg",
    });
    expect(await screen.findByText(/uploading/i)).toBeInTheDocument();
    expect(upload.mock.calls[0].arguments[0]).toBe("uploads/u1/cat.jpg");

    pending.resolve({ url: URL_A });

    await waitFor(() => expect(sa_markAttachmentReady.mock.callCount()).toBe(1));
    expect(sa_markAttachmentReady.mock.calls[0].arguments).toEqual([1, URL_A]);
    expect(await screen.findByRole("img")).toHaveAttribute("src", URL_A);
  });

  it("marks a failed upload as an error inline, leaving the other attachments untouched", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(ids: number[]) => void>();
    upload.mock.mockImplementation(async () => ({ url: URL_A }));

    const { container } = renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={onChange} />,
    );
    await user.upload(fileInput(container), imageFile("good.jpg"));
    await waitFor(() => expect(sa_markAttachmentReady.mock.callCount()).toBe(1));

    upload.mock.mockImplementation(async () => {
      throw new Error("network");
    });
    await user.upload(fileInput(container), imageFile("bad.jpg"));

    await waitFor(() => expect(sa_markAttachmentError.mock.callCount()).toBe(1));
    expect(sa_markAttachmentError.mock.calls[0].arguments[0]).toBe(2);
    expect(await screen.findByText(/could not be uploaded/i)).toBeInTheDocument();

    // The first, successful attachment must still be intact.
    expect(screen.getByRole("img")).toHaveAttribute("src", URL_A);
    // Newest first: the second file's row went in front of the first's.
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([2, 1]);
  });

  it("renders a Retry button on an ERROR row that calls sa_retryAttachment and re-uploads", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(ids: number[]) => void>();
    upload.mock.mockImplementation(async () => {
      throw new Error("network");
    });

    const { container } = renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={onChange} />,
    );
    await user.upload(fileInput(container), imageFile("cat.jpg"));
    const retryButton = await screen.findByRole("button", { name: /retry/i });

    upload.mock.mockImplementation(async () => ({ url: URL_A }));
    await user.click(retryButton);

    await waitFor(() => expect(sa_retryAttachment.mock.callCount()).toBe(1));
    expect(sa_retryAttachment.mock.calls[0].arguments[0]).toBe(1);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", URL_A);
  });

  it("removes an attachment via sa_deleteAttachment and drops its id from the value", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(ids: number[]) => void>();

    renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={onChange} />,
    );
    await user.type(screen.getByRole("textbox", { name: /link/i }), "https://example.com/a.jpg");
    await user.click(screen.getByRole("button", { name: /add link/i }));
    await waitFor(() => expect(onChange.mock.callCount()).toBeGreaterThan(0));

    await confirmRemove(user);

    await waitFor(() => expect(sa_deleteAttachment.mock.callCount()).toBe(1));
    expect(sa_deleteAttachment.mock.calls[0].arguments[0]).toBe(1);
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([]);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("puts each new attachment at the front, as the list runs newest first", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(ids: number[]) => void>();

    const { container } = renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={onChange} />,
    );

    await user.type(screen.getByRole("textbox", { name: /link/i }), "https://example.com/first.jpg");
    await user.click(screen.getByRole("button", { name: /add link/i }));
    await waitFor(() => expect(sa_createAttachment.mock.callCount()).toBe(1));

    await user.upload(fileInput(container), imageFile("second.jpg"));
    await waitFor(() => expect(sa_createAttachment.mock.callCount()).toBe(2));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("second.jpg");
    expect(items[1]).toHaveTextContent("first.jpg");
  });

  it("collects ids without claiming when idExternal is null (a create form)", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(ids: number[]) => void>();

    renderWithProviders(
      <AttachmentListField kind="STORY" idExternal={null} value={[]} onChange={onChange} />,
    );
    await user.type(screen.getByRole("textbox", { name: /link/i }), "https://example.com/a.jpg");
    await user.click(screen.getByRole("button", { name: /add link/i }));

    await waitFor(() => expect(onChange.mock.callCount()).toBeGreaterThan(0));
    expect(sa_createAttachment.mock.calls[0].arguments[0]).toMatchObject({ idExternal: null });
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([1]);
    // AttachmentListField does not import sa_claimAttachments at all -- there
    // is nothing here that could call it, on a create form or otherwise.
  });

  // A remount (e.g. reopening the edit form) has only `value` to go on, and
  // commit() fires onChange on every transition including UPLOADING->ERROR,
  // so `value` can legitimately name an id that is actually errored. That id
  // must not rehydrate as a plain, healthy attachment: the failure has to
  // stay visible, not disappear.
  it("hydrates real statuses from the server, keeping an ERROR row visibly errored", async () => {
    sa_listAttachments.mock.mockImplementation(async () => [
      {
        idAttachment: 7,
        kind: "STORY_SCENE",
        idExternal: SCENE_ID,
        status: "ERROR",
        url: null,
        isUploaded: true,
        fileName: "broken.jpg",
        isCover: false,
        tags: [],
      },
    ]);
    const onChange = mock.fn<(ids: number[]) => void>();

    renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[7]} onChange={onChange} />,
    );

    await waitFor(() => expect(sa_listAttachments.mock.callCount()).toBe(1));
    expect(sa_listAttachments.mock.calls[0].arguments).toEqual(["STORY_SCENE", SCENE_ID]);
    expect(await screen.findByText(/could not be uploaded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not call sa_listAttachments on a create form (idExternal null)", async () => {
    renderWithProviders(
      <AttachmentListField kind="STORY" idExternal={null} value={[]} onChange={() => {}} />,
    );

    // Give any stray effect a turn to run before asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sa_listAttachments.mock.callCount()).toBe(0);
  });

  // sa_listAttachments calls requireUser() and runs a db.select, either of
  // which can reject. Left unhandled, the field would sit there permanently
  // empty with nothing to say why -- indistinguishable from "this story has
  // no pictures", which invites the user to re-upload everything that is
  // really still there.
  it("shows an inline error on a failed load, and Try Again recovers", async () => {
    const user = userEvent.setup();
    let calls = 0;
    sa_listAttachments.mock.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("db down");
      return [
        {
          idAttachment: 9,
          kind: "STORY_SCENE",
          idExternal: SCENE_ID,
          status: "READY",
          url: "https://example.com/ok.jpg",
          isUploaded: false,
          fileName: null,
          isCover: false,
          tags: [],
        },
      ];
    });

    renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={() => {}} />,
    );

    expect(await screen.findByText(/could not load/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  // The fetch this field starts on mount is not the only writer of rows:
  // a link typed or a file picked while that request is still in flight
  // must survive the response landing, not be erased by it -- the server
  // query ran before that attachment existed, so it can never be in the
  // response.
  it("keeps a row added locally while the initial load is still pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<
      Array<{
        idAttachment: number;
        kind: string;
        idExternal: number | null;
        status: string;
        url: string | null;
        isUploaded: boolean;
        fileName: string | null;
        isCover: boolean;
        tags: string[];
      }>
    >();
    sa_listAttachments.mock.mockImplementation(() => pending.promise);
    const onChange = mock.fn<(ids: number[]) => void>();

    renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={onChange} />,
    );

    await user.type(screen.getByRole("textbox", { name: /link/i }), "https://example.com/added.jpg");
    await user.click(screen.getByRole("button", { name: /add link/i }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));

    pending.resolve([
      {
        idAttachment: 55,
        kind: "STORY_SCENE",
        idExternal: SCENE_ID,
        status: "READY",
        url: "https://example.com/existing.jpg",
        isUploaded: false,
        fileName: null,
        isCover: false,
        tags: [],
      },
    ]);

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    const items = screen.getAllByRole("listitem");
    // The row added during the load is the newer one, so it leads.
    expect(items[0]).toHaveTextContent("added.jpg");
    expect(items[1]).toHaveTextContent("existing.jpg");
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([1, 55]);
  });

  // handleRemove's commit() and its sa_deleteAttachment call are two
  // separate round trips. A list fetch's SELECT can land in between and
  // still see the row -- without removedIds, the merge would treat that as
  // a legitimate server row and bring it back, reporting the resurrected id
  // to the parent as if the removal never happened.
  it("does not resurrect a row removed while a list fetch is still pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<
      Array<{
        idAttachment: number;
        kind: string;
        idExternal: number | null;
        status: string;
        url: string | null;
        isUploaded: boolean;
        fileName: string | null;
        isCover: boolean;
        tags: string[];
      }>
    >();
    sa_listAttachments.mock.mockImplementation(() => pending.promise);
    const onChange = mock.fn<(ids: number[]) => void>();

    renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={onChange} />,
    );

    await user.type(screen.getByRole("textbox", { name: /link/i }), "https://example.com/gone.jpg");
    await user.click(screen.getByRole("button", { name: /add link/i }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));

    await confirmRemove(user);
    await waitFor(() => expect(screen.queryByRole("listitem")).not.toBeInTheDocument());

    // Simulates the fetch's SELECT having run before the DELETE committed:
    // the server still reports the row this test just asked to remove.
    // Wrapped in act() (rather than an unwrapped tick) because the merge
    // this triggers happens as a microtask completely off any DOM event
    // React Testing Library would otherwise wrap for us.
    await act(async () => {
      pending.resolve([
        {
          idAttachment: 1,
          kind: "STORY_SCENE",
          idExternal: SCENE_ID,
          status: "READY",
          url: "https://example.com/gone.jpg",
          isUploaded: false,
          fileName: null,
          isCover: false,
          tags: [],
        },
      ]);
      await pending.promise;
    });

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([]);
  });

  // Two rapid clicks on Try Again must not start overlapping merges, where
  // the later-resolving one could win even if it read rowsRef from a staler
  // snapshot than the earlier one's.
  it("disables Try Again while a retry load is in flight, and does not double-fetch", async () => {
    const user = userEvent.setup();
    sa_listAttachments.mock.mockImplementation(async () => {
      throw new Error("db down");
    });

    renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={() => {}} />,
    );
    await screen.findByText(/could not load/i);

    const pending = deferred<
      Array<{
        idAttachment: number;
        kind: string;
        idExternal: number | null;
        status: string;
        url: string | null;
        isUploaded: boolean;
        fileName: string | null;
        isCover: boolean;
        tags: string[];
      }>
    >();
    sa_listAttachments.mock.mockImplementation(() => pending.promise);

    const retryButton = screen.getByRole("button", { name: /try again/i });
    await user.click(retryButton);
    await waitFor(() => expect(retryButton).toHaveAttribute("aria-disabled", "true"));

    // A second click while the first load is still in flight must not
    // start an overlapping fetch.
    await user.click(retryButton);
    expect(sa_listAttachments.mock.callCount()).toBe(2);

    // Resolving lets the guarded load complete and succeed, which clears
    // loadError -- taking the whole Try Again row, button included, with
    // it. That disappearance is itself the proof the guard did not leave
    // the field stuck mid-load.
    pending.resolve([]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument(),
    );
  });

  // The one case `value` has a real job: a create form (idExternal null) has
  // no sa_listAttachments to recover its rows from on a remount, so `value`
  // -- the form's own surviving record of ids -- seeds bare rows instead.
  // They render as neither ready nor errored, since this field genuinely
  // does not know which they are.
  it("seeds bare rows from value on a create-form remount, with no thumbnail or Retry", () => {
    renderWithProviders(
      <AttachmentListField kind="STORY" idExternal={null} value={[5]} onChange={() => {}} />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Attachment 5");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove /i })).toBeInTheDocument();
  });

  // zag's own FileUpload ledger only ever counts files accepted through the
  // dropzone -- a link added here never touches it -- so it cannot be
  // trusted to keep the URL path under the same cap. The 20 existing rows
  // are seeded via `value` on a null-idExternal mount (synchronous, no
  // network) purely to reach the cap without 20 real interactions; the
  // seeding path itself is exercised by the test above.
  it("refuses a link once the attachment cap is reached, without calling the server", async () => {
    const user = userEvent.setup();
    const existingIds = Array.from({ length: 20 }, (_, i) => i + 1);
    const onChange = mock.fn<(ids: number[]) => void>();

    renderWithProviders(
      <AttachmentListField kind="STORY" idExternal={null} value={existingIds} onChange={onChange} />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(20);

    await user.type(
      screen.getByRole("textbox", { name: /link/i }),
      "https://example.com/one-too-many.jpg",
    );
    await user.click(screen.getByRole("button", { name: /add link/i }));

    expect(await screen.findByText(/at most 20 attachments/i)).toBeInTheDocument();
    expect(sa_createAttachment.mock.callCount()).toBe(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(onChange.mock.callCount()).toBe(0);
  });

  // attachmentUrlSchema's own "Please enter a valid URL." is the one and
  // only message for this: sa_createAttachment runs the identical schema
  // server-side and would throw the same wording, but checking it here
  // first means the field never depends on that thrown message surviving
  // the server action boundary, and there is only one string to keep in
  // sync rather than two that can drift apart.
  it("shows attachmentUrlSchema's own message for a non-http(s) link, without calling the server", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <AttachmentListField kind="STORY_SCENE" idExternal={SCENE_ID} value={[]} onChange={() => {}} />,
    );

    await user.type(screen.getByRole("textbox", { name: /link/i }), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: /add link/i }));

    expect(await screen.findByText("Please enter a valid URL.")).toBeInTheDocument();
    expect(sa_createAttachment.mock.callCount()).toBe(0);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
