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
import { screen, waitFor } from "@testing-library/react";
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
    },
  });
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
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([1, 2]);
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

    await user.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(sa_deleteAttachment.mock.callCount()).toBe(1));
    expect(sa_deleteAttachment.mock.calls[0].arguments[0]).toBe(1);
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([]);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("renders several attachments in the order they were added", async () => {
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
    expect(items[0]).toHaveTextContent("first.jpg");
    expect(items[1]).toHaveTextContent("second.jpg");
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
});
