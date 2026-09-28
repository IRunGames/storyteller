# Image upload field design

> **Superseded** by [`2026-09-28-attachments-design.md`](2026-09-28-attachments-design.md).
> The Blob store, the upload route handler and the component's own design still
> stand; the data model does not — image addresses now live in `attachments`
> rows rather than in a column on the parent.

Date: 2026-09-28
Status: approved in conversation, awaiting implementation

## Goal

Give the app one reusable form control for pictures: a responsive Chakra
`FileUpload` wired to Vercel Blob that any react-hook-form form can bind to an
existing image URL column. The user either pastes an external link or uploads a
file, and the field holds one string either way.

The stories page spec of 2026-09-20 listed "image upload to Vercel Blob" as out
of scope. This is that work.

## Scope

In scope:

- A public Vercel Blob store and the `@vercel/blob` dependency.
- `POST /api/blob/upload`, the client-upload token endpoint.
- `ImageUploadField`, the shared component, and its delete action.
- `isUploadedBlobUrl()`, the shared URL helper.
- A daily cron route that sweeps unreferenced blobs.
- `story-form.tsx` adopting the component in place of its `Input type="url"`.
- Tests as listed below.

Out of scope (later work): adopting the field in the scene and session forms
(`story_scenes.image_link`, `story_sessions.image_link`), image resizing or
transformation, multiple images per row, and rewording the "an address rather
than an upload" comment on `story_scenes.image_link`, which stays accurate
until scenes adopt this.

No migration. The three image columns already exist and keep holding a URL;
an upload simply produces one.

## Provisioning

One public store, created once:

```bash
vercel blob create-store storyteller-images --access public
vercel env pull apps/web/.env.local
```

Public rather than private because these are scene pictures and story art, not
secrets. A public blob is fetched by the browser straight from the store, so it
costs Blob Data Transfer alone; a private one streams through a function and
pays both legs. The component also stays simpler, because the stored URL is
directly usable in `<img src>` with no presigning.

`BLOB_READ_WRITE_TOKEN` lands in `apps/web/.env.local`. Note that local
development otherwise runs against local Postgres, so this is the first env var
the web app needs from Vercel itself.

## The upload route handler

`apps/web/src/app/api/blob/upload/route.ts`, joining `api/auth/[...all]` as the
only route handlers in the app.

It calls `handleUpload` from `@vercel/blob/client`. Inside
`onBeforeGenerateToken` it does what every server action does — `await
requireUser()` — and returns a token restricted to:

- `allowedContentTypes`: `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- `maximumSizeInBytes`: 10 MB
- `addRandomSuffix: true`

Keys are `uploads/<user-id>/<uuid>.<ext>`. The user-id segment is not access
control, since the store is public; it is what lets the delete action prove a
blob is the caller's own.

**Why this is a route handler and not a server action.** `upload()` from
`@vercel/blob/client` needs an HTTP endpoint it can POST to for a token, and a
server action cannot serve that role. It is a deliberate, single exception to
the rule that every read and write is a server action, and `standards.md` gets
a bullet saying so with this reason, so it does not read as licence to add
route handlers freely. The authorisation is not weakened: `requireUser()` runs
here exactly as it does in an action.

`onUploadCompleted` is not used. It never fires against localhost, because
Vercel calls it from their own network, and the design does not need it: the
browser receives the URL from `upload()` directly.

## Shared helper

`apps/web/src/lib/blob-urls.ts`, no React in it:

```ts
export function isUploadedBlobUrl(value: string): boolean;
```

It parses with `new URL()` inside a try/catch and tests the **parsed hostname**
for the suffix `.public.blob.vercel-storage.com`.

Deliberately not `includes()` on the raw string. A URL whose host merely ends
with the store domain as a label prefix, such as one on
`public.blob.vercel-storage.com.example.com`, contains that text, so a
substring test would hand an attacker a URL the delete action treats as ours.
Parsing first and checking the hostname is what makes the test mean what it
says.

Three callers, and it matters that they agree: the component uses it to decide
whether to render the URL input and whether to call the delete action, and
`sa_deleteUploadedImage` uses it as the first half of its ownership check.

## The component

`apps/web/src/components/uploads/image-upload-field.tsx`, a client component.

```ts
type ImageUploadFieldProps = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  invalid?: boolean;
  maxFileSize?: number;
};
```

Controlled, so forms bind it through `Controller` rather than `register()`.
The standards already give that rule for Chakra checkboxes; here it is
stronger, because no native input holds the URL in the uploaded state at all.

### Three states

| Current value | Renders                                          |
| ------------- | ------------------------------------------------ |
| Empty         | URL input + dropzone                             |
| External URL  | URL input holding it + dropzone + preview        |
| Uploaded blob | preview + remove + dropzone, **no URL input**    |

The URL input is hidden exactly when `isUploadedBlobUrl(value)`. A blob URL is
noise in a text box: the user cannot meaningfully edit it, and the thumbnail
already says what is stored. Pressing remove clears the value, which brings the
input back, and that is how someone swaps an uploaded image for an external
link. One extra click on a rare path buys a common case with no dead control
in it.

Hiding the control also removes a failure mode rather than defending against
it. An empty-but-rendered input risks writing `""` over a stored blob URL on
any later refactor toward `value={field.value}`; with no input in that state
there is nothing to write.

### Markup and behaviour

Built from `FileUpload.Root` / `Dropzone` / `DropzoneContent` / `Trigger` /
`HiddenInput` with `maxFiles={1}`, `accept` matching the route handler's
allowed types, and `maxFileSize` matching its byte limit, so the client refuses
what the server would refuse.

`onFileAccept` calls `upload()` with `handleUploadUrl: "/api/blob/upload"` and
an `onUploadProgress` feeding a Chakra `Progress`; on success it calls
`onChange(blob.url)`.

The URL input writes on change, as `register("imageUrl")` does today, so
validation stays on submit and a half-typed URL does not flash an error
mid-keystroke.

### Layout and accessibility

Both affordances sit inside one `Field.Root` with one `Field.ErrorText`, so a
bad URL and a rejected file report in the same place.

`Field.Label` labels the URL input. The dropzone carries its own `aria-label`,
because a single label pointing at two controls names neither properly.
`FileUpload.Trigger` is a real button, so "browse" works from the keyboard and
the dropzone is never the only way in.

Preview and dropzone are a `Stack`, `column` at `base` and `row` from `sm`,
with the dropzone keeping a comfortable touch target at narrow widths.

When the value is an uploaded blob the thumbnail is a link that opens the image
in a new tab, so the URL stays reachable even though no input shows it.

## Delete on replace

`apps/web/src/components/uploads/actions.ts`, beside the component because no
single page owns it:

```ts
export async function sa_deleteUploadedImage(url: string): Promise<void>;
```

`requireUser()`, then two independent conditions before anything is deleted:
`isUploadedBlobUrl(url)`, and the key beginning `uploads/<user.id>/`. Then
`del(url)`.

The component calls it in exactly two cases: the user uploads a new file over
an existing blob, or presses remove. Those are the only two transitions out of
the uploaded state, because the URL input is not rendered while the value is a
blob: there is no way to type over one without removing it first. Hiding the
input is what makes the delete rule this short — there is no keystroke path to
debounce or guess intent about.

Clearing or replacing an external URL calls nothing at all: the component
checks `isUploadedBlobUrl` on the outgoing value before invoking the action, so
the action's own check is a second line of defence rather than the first.

The ownership check has a deliberate consequence. If one GM replaces an image
another uploaded to a shared story, the delete is refused, the replace still
succeeds, and the old blob becomes an orphan. That is the safe direction to
fail.

## Cleanup sweep

`apps/web/src/app/api/cron/blob-sweep/route.ts`, guarded by `CRON_SECRET` in an
`Authorization: Bearer` header, scheduled daily in the Vercel project config.

It pages through `list()`, gathers every URL referenced by `stories.image_url`,
`story_sessions.image_link` and `story_scenes.image_link`, and deletes blobs
referenced by none — **but only those whose `uploadedAt` is more than 24 hours
ago**. Without that grace period the sweep would delete an image sitting in a
form the user has not submitted yet; it is what makes this safe rather than a
race.

`del()` is free. `list()` is an advanced operation, so the sweep runs daily
rather than hourly.

## Form changes

`story-schemas.ts` is unchanged. The http(s) protocol pin still does real work,
because the user can still type an arbitrary URL, and the docblock explaining
the CSS `url("…")` sink on the story card stays accurate. A Blob URL satisfies
the rule.

`story-form.tsx` replaces its `Input type="url"` with the component wrapped in
a `Controller` on the same `imageUrl` field. The label becomes `Image
(optional)`, since the field is no longer only a URL.

## Error handling

Inline, never toasted, per the standards: an oversized or wrong-type file and a
failed upload both land in the field's one `Field.ErrorText`, and the form
stays open. A rejected file leaves the current value untouched, so a failed
replace never loses the image already stored.

A failed `sa_deleteUploadedImage` is not surfaced to the user. The visible
outcome they asked for — the image is no longer on the story — has happened;
the residue is the sweep's problem.

## Tests

Written first, `node:test` + Testing Library through `renderWithProviders`,
mocking `@vercel/blob/client` and the actions module in `before` with a dynamic
import after.

`image-upload-field.test.tsx`:

- An accepted file calls `onChange` with the returned URL.
- An oversized or wrong-type file renders inline error text and does not call
  `onChange`.
- Remove calls the delete action and clears the value.
- A value that is an uploaded blob URL renders **no** URL input — queried by
  role, so it fails honestly if the input is merely visually hidden.
- A value that is an external URL renders that URL in the input.
- Replacing an external URL by typing another does not call the delete action.

`blob-urls.test.ts`:

- A real store URL passes; an external URL fails; the lookalike hostname
  `https://public.blob.vercel-storage.com.example.com/x` fails; a non-URL
  string fails rather than throwing.

`actions.test.ts` (hits the real database, skipped without `DATABASE_URL`):

- The delete refuses a key under another user's prefix.

`story-form.test.tsx`:

- The field round-trips into the submitted values.

## Dependencies and housekeeping

- `@vercel/blob` is new, so it gets a bullet in `technologies.md`. Vercel Blob
  is already named under Hosting there; this makes that true.
- `standards.md` gets the bullet recording the route-handler exception and its
  reason.
- `just test` must be green before this is considered done.
