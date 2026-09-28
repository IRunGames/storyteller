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
    }>
  >
>(async () => []);

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
    sa_listAttachments.mock.resetCalls();
    sa_listAttachments.mock.mockImplementation(async () => []);
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
      },
    ]);

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("existing.jpg");
    expect(items[1]).toHaveTextContent("added.jpg");
    expect(onChange.mock.calls.at(-1)?.arguments[0]).toEqual([55, 1]);
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
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });
});
