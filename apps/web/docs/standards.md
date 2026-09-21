# Standards

How code in the web app is written, for AI agents and anyone new to the repo.
Every rule below names the file that shows it done properly: when in doubt,
copy the nearest existing example rather than inventing a new pattern.
[`technologies.md`](../technologies.md) is the list of what we use; this is
how we use it. Authentication has its own page, [`auth.md`](auth.md).

## Tone of the code

- **Every non-obvious decision carries a comment saying why.** Not what the
  code does, but why it is this way and not the obvious way. See the
  `cssUrlValue` docblock and the `aria-disabled` note in
  [`story-card.tsx`](../src/components/stories/story-card.tsx), or the tooltip
  wrapper comment in [`nav-notifications-bell.tsx`](../src/components/nav/nav-notifications-bell.tsx).
- Prose in comments, not bullet fragments. No analogies.
- Small, focused files: one component or one concern per file, tests beside it.

## Where things live

| Path                                                 | Holds                                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(public)`, `(auth)`, `(app)`, `(app)/(nav)` | Route groups by access tier; `(nav)` is every signed-in page that carries the menu bar. The group name is not part of the URL.                                                     |
| `src/app/<route>/actions.ts`                         | Server actions for that route. A component no single page owns keeps its action beside itself instead ([`components/feedback/actions.ts`](../src/components/feedback/actions.ts)). |
| `src/components/<area>/`                             | Client and server components grouped by feature (`nav`, `stories`, `auth`).                                                                                                        |
| `src/components/ui/`                                 | Only Chakra's generated snippets (`provider.tsx`, `color-mode.tsx`, `toaster.tsx`), added with `npx @chakra-ui/cli snippet add <name>`. Never a component library of our own.      |
| `src/lib/`                                           | Shared code with no React in it: zod schemas (`<feature>-schemas.ts`), view types and formatters, auth helpers.                                                                    |
| `src/db/`                                            | The Drizzle client and the hand-written schema.                                                                                                                                    |
| `src/test/`                                          | The test harness (`setup.ts`, `render.tsx`).                                                                                                                                       |
| `src/proxy.ts`                                       | Next 16's name for middleware. An optimistic cookie check only, never a security boundary.                                                                                         |
| `*.test.ts(x)`                                       | Colocated with the file under test.                                                                                                                                                |

## UI: Chakra UI v3

- **Compound components straight from `@chakra-ui/react`.** `Popover.Root` /
  `Trigger` / `Positioner` / `Content`, `Menu.*`, `Field.*`, `Alert.*`,
  `Tooltip.*`. No Tailwind, no shadcn, no icon library, no toast library.
- **Floating layers go through `Portal`** so they escape the header's stacking
  context: [`nav-feedback-popover.tsx`](../src/components/feedback/nav-feedback-popover.tsx),
  [`nav-theme-menu.tsx`](../src/components/nav/nav-theme-menu.tsx).
- **A popover's heading is a `Popover.Title`.** It is what the dialog's
  `aria-labelledby` points at; a bare `Popover.Header` leaves the dialog
  unnamed.
- **Icons come from `lucide-react`**, one consistent stroke set: `<Bell />`,
  `<ThumbsUp />`, `<Heart fill="currentColor" />` for a filled state. Chakra
  v3 ships no icon set of its own. Hand-drawn SVGs are for logos only: the
  brand mark in [`icons.tsx`](../src/components/nav/icons.tsx) and the Google
  mark in the sign-in button. An icon is decorative
  (Lucide sets `aria-hidden` itself); the button around it carries the
  `aria-label`.
- **Header buttons share one look:** `IconButton variant="ghost" boxSize="11"
rounded="10px" color="nav.icon"`. The right-hand group uses `gap="1"`.
- **Colour comes from semantic tokens** in [`theme.ts`](../src/theme.ts).
  Only the header reads `nav.*`; everything else keeps Chakra's defaults
  (`fg.muted`, `whiteAlpha.*`). Tokens carry a `base` and `_dark` value, and
  `next-themes` switches them by setting a class on `<html>`.
- **State the server cannot know is rendered inside `ClientOnly`** with a
  `Skeleton` fallback, as the theme menu does: the resolved theme is unknown
  during SSR.
- **Errors are inline, confirmations are toasts.** A form-level failure is an
  `Alert.Root status="error"`; a field failure is `Field.Root invalid` plus
  `Field.ErrorText`, and the form stays open so the user can fix it. A
  success that closes what the user was looking at is acknowledged with
  `toaster.create({ title, type: "success" })` from
  [`toaster.tsx`](../src/components/ui/toaster.tsx), Chakra's own snippet.
  The `Toaster` is mounted once in the root
  [`layout.tsx`](../src/app/layout.tsx); a test that expects a toast renders
  `<Toaster />` itself and calls `toaster.remove()` in `afterEach`. Never
  toast an error the user has to act on.
- **Prefer `aria-disabled` over `disabled`** when the control must stay
  focusable; a disabled button also swallows pointer events, which is why the
- **Every icon button has a tooltip, placed above it:** `Tooltip.Root
  openDelay={200} positioning={{ placement: "top" }}`. When the button also
  opens a menu or popover, nest `Tooltip.Trigger asChild` around
  `Menu.Trigger asChild` so both merge onto the one button
  ([`nav-theme-menu.tsx`](../src/components/nav/nav-theme-menu.tsx)).
- **Icon-only choices are buttons with `role="radio"`** inside a
  `role="radiogroup"`, with `aria-checked` mirrored by a `filled` icon, rather
  than a `RadioGroup` whose control would have to be hidden and restyled.

## Server components, client components and actions

- **Pages and layouts are server components.** They read the session, load
  data through actions, and hand the results to a client component as props.
  See [`home/page.tsx`](<../src/app/(app)/(nav)/home/page.tsx>).
- **Every read and write is a server action** in the route's `actions.ts`,
  `"use server"` at the top, and every exported function starts with
  `const user = await requireUser()` from
  [`authorize.ts`](../src/lib/authorize.ts). That checks the session _and_ the
  `users` row (exists, active), so a stale cookie for a deactivated account
  does nothing. There is no separate query layer.
- **A client component imports the action it calls** straight from its
  `actions.ts`, as [`nav-feedback-popover.tsx`](../src/components/feedback/nav-feedback-popover.tsx)
  does from the file beside it. Do not thread an action down as a prop through a layout or parent that
  has no use for it. In a test, `mock.module` the actions module before the
  dynamic import of the component.
- **Use `user.id` from `requireUser()`, never an id the client sent.** Stamp
  `idCreatedByUser` and `idUpdatedByUser` with it on every insert.
- **Validate the input with the shared zod schema** and return a discriminated
  union: `{ ok: true }` or `{ ok: false, errors: Record<string, string> }`
  keyed by the issue path. Throw only for things the UI cannot fix (not found,
  not signed in). `redirect()` on success when a navigation is expected.
- **Anything derived from the request** (the client IP, say) is read from
  `next/headers` inside the action, treated as a record only, and tolerated
  when absent: local development has no proxy in front of Next.
- **Memoise per-request lookups with React's `cache()`** as `requireUser` and
  `getSession` do, so a page that runs three actions in parallel makes one
  session lookup.
- **Client components get the signed-in user from `useUser()`**
  ([`user-provider.tsx`](../src/components/auth/user-provider.tsx)), never
  from a prop and never by fetching the session from the browser.
  [`(app)/layout.tsx`](<../src/app/(app)/layout.tsx>) loads the row once with
  `requireUser()` and mounts `UserProvider` with the `CurrentUser` subset from
  [`current-user.ts`](../src/lib/current-user.ts): id, name, email, image,
  nickName. Add a field there when a page needs it; nothing else on the row
  reaches the browser. Server components keep calling `requireUser()`, since
  context is client-only. In a test, wrap the component in `UserProvider`.

## Forms

- **react-hook-form with `zodResolver`**, and the same schema runs again in
  the action, so the client and the server refuse the same things. Schemas
  live in `src/lib/<feature>-schemas.ts`
  ([`story-schemas.ts`](../src/lib/story-schemas.ts),
  [`feedback-schemas.ts`](../src/lib/feedback-schemas.ts)) so the client can
  import them without pulling in the action.
- **Type `useForm` with `z.input` for the fields and `z.infer` for the
  submitted values** when a preprocess changes the shape (a `<select>` posts a
  string; the schema wants a number or null). See
  [`new-story-form.tsx`](<../src/app/(app)/(nav)/home/new/new-story-form.tsx>).
- **Chakra checkboxes and radios go through `Controller`,** not `register()`:
  Chakra's hidden input carries `value="on"`, which react-hook-form would hand
  to the schema instead of the checked flag.
- **Errors the action sends back go through `setError`** field by field, with
  anything unattributable landing on `"root"`. Use
  `loading={isSubmitting || isSubmitSuccessful}` on the submit button when the
  action redirects, so the button does not flicker back before navigation.
- **Optional fields say so in the label** rather than marking the required ones.

## Data: Drizzle

- **[`schema.ts`](../src/db/schema.ts) is hand-written and describes what
  dbmate built.** It is not a source of truth: drizzle-kit's `generate`,
  `migrate` and `push` are deliberately removed from
  [`drizzle.config.ts`](../drizzle.config.ts); only `db:studio` remains. A new
  table needs a migration in `db/` _and_ a `pgTable` here.
- **Keys are camelCase, columns are snake_case:**
  `idCreatedByUser: uuid("id_created_by_user")`. Primary keys are named
  `id_<singular table>`; new tables use
  `integer().primaryKey().generatedByDefaultAsIdentity()`.
- **The audit columns are the same on every table** and are declared nullable
  with `.defaultNow()`: `createdAt`, `updatedAt`, `idCreatedByUser`,
  `idUpdatedByUser`. The submitter of a row is `idCreatedByUser`; do not add a
  second user column for it.
- **`relations()` blocks sit at the bottom of the file**, one per table.
- **The Better Auth exports stay singular** (`user`, `session`, `account`,
  `verification`): the adapter looks tables up by these keys.
- **Queries live in the action that needs them.** Share a projection with a
  helper (`cardColumns` in
  [`home/actions.ts`](<../src/app/(app)/(nav)/home/actions.ts>)) rather than a
  repository class. Use a correlated `exists()` for "does the caller have
  one of these", so a join never duplicates or drops a row.
- **Pagination needs a stable sort:** order by the timestamp _and_ the id,
  because seeds insert many rows in one statement and share a timestamp.

## Database migrations (`db/`)

The full guide is [`db/README.md`](../../../db/README.md). The short version:

- **dbmate, run through `just`**, against the `irun` schema (set by
  `search_path` in `db/.env`; migrations use bare table names).
- **Forward only.** The `-- migrate:down` section stays empty, so every
  migration must be idempotent: `IF NOT EXISTS`, or a `DO` block that checks
  before it acts.
- **A new table is a file in `db/custom/create_<table>_table.sql`** wrapped
  with `just make_custom <name>`, then `just migrate`. Copy
  [`create_feedback_table.sql`](../../../db/custom/create_feedback_table.sql): it
  declares only the table's own columns, then registers with the `_tables`
  metatable (`CALL _p_update_tables()`, `UPDATE _tables SET needs_timestamps,
needs_user_ids`), fails loudly if the registration did not take, and calls
  `_p_update_tables_timestamps()` and `_p_update_tables_user_ids()` to add the
  audit columns, the `set_updated_at` trigger and the foreign keys.
- **A one-time change** (rename, drop, add a constraint or column) goes
  straight into `db/migrations` with `just new <name>`; there is no source in
  `custom/` to keep in step with it.
- **Seeds** go through `just make_seed` and use negative ids, so test fixtures
  with database-generated positive ids can never collide with them.

## Testing

- **`node:test` + `expect` + Testing Library + global-jsdom**, run with
  `just test` (flags pass through: `just test --test-name-pattern AppHeader`).
  No vitest, no jest, no playwright.
- **Render through `renderWithProviders`** from
  [`render.tsx`](../src/test/render.tsx); Chakra v3 throws when rendered
  without its provider.
- **Mock modules in `before`, then import the component dynamically.** Static
  imports hoist above `mock.module`, so the module under test is loaded with
  `await import(...)` after the mocks are registered
  ([`app-header.test.tsx`](../src/components/nav/app-header.test.tsx)).
- **Action tests hit the real database** and are skipped when `DATABASE_URL`
  is unset. They mock `getSession` from `@/lib/require-session`, import `@/db`
  lazily inside `before` (the pool opens at import time), create their own
  fixtures, clean them up in both `before` and `after`, and close the pool
  ([`feedback/actions.test.ts`](../src/components/feedback/actions.test.ts)).
- **Query by role and accessible name.** If a test cannot find something by
  role, fix the markup, not the query.
- **Zag's floating layers need patience under jsdom:** `findByRole` and
  `waitFor` for popovers, and the pointer-nudge loop in the logout test for
  menu items.
- **Write the test first** and watch it fail for the right reason before
  writing the code that makes it pass.

## Housekeeping

- A new dependency gets a bullet in [`technologies.md`](../technologies.md).
- Never commit or push unless asked in that message; leave the work in the tree.
- `just deploy` runs the tests first and refuses to ship a red suite.
