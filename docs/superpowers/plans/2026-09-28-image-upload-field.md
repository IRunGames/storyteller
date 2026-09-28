# Image Upload Field Implementation Plan

> **Superseded** by the attachments design at
> `docs/superpowers/specs/2026-09-28-attachments-design.md`. Tasks 1-3 still
> apply almost unchanged; Tasks 4-7 are replaced by that spec's own plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ImageUploadField`, a responsive Chakra file upload wired to Vercel Blob that any react-hook-form form binds to an existing image URL column.

**Architecture:** A public Blob store; the browser uploads straight to it using a short-lived token issued by one route handler that runs `requireUser()` first. The stored value is a plain URL string, so the field holds either an external link the user typed or a Blob URL an upload produced. A server action deletes a blob the user replaces or removes, and a daily cron sweeps what that misses.

**Tech Stack:** Next.js App Router, Chakra UI v3 (`FileUpload`), react-hook-form + zod, `@vercel/blob`, Drizzle, `node:test` + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-image-upload-field-design.md`

## Global Constraints

- **Do not commit.** This repo's rule: never commit or push unless the user asks in that message. Each task ends by staging with `git add` and stopping. Ignore any habit of committing per task.
- Prettier width 100. Never run bare `prettier --write` over existing files.
- Allowed content types, exactly: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
- Maximum upload size, exactly: `10 * 1024 * 1024` (10 MB).
- Blob store: public, named `storyteller-images`. Host suffix `.public.blob.vercel-storage.com`.
- Blob key layout: `uploads/<user-id>/<filename>`, with `addRandomSuffix: true`.
- Sweep grace period, exactly: 24 hours.
- Every exported server action is named `sa_…` and starts `const user = await requireUser()`.
- UI is Chakra v3 compound components from `@chakra-ui/react`; icons from `lucide-react`. No Tailwind, no shadcn, no icon library.
- Errors are inline (`Field.ErrorText` / `Alert.Root`), never toasted. Toasts are for confirmations only.
- Tests are `node:test` + `expect` + Testing Library, rendered through `renderWithProviders`, with `mock.module` in `before` followed by a dynamic `await import`.
- A new dependency gets a bullet in `apps/web/technologies.md`.
- Run the suite with `just test`; narrow with `just test --test-name-pattern <name>`.

## Review Focus

These are the failure modes the spec implies but does not give a task of their own. Each one's test is folded into the task that owns the code.

1. **Submitting the form while an upload is still in flight** silently saves an empty image. The submit button must be disabled until the upload settles. (Task 5)
2. **An upload that fails mid-flight** must leave the value already stored untouched and report inline — a failed replace must never lose the current image. (Task 5)
3. **A second file chosen while the first is still uploading** can complete out of order and write the older URL. The last selection must win. (Task 5)
4. **Hostname case and a trailing dot** — `HTTPS://X.PUBLIC.BLOB.VERCEL-STORAGE.COM./k` is the same host and must still be recognised as ours. (Task 1)
5. **A delete asked for a Blob URL with no `uploads/` prefix at all** (a legacy or hand-uploaded object) must be refused, not deleted. (Task 3)

---

### Task 1: The image upload helpers

**Files:**
- Create: `apps/web/src/lib/image-uploads.ts`
- Test: `apps/web/src/lib/image-uploads.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ALLOWED_IMAGE_TYPES: readonly string[]`, `MAX_IMAGE_BYTES: number`, `uploadPrefix(userId: string): string`, `isUploadedBlobUrl(value: string): boolean`, `isOwnUploadedBlobUrl(value: string, userId: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/image-uploads.test.ts
import { describe, it } from "node:test";
import { expect } from "expect";

import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  isOwnUploadedBlobUrl,
  isUploadedBlobUrl,
  uploadPrefix,
} from "./image-uploads";

const STORE = "https://abc123.public.blob.vercel-storage.com";
const USER = "8f2b1c44-0000-4000-8000-000000000001";

describe("image upload limits", () => {
  it("allows exactly the four image types the route handler allows", () => {
    expect([...ALLOWED_IMAGE_TYPES]).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]);
  });

  it("caps uploads at 10 MB", () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("isUploadedBlobUrl", () => {
  it("recognises a URL on our store", () => {
    expect(isUploadedBlobUrl(`${STORE}/uploads/${USER}/cat-x1y2.jpg`)).toBe(true);
  });

  it("rejects an external URL", () => {
    expect(isUploadedBlobUrl("https://rpg.irun.games/images/vampire.jpg")).toBe(false);
  });

  // The whole reason this parses rather than calling includes(): the store
  // domain appears in this hostname, but the host is the attacker's.
  it("rejects a lookalike hostname that merely contains the store domain", () => {
    expect(isUploadedBlobUrl("https://public.blob.vercel-storage.com.example.com/x")).toBe(false);
  });

  // Review Focus 4: the same host, spelled two ways the URL parser preserves.
  it("recognises the host whatever its case, and with a trailing dot", () => {
    expect(isUploadedBlobUrl("HTTPS://X.PUBLIC.BLOB.VERCEL-STORAGE.COM./k")).toBe(true);
  });

  it("rejects a value that is not a URL at all, rather than throwing", () => {
    expect(isUploadedBlobUrl("not a url")).toBe(false);
    expect(isUploadedBlobUrl("")).toBe(false);
  });

  it("rejects http, since the store is only ever served over https", () => {
    expect(isUploadedBlobUrl("http://abc123.public.blob.vercel-storage.com/k")).toBe(false);
  });
});

describe("isOwnUploadedBlobUrl", () => {
  it("accepts a key under the caller's own prefix", () => {
    expect(isOwnUploadedBlobUrl(`${STORE}/uploads/${USER}/cat-x1y2.jpg`, USER)).toBe(true);
  });

  it("refuses a key under another user's prefix", () => {
    const other = "8f2b1c44-0000-4000-8000-000000000002";
    expect(isOwnUploadedBlobUrl(`${STORE}/uploads/${other}/cat-x1y2.jpg`, USER)).toBe(false);
  });

  // Review Focus 5: on our store, but not something this feature uploaded.
  it("refuses a blob with no uploads/ prefix at all", () => {
    expect(isOwnUploadedBlobUrl(`${STORE}/legacy/cat.jpg`, USER)).toBe(false);
  });

  it("refuses an external URL even when the path looks right", () => {
    expect(isOwnUploadedBlobUrl(`https://example.com/uploads/${USER}/cat.jpg`, USER)).toBe(false);
  });

  it("builds the prefix the route handler and the component agree on", () => {
    expect(uploadPrefix(USER)).toBe(`uploads/${USER}/`);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `just test --test-name-pattern "isUploadedBlobUrl"`
Expected: FAIL — cannot find module `./image-uploads`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/image-uploads.ts

/** The content types the upload route issues tokens for, and the only ones the field offers. */
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** The largest upload the route will authorise. The field refuses the same size client-side. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * Where one user's uploads live. The user id in the key is not access control
 * — the store is public — it is what lets the delete action prove a blob is
 * the caller's own before it removes anything.
 */
export function uploadPrefix(userId: string): string {
  return `uploads/${userId}/`;
}

/**
 * Whether a stored value is a blob this app uploaded, as opposed to a link a
 * user typed.
 *
 * Deliberately parses rather than testing the raw string. A host such as
 * `public.blob.vercel-storage.com.example.com` contains the store domain, so
 * a substring test would hand an attacker a URL the delete action treats as
 * ours. Parsing first and testing the hostname is what makes the check mean
 * what it says. The hostname is lowercased and a trailing root dot dropped,
 * both of which the URL parser preserves and neither of which changes the
 * host.
 */
export function isUploadedBlobUrl(value: string): boolean {
  const url = parse(value);
  return url !== null && hostname(url).endsWith(BLOB_HOST_SUFFIX);
}

/** As isUploadedBlobUrl, and the key is under this user's own prefix. */
export function isOwnUploadedBlobUrl(value: string, userId: string): boolean {
  const url = parse(value);
  if (url === null || !hostname(url).endsWith(BLOB_HOST_SUFFIX)) return false;
  return url.pathname.startsWith(`/${uploadPrefix(userId)}`);
}

function parse(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // The store is served over https only, so anything else is not ours.
  return url.protocol === "https:" ? url : null;
}

function hostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `just test --test-name-pattern "isUploadedBlobUrl"`
Expected: PASS, and the `isOwnUploadedBlobUrl` and limits describes pass too.

- [ ] **Step 5: Stage, do not commit**

```bash
git add apps/web/src/lib/image-uploads.ts apps/web/src/lib/image-uploads.test.ts
```

---

### Task 2: The upload route handler

**Files:**
- Create: `apps/web/src/app/api/blob/upload/route.ts`
- Test: `apps/web/src/app/api/blob/upload/route.test.ts`
- Modify: `apps/web/package.json` (add `@vercel/blob`), `apps/web/technologies.md`, `apps/web/docs/standards.md`

**Interfaces:**
- Consumes: `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES`, `uploadPrefix` from Task 1.
- Produces: `POST /api/blob/upload`, the endpoint the component passes as `handleUploadUrl`.

**Before the test:** provision the store and the dependency.

```bash
npm install @vercel/blob --workspace apps/web
vercel blob create-store storyteller-images --access public
vercel env pull apps/web/.env.local
```

If the Vercel CLI is not installed, `npm i -g vercel` first. The store must exist before any manual check against a real upload; the tests below do not need it.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/app/api/blob/upload/route.test.ts
import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

const USER = "8f2b1c44-0000-4000-8000-000000000001";

// requireUser() is the real gate; mocking it is how this test drives the two
// answers the route has to tell apart — no session, and a session whose user
// is asking for someone else's prefix.
//
// The class is declared here and handed to the mocked module, so the instance
// thrown below is the very class the route's `catch` checks with instanceof.
// A bare Error would fall through to the 400 branch and the 401 case would
// pass for the wrong reason.
class UnauthorizedError extends Error {}

const requireUser = mock.fn<() => Promise<{ id: string }>>(async () => ({ id: USER }));

let POST: typeof import("./route").POST;

function tokenRequest(pathname: string): Request {
  return new Request("http://localhost/api/blob/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname, callbackUrl: "http://localhost/api/blob/upload", multipart: false },
    }),
  });
}

describe("POST /api/blob/upload", () => {
  before(async () => {
    mock.module("@/lib/authorize", { namedExports: { requireUser, UnauthorizedError } });
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    requireUser.mock.resetCalls();
    requireUser.mock.mockImplementation(async () => ({ id: USER }));
  });

  it("refuses to issue a token when nobody is signed in", async () => {
    requireUser.mock.mockImplementation(async () => {
      throw new UnauthorizedError("not signed in");
    });

    const response = await POST(tokenRequest(`uploads/${USER}/cat.jpg`));

    expect(response.status).toBe(401);
  });

  // The client sends the pathname, so the server is the only place the
  // prefix can be enforced. Without this check any signed-in user could
  // write into another user's prefix and defeat the delete check.
  it("refuses a pathname under another user's prefix", async () => {
    const other = "8f2b1c44-0000-4000-8000-000000000002";

    const response = await POST(tokenRequest(`uploads/${other}/cat.jpg`));

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `just test --test-name-pattern "POST /api/blob/upload"`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/app/api/blob/upload/route.ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser, UnauthorizedError } from "@/lib/authorize";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, uploadPrefix } from "@/lib/image-uploads";

/**
 * Issues the short-lived token the browser uses to upload straight to Vercel
 * Blob.
 *
 * This is the one write path in the app that is a route handler rather than a
 * server action, and it is deliberate: `upload()` from `@vercel/blob/client`
 * needs an HTTP endpoint it can POST to for a token, and a server action
 * cannot serve that role. The authorisation is not weaker for it — the same
 * `requireUser()` every action opens with runs here before a token is issued.
 *
 * `onUploadCompleted` is not used. Vercel calls it from their own network, so
 * it never fires against localhost, and nothing needs it: the browser gets
 * the URL back from `upload()` directly.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await requireUser();

        // The client chooses the pathname, so this is the only place the
        // prefix can be enforced. Without it a signed-in user could write
        // into someone else's prefix and make the delete check meaningless.
        if (!pathname.startsWith(uploadPrefix(user.id))) {
          throw new Error("That upload path does not belong to you.");
        }

        return {
          allowedContentTypes: [...ALLOWED_IMAGE_TYPES],
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "You need to be signed in to do that." }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Upload could not be authorised.";
    return Response.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `just test --test-name-pattern "POST /api/blob/upload"`
Expected: PASS, both cases.

- [ ] **Step 5: Record the dependency and the exception**

Add to `apps/web/technologies.md`, under the NextJS bullet's nested list:

```markdown
  - @vercel/blob for image uploads, browser-direct to a public store
```

Add to `apps/web/docs/standards.md`, in the "Server components, client components and actions" list, after the "Every read and write is a server action" bullet:

```markdown
- **One exception, and only one: `app/api/blob/upload/route.ts`.** `upload()`
  from `@vercel/blob/client` needs an HTTP endpoint to POST to for a token,
  which a server action cannot be. It opens with the same `requireUser()` an
  action does, and it checks the client-supplied pathname against that user's
  own prefix. Uploading is the only thing that earns a route handler; adding
  another needs the same kind of reason.
```

- [ ] **Step 6: Run the whole suite, then stage**

Run: `just test`
Expected: green.

```bash
git add apps/web/src/app/api/blob/upload/ apps/web/package.json apps/web/package-lock.json \
        apps/web/technologies.md apps/web/docs/standards.md
```

---

### Task 3: The delete action

**Files:**
- Create: `apps/web/src/components/uploads/actions.ts`
- Test: `apps/web/src/components/uploads/actions.test.ts`

**Interfaces:**
- Consumes: `isOwnUploadedBlobUrl` from Task 1.
- Produces: `sa_deleteUploadedImage(url: string): Promise<void>`.

The action lives beside the component rather than under a route because no single page owns the field, the same reason `components/feedback/actions.ts` sits where it does.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/uploads/actions.test.ts
import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

const USER = "8f2b1c44-0000-4000-8000-000000000001";
const OTHER = "8f2b1c44-0000-4000-8000-000000000002";
const STORE = "https://abc123.public.blob.vercel-storage.com";

const del = mock.fn<(url: string) => Promise<void>>(async () => {});
const requireUser = mock.fn<() => Promise<{ id: string }>>(async () => ({ id: USER }));

let sa_deleteUploadedImage: typeof import("./actions").sa_deleteUploadedImage;

describe("sa_deleteUploadedImage", () => {
  before(async () => {
    mock.module("@vercel/blob", { namedExports: { del } });
    mock.module("@/lib/authorize", { namedExports: { requireUser } });
    ({ sa_deleteUploadedImage } = await import("./actions"));
  });

  beforeEach(() => {
    del.mock.resetCalls();
    requireUser.mock.resetCalls();
  });

  it("deletes a blob under the caller's own prefix", async () => {
    const url = `${STORE}/uploads/${USER}/cat-x1y2.jpg`;

    await sa_deleteUploadedImage(url);

    expect(del.mock.callCount()).toBe(1);
    expect(del.mock.calls[0].arguments[0]).toBe(url);
  });

  it("refuses a blob under another user's prefix and deletes nothing", async () => {
    await sa_deleteUploadedImage(`${STORE}/uploads/${OTHER}/cat-x1y2.jpg`);

    expect(del.mock.callCount()).toBe(0);
  });

  // Review Focus 5.
  it("refuses a blob on our store with no uploads/ prefix", async () => {
    await sa_deleteUploadedImage(`${STORE}/legacy/cat.jpg`);

    expect(del.mock.callCount()).toBe(0);
  });

  it("refuses an external URL, which is not ours to delete", async () => {
    await sa_deleteUploadedImage("https://rpg.irun.games/images/vampire.jpg");

    expect(del.mock.callCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `just test --test-name-pattern "sa_deleteUploadedImage"`
Expected: FAIL — cannot find module `./actions`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/components/uploads/actions.ts
"use server";

import { del } from "@vercel/blob";
import { requireUser } from "@/lib/authorize";
import { isOwnUploadedBlobUrl } from "@/lib/image-uploads";

/**
 * Removes a blob the caller uploaded, when they replace or clear the picture.
 *
 * Refusing is silent on purpose. The user asked for the image to be off the
 * story, and it is; a blob left behind is the sweep's problem, not something
 * to interrupt them with. That also covers the shared-story case: if one
 * storyteller replaces a picture another uploaded, the check refuses, the
 * replacement still succeeds, and the old blob becomes an orphan. Failing in
 * that direction is the safe one.
 */
export async function sa_deleteUploadedImage(url: string): Promise<void> {
  const user = await requireUser();

  if (!isOwnUploadedBlobUrl(url, user.id)) return;

  await del(url);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `just test --test-name-pattern "sa_deleteUploadedImage"`
Expected: PASS, all four cases.

- [ ] **Step 5: Stage, do not commit**

```bash
git add apps/web/src/components/uploads/
```

---

### Task 4: The field's three states

**Files:**
- Create: `apps/web/src/components/uploads/image-upload-field.tsx`
- Test: `apps/web/src/components/uploads/image-upload-field.test.tsx`

**Interfaces:**
- Consumes: `isUploadedBlobUrl`, `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES` from Task 1.
- Produces: `ImageUploadField({ value, onChange, label?, invalid? })`, a controlled field.

This task builds rendering only: which controls each of the three states shows. Task 5 adds uploading and deleting.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/uploads/image-upload-field.test.tsx
import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

const BLOB = "https://abc123.public.blob.vercel-storage.com/uploads/u1/cat-x1y2.jpg";
const EXTERNAL = "https://rpg.irun.games/images/vampire.jpg";

let ImageUploadField: typeof import("./image-upload-field").ImageUploadField;

describe("ImageUploadField states", () => {
  before(async () => {
    mock.module("@vercel/blob/client", { namedExports: { upload: async () => ({ url: BLOB }) } });
    mock.module("./actions", { namedExports: { sa_deleteUploadedImage: async () => {} } });
    mock.module("@/components/auth/user-provider", {
      namedExports: { useUser: () => ({ id: "u1" }) },
    });
    ({ ImageUploadField } = await import("./image-upload-field"));
  });

  it("offers a URL box and a dropzone when there is no image yet", () => {
    renderWithProviders(<ImageUploadField value="" onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: /image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /drag an image/i })).toBeInTheDocument();
  });

  it("shows an external URL in the box so it can still be edited", () => {
    renderWithProviders(<ImageUploadField value={EXTERNAL} onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: /image/i })).toHaveValue(EXTERNAL);
  });

  // The point of hiding it: a blob URL is noise in a text box, and an empty
  // box in this state is a control that can only do harm. Queried by role so
  // this fails honestly if the input is merely visually hidden.
  it("renders no URL box at all once the value is an uploaded blob", () => {
    renderWithProviders(<ImageUploadField value={BLOB} onChange={() => {}} />);

    expect(screen.queryByRole("textbox", { name: /image/i })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /current image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove image/i })).toBeInTheDocument();
  });

  it("writes what the user types into the box straight to the field", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(url: string) => void>();

    renderWithProviders(<ImageUploadField value="" onChange={onChange} />);
    await user.type(screen.getByRole("textbox", { name: /image/i }), "h");

    expect(onChange.mock.callCount()).toBe(1);
    expect(onChange.mock.calls[0].arguments[0]).toBe("h");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `just test --test-name-pattern "ImageUploadField states"`
Expected: FAIL — cannot find module `./image-upload-field`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/components/uploads/image-upload-field.tsx
"use client";

import { Field, FileUpload, Image, Input, Link, Stack } from "@chakra-ui/react";
import { Upload, X } from "lucide-react";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, isUploadedBlobUrl } from "@/lib/image-uploads";

type Props = {
  /** The URL the form holds: an external link, an uploaded blob, or empty. */
  value: string;
  onChange: (url: string) => void;
  label?: string;
  invalid?: boolean;
};

/**
 * One picture for a form, filled either by typing a link or by uploading a
 * file. Controlled, so a form binds it through `Controller` rather than
 * `register()`: in the uploaded state there is no native input holding the
 * URL at all.
 */
export function ImageUploadField({
  value,
  onChange,
  label = "Image (optional)",
  invalid,
}: Props) {
  const uploaded = isUploadedBlobUrl(value);

  return (
    <Field.Root invalid={invalid}>
      <Field.Label>{label}</Field.Label>

      <Stack gap="3" direction={{ base: "column", sm: "row" }} align={{ sm: "flex-start" }} w="full">
        <Stack gap="2" flex="1" w="full">
          {/* Hidden once the value is an uploaded blob: that URL is not
              something the user can usefully edit, and an empty box there is
              a control that could only overwrite what is stored. Removing the
              image brings it back, which is how a blob is swapped for a link. */}
          {!uploaded && (
            <Input
              type="url"
              placeholder="https://"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          )}

          <FileUpload.Root
            accept={[...ALLOWED_IMAGE_TYPES]}
            maxFiles={1}
            maxFileSize={MAX_IMAGE_BYTES}
          >
            <FileUpload.HiddenInput />
            <FileUpload.Dropzone aria-label="Drag an image here, or browse for one" minH="24">
              <Upload />
              <FileUpload.DropzoneContent>Drag an image, or browse</FileUpload.DropzoneContent>
            </FileUpload.Dropzone>
          </FileUpload.Root>
        </Stack>

        {value && (
          <Stack gap="1" align="center">
            {/* The thumbnail carries the identity when no box shows the URL,
                so the address stays reachable for anyone who needs it. */}
            <Link href={value} target="_blank" rel="noreferrer">
              <Image src={value} alt="Current image" maxH="24" rounded="md" />
            </Link>
            <button type="button" aria-label="Remove image" onClick={() => onChange("")}>
              <X size={16} />
            </button>
          </Stack>
        )}
      </Stack>

      <Field.ErrorText />
    </Field.Root>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `just test --test-name-pattern "ImageUploadField states"`
Expected: PASS, all four cases. If the dropzone is not found by role `button`, query it by its `aria-label` with `getByLabelText` and keep the label text identical.

- [ ] **Step 5: Stage, do not commit**

```bash
git add apps/web/src/components/uploads/image-upload-field.tsx \
        apps/web/src/components/uploads/image-upload-field.test.tsx
```

---

### Task 5: Uploading, removing, and the in-flight rules

**Files:**
- Modify: `apps/web/src/components/uploads/image-upload-field.tsx`
- Test: `apps/web/src/components/uploads/image-upload-field.test.tsx` (add a second describe)

**Interfaces:**
- Consumes: `upload` from `@vercel/blob/client`, `sa_deleteUploadedImage` from Task 3, `useUser` from `@/components/auth/user-provider`, `uploadPrefix` from Task 1.
- Produces: no new exports; the same component gains `isUploading` behaviour and calls the delete action.

This task owns Review Focus 1, 2 and 3.

- [ ] **Step 1: Write the failing test**

```tsx
// appended to apps/web/src/components/uploads/image-upload-field.test.tsx
import { waitFor } from "@testing-library/react";

const URL_A = "https://abc123.public.blob.vercel-storage.com/uploads/u1/a-1111.jpg";
const URL_B = "https://abc123.public.blob.vercel-storage.com/uploads/u1/b-2222.jpg";

/** A promise this test resolves by hand, for driving in-flight and out-of-order cases. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

describe("ImageUploadField uploading", () => {
  const upload = mock.fn<(path: string, file: File, options: unknown) => Promise<{ url: string }>>(
    async () => ({ url: URL_A }),
  );
  const sa_deleteUploadedImage = mock.fn<(url: string) => Promise<void>>(async () => {});

  let ImageUploadField: typeof import("./image-upload-field").ImageUploadField;

  before(async () => {
    mock.module("@vercel/blob/client", { namedExports: { upload } });
    mock.module("./actions", { namedExports: { sa_deleteUploadedImage } });
    mock.module("@/components/auth/user-provider", {
      namedExports: { useUser: () => ({ id: "u1" }) },
    });
    ({ ImageUploadField } = await import("./image-upload-field"));
  });

  beforeEach(() => {
    upload.mock.resetCalls();
    upload.mock.mockImplementation(async () => ({ url: URL_A }));
    sa_deleteUploadedImage.mock.resetCalls();
    sa_deleteUploadedImage.mock.mockImplementation(async () => {});
  });

  it("writes the returned URL to the field when an upload succeeds", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(url: string) => void>();

    const { container } = renderWithProviders(<ImageUploadField value="" onChange={onChange} />);
    await user.upload(fileInput(container), imageFile("cat.jpg"));

    await waitFor(() => expect(onChange.mock.callCount()).toBe(1));
    expect(onChange.mock.calls[0].arguments[0]).toBe(URL_A);
    // The key is the caller's own prefix, which the route handler enforces.
    expect(upload.mock.calls[0].arguments[0]).toBe("uploads/u1/cat.jpg");
  });

  // Review Focus 2: a failed replacement must never cost the user the picture
  // they already had.
  it("keeps the current image and reports inline when an upload fails", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(url: string) => void>();
    upload.mock.mockImplementation(async () => {
      throw new Error("network");
    });

    const { container } = renderWithProviders(
      <ImageUploadField value={EXTERNAL} onChange={onChange} />,
    );
    await user.upload(fileInput(container), imageFile("cat.jpg"));

    expect(await screen.findByText(/could not be uploaded/i)).toBeInTheDocument();
    expect(onChange.mock.callCount()).toBe(0);
    expect(screen.getByRole("img", { name: /current image/i })).toHaveAttribute("src", EXTERNAL);
  });

  // Review Focus 1: without this, a form submitted mid-upload saves an empty
  // image and the user never learns why.
  it("marks the dropzone busy while an upload is in flight", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ url: string }>();
    upload.mock.mockImplementation(() => pending.promise);

    const { container } = renderWithProviders(<ImageUploadField value="" onChange={() => {}} />);
    await user.upload(fileInput(container), imageFile("cat.jpg"));

    const dropzone = await screen.findByLabelText(/drag an image/i);
    await waitFor(() => expect(dropzone).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    pending.resolve({ url: URL_A });
    await waitFor(() => expect(dropzone).toHaveAttribute("aria-disabled", "false"));
  });

  // Review Focus 3: the first upload finishing last must not overwrite the
  // second one's result.
  it("keeps the last file chosen when two uploads finish out of order", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(url: string) => void>();
    const slow = deferred<{ url: string }>();
    upload.mock.mockImplementation(() => slow.promise);

    const { container } = renderWithProviders(<ImageUploadField value="" onChange={onChange} />);
    await user.upload(fileInput(container), imageFile("a.jpg"));

    // The second upload resolves at once, while the first is still pending.
    upload.mock.mockImplementation(async () => ({ url: URL_B }));
    await user.upload(fileInput(container), imageFile("b.jpg"));
    await waitFor(() => expect(onChange.mock.callCount()).toBe(1));

    // Now let the stale one land. It must be ignored.
    slow.resolve({ url: URL_A });
    await new Promise((r) => setTimeout(r, 0));

    expect(onChange.mock.callCount()).toBe(1);
    expect(onChange.mock.calls[0].arguments[0]).toBe(URL_B);
  });

  it("deletes the previous blob when a new file replaces it", async () => {
    const user = userEvent.setup();
    upload.mock.mockImplementation(async () => ({ url: URL_B }));

    const { container } = renderWithProviders(<ImageUploadField value={BLOB} onChange={() => {}} />);
    await user.upload(fileInput(container), imageFile("b.jpg"));

    await waitFor(() => expect(sa_deleteUploadedImage.mock.callCount()).toBe(1));
    expect(sa_deleteUploadedImage.mock.calls[0].arguments[0]).toBe(BLOB);
  });

  it("deletes the blob when the image is removed", async () => {
    const user = userEvent.setup();
    const onChange = mock.fn<(url: string) => void>();

    renderWithProviders(<ImageUploadField value={BLOB} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /remove image/i }));

    expect(onChange.mock.calls[0].arguments[0]).toBe("");
    await waitFor(() => expect(sa_deleteUploadedImage.mock.callCount()).toBe(1));
    expect(sa_deleteUploadedImage.mock.calls[0].arguments[0]).toBe(BLOB);
  });

  it("does not call the delete action when an external URL is replaced", async () => {
    const user = userEvent.setup();

    renderWithProviders(<ImageUploadField value={EXTERNAL} onChange={() => {}} />);
    await user.clear(screen.getByRole("textbox", { name: /image/i }));

    expect(sa_deleteUploadedImage.mock.callCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `just test --test-name-pattern "ImageUploadField uploading"`
Expected: FAIL — the component does not call `upload` yet.

- [ ] **Step 3: Write the implementation**

Add to the component:

```tsx
const { id: userId } = useUser();
const [isUploading, setIsUploading] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);
// Which upload is the current one. A second file chosen while the first is
// still going must win no matter which finishes first, so each upload takes
// a ticket and only the latest is allowed to write.
const latestUpload = useRef(0);

async function replaceWith(file: File) {
  const ticket = ++latestUpload.current;
  const previous = value;

  setIsUploading(true);
  setUploadError(null);
  try {
    const blob = await upload(`${uploadPrefix(userId)}${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
    });
    if (ticket !== latestUpload.current) return;

    onChange(blob.url);
    if (isUploadedBlobUrl(previous)) await sa_deleteUploadedImage(previous);
  } catch {
    if (ticket !== latestUpload.current) return;
    // The value is left exactly as it was: a failed replacement must never
    // cost the user the picture they already had.
    setUploadError("That image could not be uploaded. Please try again.");
  } finally {
    if (ticket === latestUpload.current) setIsUploading(false);
  }
}

async function remove() {
  const previous = value;
  onChange("");
  if (isUploadedBlobUrl(previous)) await sa_deleteUploadedImage(previous);
}
```

Wire `onFileAccept={({ files }) => replaceWith(files[0])}` and
`onFileReject={({ files }) => setUploadError(rejectionMessage(files[0]))}` onto
`FileUpload.Root`, put `aria-disabled={isUploading}` and a `Progress` on the
dropzone, point the remove button at `remove()`, and render `uploadError` in the
existing `Field.ErrorText`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `just test --test-name-pattern "ImageUploadField"`
Expected: PASS, both describes.

- [ ] **Step 5: Stage, do not commit**

```bash
git add apps/web/src/components/uploads/
```

---

### Task 6: The story form adopts the field

**Files:**
- Modify: `apps/web/src/components/stories/story-form.tsx:161-165`
- Test: `apps/web/src/components/stories/story-form.test.tsx`

**Interfaces:**
- Consumes: `ImageUploadField` from Task 4/5.
- Produces: nothing new; `storySchema` and the `imageUrl` field are unchanged.

`story-schemas.ts` is not touched. Its http(s) protocol pin still does real work, because a user can still type an arbitrary URL, and the docblock about the CSS `url("…")` sink on the story card stays accurate.

- [ ] **Step 1: Update the existing test**

In `story-form.test.tsx`, add `mock.module` entries for `@vercel/blob/client`, `@/components/uploads/actions` and the user provider alongside the existing story actions mock, then change the image assertions to drive the new field:

```tsx
it("submits an image URL typed into the picture field", async () => {
  const user = userEvent.setup();

  renderWithProviders(<StoryForm systems={systems} />);
  await user.type(screen.getByLabelText(/Title/), "Embers Leap");
  await user.type(screen.getByRole("textbox", { name: /image/i }), "https://example.com/a.jpg");
  await user.click(screen.getByRole("button", { name: "Create story" }));

  await waitFor(() => expect(sa_createStory.mock.callCount()).toBe(1));
  expect(sa_createStory.mock.calls[0].arguments[0]).toMatchObject({
    imageUrl: "https://example.com/a.jpg",
  });
});

it("shows an existing external image URL when editing", () => {
  renderWithProviders(<StoryForm systems={systems} story={existing} />);

  expect(screen.getByRole("textbox", { name: /image/i })).toHaveValue(
    "https://rpg.irun.games/images/vampire.jpg",
  );
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `just test --test-name-pattern "StoryForm"`
Expected: FAIL — the form still renders a bare `Input`, so the accessible name does not match.

- [ ] **Step 3: Replace the field**

Replace lines 161-165 of `story-form.tsx`:

```tsx
<Controller
  control={control}
  name="imageUrl"
  render={({ field }) => (
    <ImageUploadField
      value={field.value ?? ""}
      onChange={field.onChange}
      invalid={!!errors.imageUrl}
    />
  )}
/>
```

Add `import { ImageUploadField } from "@/components/uploads/image-upload-field";` to the imports, and drop `Input` from the `@chakra-ui/react` import only if no other field still uses it — `title` does, so it stays.

The field's own `Field.ErrorText` shows upload failures; `errors.imageUrl?.message` from the schema is passed through `invalid`, so keep both visible by rendering the schema message inside the component's error slot via the `invalid` prop and the form's existing error text.

- [ ] **Step 4: Run the test and watch it pass**

Run: `just test --test-name-pattern "StoryForm"`
Expected: PASS.

- [ ] **Step 5: Run the whole suite, then stage**

Run: `just test`
Expected: green.

```bash
git add apps/web/src/components/stories/story-form.tsx \
        apps/web/src/components/stories/story-form.test.tsx
```

---

### Task 7: The orphan sweep

**Files:**
- Create: `apps/web/src/lib/blob-sweep.ts`
- Create: `apps/web/src/app/api/cron/blob-sweep/route.ts`
- Test: `apps/web/src/lib/blob-sweep.test.ts`, `apps/web/src/app/api/cron/blob-sweep/route.test.ts`
- Modify: the Vercel project config to add the daily schedule

**Interfaces:**
- Consumes: `isUploadedBlobUrl` from Task 1.
- Produces: `GRACE_MS: number`, `staleBlobs(blobs, referenced, now): string[]`, and `GET /api/cron/blob-sweep`.

The decision of what to delete is a pure function so it can be tested
exhaustively without standing up a database or a blob store. The route is then
a thin shell: authorise, read the referenced URLs, list, call `staleBlobs`,
delete.

- [ ] **Step 1: Write the failing test for the decision**

```ts
// apps/web/src/lib/blob-sweep.test.ts
import { describe, it } from "node:test";
import { expect } from "expect";

import { GRACE_MS, staleBlobs } from "./blob-sweep";

const STORE = "https://abc123.public.blob.vercel-storage.com";
const OLD = new Date("2026-09-20T00:00:00Z");
const RECENT = new Date("2026-09-27T23:50:00Z");
const NOW = new Date("2026-09-28T00:00:00Z");

describe("staleBlobs", () => {
  it("waits a day before considering anything an orphan", () => {
    expect(GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("deletes a blob no row references once it is past the grace period", () => {
    const blobs = [{ url: `${STORE}/uploads/u1/a.jpg`, uploadedAt: OLD }];

    expect(staleBlobs(blobs, new Set(), NOW)).toEqual([`${STORE}/uploads/u1/a.jpg`]);
  });

  // The case the grace period exists for: an image uploaded into a form the
  // user has not submitted yet is referenced by nothing, and deleting it
  // would take the picture out from under them mid-edit.
  it("keeps an unreferenced blob that was uploaded minutes ago", () => {
    const blobs = [{ url: `${STORE}/uploads/u1/a.jpg`, uploadedAt: RECENT }];

    expect(staleBlobs(blobs, new Set(), NOW)).toEqual([]);
  });

  it("keeps an old blob that a row still references", () => {
    const url = `${STORE}/uploads/u1/a.jpg`;
    const blobs = [{ url, uploadedAt: OLD }];

    expect(staleBlobs(blobs, new Set([url]), NOW)).toEqual([]);
  });

  it("sorts the wheat from the chaff in one pass", () => {
    const kept = `${STORE}/uploads/u1/kept.jpg`;
    const fresh = `${STORE}/uploads/u1/fresh.jpg`;
    const orphan = `${STORE}/uploads/u1/orphan.jpg`;
    const blobs = [
      { url: kept, uploadedAt: OLD },
      { url: fresh, uploadedAt: RECENT },
      { url: orphan, uploadedAt: OLD },
    ];

    expect(staleBlobs(blobs, new Set([kept]), NOW)).toEqual([orphan]);
  });

  it("treats a blob exactly on the boundary as still within its grace", () => {
    const blobs = [{ url: `${STORE}/uploads/u1/a.jpg`, uploadedAt: new Date(NOW.getTime() - GRACE_MS) }];

    expect(staleBlobs(blobs, new Set(), NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `just test --test-name-pattern "staleBlobs"`
Expected: FAIL — cannot find module `./blob-sweep`.

- [ ] **Step 3: Write the decision**

```ts
// apps/web/src/lib/blob-sweep.ts

/** How long a blob is left alone before the sweep will consider it an orphan. */
export const GRACE_MS = 24 * 60 * 60 * 1000;

type SweepableBlob = { url: string; uploadedAt: Date };

/**
 * Which blobs the sweep should delete: the ones no row points at any more.
 *
 * The grace period is what makes this safe rather than a race. An image
 * uploaded into a form the user has not submitted yet is referenced by
 * nothing, so without it the sweep would delete that image mid-edit. A blob
 * exactly on the boundary is kept, because the cheap mistake is waiting
 * another day and the expensive one is deleting a picture someone is using.
 */
export function staleBlobs(
  blobs: SweepableBlob[],
  referenced: Set<string>,
  now: Date,
): string[] {
  const cutoff = now.getTime() - GRACE_MS;
  return blobs
    .filter((blob) => !referenced.has(blob.url) && blob.uploadedAt.getTime() < cutoff)
    .map((blob) => blob.url);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `just test --test-name-pattern "staleBlobs"`
Expected: PASS, all six cases.

- [ ] **Step 5: Write the failing test for the route's gate**

```ts
// apps/web/src/app/api/cron/blob-sweep/route.test.ts
import { before, describe, it, mock } from "node:test";
import { expect } from "expect";

const list = mock.fn(async () => ({ blobs: [], cursor: undefined }));
const del = mock.fn<(urls: string | string[]) => Promise<void>>(async () => {});

let GET: typeof import("./route").GET;

describe("GET /api/cron/blob-sweep", () => {
  before(async () => {
    process.env.CRON_SECRET = "s3cret";
    mock.module("@vercel/blob", { namedExports: { list, del } });
    ({ GET } = await import("./route"));
  });

  function request(authorization?: string): Request {
    return new Request("http://localhost/api/cron/blob-sweep", {
      headers: authorization ? { authorization } : {},
    });
  }

  it("refuses a request with no bearer token and lists nothing", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(list.mock.callCount()).toBe(0);
  });

  it("refuses a request with the wrong bearer token", async () => {
    const response = await GET(request("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(list.mock.callCount()).toBe(0);
  });
});
```

- [ ] **Step 6: Run the test and watch it fail**

Run: `just test --test-name-pattern "blob-sweep"`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 7: Write the route**

```ts
// apps/web/src/app/api/cron/blob-sweep/route.ts
import { del, list } from "@vercel/blob";
import { db, schema } from "@/db";
import { staleBlobs } from "@/lib/blob-sweep";
import { isUploadedBlobUrl } from "@/lib/image-uploads";

const { stories, storySessions, storyScenes } = schema;

/**
 * Deletes uploaded images no row points at any more: the ones left behind
 * when a user abandons a form, or replaces a picture someone else uploaded
 * and the delete action rightly refuses.
 *
 * Daily rather than hourly because `list()` is an advanced operation and
 * `del()` is free, so the cost of this job is almost entirely in the listing.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = await Promise.all([
    db.select({ url: stories.imageUrl }).from(stories),
    db.select({ url: storySessions.imageLink }).from(storySessions),
    db.select({ url: storyScenes.imageLink }).from(storyScenes),
  ]);

  const referenced = new Set(
    rows
      .flat()
      .map((row) => row.url)
      .filter((url): url is string => !!url && isUploadedBlobUrl(url)),
  );

  const now = new Date();
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const page = await list({ cursor, limit: 250 });
    const stale = staleBlobs(page.blobs, referenced, now);
    if (stale.length > 0) {
      await del(stale);
      deleted += stale.length;
    }
    cursor = page.cursor;
  } while (cursor);

  return Response.json({ deleted });
}
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `just test --test-name-pattern "blob-sweep"`
Expected: PASS, both cases.

- [ ] **Step 9: Schedule it**

Add a daily cron entry pointing at `/api/cron/blob-sweep` in the Vercel project config, and set `CRON_SECRET` in the project's environment variables. Check which config file the repo uses before editing; if neither `vercel.json` nor `vercel.ts` exists, create `vercel.ts` with `@vercel/config`, which is the current recommendation, and add a `@vercel/config` bullet to `technologies.md`.

- [ ] **Step 10: Run the whole suite, then stage**

Run: `just test`
Expected: green.

```bash
git add apps/web/src/lib/blob-sweep.ts apps/web/src/lib/blob-sweep.test.ts \
        apps/web/src/app/api/cron/
```

---

## After the plan

The scene create/edit form is the next piece of work. It was designed in conversation on the bounded path and deliberately has no plan document; it builds on `ImageUploadField` from this plan.
