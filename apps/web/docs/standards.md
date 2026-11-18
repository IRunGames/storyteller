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

| Path                                                        | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(public)`, `(auth)`, `(app)`, `(app)/(nav)`        | Route groups by access tier; `(nav)` is every signed-in page that carries the menu bar. The group name is not part of the URL.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/app/<route>/actions.ts`                                | Server actions for that route. A component no single page owns keeps its action beside itself instead ([`components/feedback/actions.ts`](../src/components/feedback/actions.ts)).                                                                                                                                                                                                                                                                                                                                                              |
| `src/app/<route>/`                                          | A component only that page uses lives beside its `page.tsx` (the admin Systems page's `systems-admin.tsx`): it is the page's implementation, not a component.                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/<area>/`                                    | Components more than one page shares, grouped by feature (`nav`, `stories`, `auth`). Never a page's own body.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/buttons/`, `forms/`, `covers/`, `popovers/` | The few pieces every feature draws the same way: `IconButtonWithTooltip` and `WithTooltip` (the tooltip on every icon button, and on a menu's or popover's trigger), `FormError` (a form's own error), `CoverBackdrop` (a cover picture with its scrim), `InfoPopoverShell` and `InfoPopover` (the small info button and its panel). Never a page's own body.                                                                                                                                                                                   |
| `src/components/table-shell/`                               | What the four tables share, and nothing a page owns: `TableShell` (header, left panes, play space, right panel), `useSceneItems` with `SceneItemsProvider` (the play space's items and every change to them, which a pill, its panel and the library reach through `useSceneItemsContext()` instead of callbacks handed down), `TableLibraryPanel`, `TablePlaySpace` and `TableStacks` (the storyteller's side), `useTableChat` (chat, character and diagnostics panels), `PlayStackFrame`, `PulsedPicture`, the halo and the connection notes. |
| `src/components/providers/`                                 | What wraps the app once, written by us: `emotion-registry.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/components/ui/`                                        | Only Chakra's generated snippets (`provider.tsx`, `color-mode.tsx`, `toaster.tsx`), added with `npx @chakra-ui/cli snippet add <name>` and edited where the app needs it (the toaster's durations, the provider's theme list, the colour mode read off `lib/themes.ts`). Nothing of our own beside them; `test/architecture.test.ts` checks.                                                                                                                                                                                                    |
| `src/lib/`                                                  | Shared code with no React in it: zod schemas (`<feature>-schemas.ts`), view types and formatters, auth helpers.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/db/`                                                   | The Drizzle client, the hand-written schema, and the reads and writes more than one actions module shares: who may read or change a story (`story-access.ts`), the scene's read model (`scene-space.ts`), one scene insert (`scenes.ts`), covers (`covers.ts`), seats (`seats.ts`), the activity log (`activity-log.ts`). A `"use server"` module may only export actions, so what two of them share lives here.                                                                                                                                |
| `src/hooks/`                                                | React hooks more than one feature shares: `use-latest.ts`, `use-optimistic-action.ts` (a control that shows its change before the action answers and puts it back on a refusal), `use-debounced-search.ts` (a search box that asks the database once the typing pauses). A hook one feature owns stays beside it (`components/play/use-story-chat.ts`, `components/stories/use-favorites.ts`, `components/uploads/use-attachment-search.ts`).                                                                                                   |
| `src/test/`                                                 | The test harness: `setup.ts`, `render.tsx`, `db-suite.ts` for database tests, `scene-fixtures.ts` for the table's suites, `mocks.ts` for the mocks component tests share, and the source scans (`guest-gate`, `architecture`).                                                                                                                                                                                                                                                                                                                  |
| `src/proxy.ts`                                              | Next 16's name for middleware. An optimistic cookie check only, never a security boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `*.test.ts(x)`                                              | Colocated with the file under test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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
  v3 ships no icon set of its own. Hand-drawn SVGs are for marks only: the
  themes' marks in [`icons.tsx`](../src/components/nav/icons.tsx) and the
  Google mark in the sign-in button. The Storyteller logo is a picture,
  `LogoMark` in [`brand-mark.tsx`](../src/components/nav/brand-mark.tsx). An icon is decorative
  (Lucide sets `aria-hidden` itself); the button around it carries the
  `aria-label`.
- **Header buttons share one look:** `IconButton variant="ghost" boxSize="11"
rounded="10px" color="nav.icon"`. The right-hand group uses `gap="1"`.
- **Colour comes from semantic tokens** in [`theme.ts`](../src/theme.ts).
  Only the header reads `nav.*`; everything else keeps Chakra's defaults
  (`fg.muted`, `whiteAlpha.*`). Tokens carry a `base` and `_dark` value plus
  one per tinted theme (`_halloween`, `_blackberry`, `_mint`, `_wave`,
  `_ember`, `_whiteout`, `_yule`), and `next-themes` switches them by
  setting a class on `<html>`. Every tinted theme but White Out is a dark
  theme: the `dark` condition matches their classes too, so a token with no
  `_halloween` value falls back to its `_dark` one. White Out is light, so a
  token with no `_whiteout` value falls back to its `base` one. The page's
  `color-scheme` follows the class through `globalCss` in `theme.ts`, not
  `next-themes`, which would give White Out its default theme's dark scheme.
  The list of themes is [`themes.ts`](../src/lib/themes.ts); the provider
  hands it to `next-themes` so the old class is removed on a switch.
- **Anything that differs per theme is a CSS rule on the theme class**
  (`css={{ ".halloween &": { display: "none" } }}`), not a branch on
  the theme in JavaScript, which would need `ClientOnly`. The selector is
  spelled out because Chakra only types the `_halloween` condition after its
  typegen CLI has run, which we do not do; tokens in `theme.ts` are untyped
  and use `_halloween` directly. The color-mode snippet's `useColorModeValue`
  is deleted for the same reason: it only knew light and dark.
- **State the server cannot know is rendered inside `ClientOnly`** with a
  `Skeleton` fallback, as the theme menu does: the resolved theme is unknown
  during SSR.
- **Deleting asks first, through one component.** Anything taken away for
  good gets [`DeleteButton`](../src/components/confirm/delete-button.tsx):
  the trigger (an icon on a row or card, a full button on a page), the
  popover that names the thing and says what goes with it, the Cancel and
  Delete pair, the inline refusal and the success toast. A feature wraps it
  with its own words and its own action, as
  [`delete-scene-button.tsx`](../src/components/prep/delete-scene-button.tsx)
  does; it does not draw the popover itself.
- **Errors are inline, confirmations are toasts.** A form-level failure is a
  [`FormError`](../src/components/forms/form-error.tsx), given
  `errors.root?.message` or the error string as it is (it draws nothing
  without one, and always carries `role="alert"`); a field failure is
  `Field.Root invalid` plus `Field.ErrorText`, and the form stays open so the
  user can fix it. A
  success that closes what the user was looking at is acknowledged with
  `toaster.create({ title, type: "success" })` from
  [`toaster.tsx`](../src/components/ui/toaster.tsx), Chakra's own snippet.
  The `Toaster` is mounted once in the root
  [`layout.tsx`](../src/app/layout.tsx); a test that expects a toast renders
  `<Toaster />` itself and calls `toaster.remove()` in `afterEach`. Never
  toast an error the user has to act on.
- **Prefer `aria-disabled` over `disabled`** when the control must stay
  focusable; a disabled button also swallows pointer events, which is why the
- **Every icon button has a tooltip, placed above it,** through
  [`IconButtonWithTooltip`](../src/components/buttons/icon-button-with-tooltip.tsx)
  (a round ghost `xs` button by default; the header's pass their own size,
  radius and colour over it). When the button also opens a menu or popover,
  give it `menuTrigger={triggerId}` or `popoverTrigger={triggerId}` and the
  `Menu.Root` or `Popover.Root` around it `ids={{ trigger: triggerId }}` from
  one `useId()`: each machine looks its trigger up by id when positioning,
  and with separate ids the tooltip's wins and the menu opens at the page
  corner. [`WithTooltip`](../src/components/buttons/with-tooltip.tsx) is the
  same for a trigger that is not an icon button (a text button, an avatar).
  Nothing else writes a `Tooltip.Root` around a trigger. A small info button
  and the panel it opens is an
  [`InfoPopoverShell`](../src/components/popovers/info-popover-shell.tsx).
- **Icon-only choices are buttons with `role="radio"`** inside a
  `role="radiogroup"`, with `aria-checked` mirrored by a `filled` icon, rather
  than a `RadioGroup` whose control would have to be hidden and restyled.

## Server components, client components and actions

- **Pages and layouts are server components.** They read the session, load
  data through actions, and hand the results to a client component as props.
  See [`stories/page.tsx`](<../src/app/(app)/(nav)/stories/page.tsx>).
- **Every read and write is a server action** in the route's `actions.ts`,
  `"use server"` at the top, and every exported function starts with
  `const user = await requireAccount()` from
  [`authorize.ts`](../src/lib/authorize.ts). An actions module holds one
  concern: the table's scene (`components/run/actions.ts`), an element's
  link to a scene (`components/scene-elements/actions.ts`), the element
  itself (`components/elements/actions.ts`), the session at the table
  (`components/sessions/actions.ts`), the join link
  (`components/join-links/actions.ts`); a page imports from each feature it
  uses. That checks the session _and_ the
  `s_users` row (exists, active, not a guest), so a stale cookie for a
  deactivated account does nothing, and neither does a guest's. The few
  actions a guest's pages need start with `requireUser()` instead, which lets
  a guest through, and are named in
  [`guest-gate.test.ts`](../src/test/guest-gate.test.ts); a new one fails that
  test until it is named there. See [Guests](auth.md#guests). There is no
  separate query layer.
- **One exception, and only one: `app/api/blob/upload/route.ts`.** `upload()`
  from `@vercel/blob/client` needs an HTTP endpoint to POST to for a token,
  which a server action cannot be. It opens with the same `requireAccount()`
  an action does, and it checks the client-supplied pathname against that user's
  own prefix. Uploading is the only thing that earns a route handler; adding
  another needs the same kind of reason.
- **Every exported action is named with the `sa_` prefix**: `sa_listNews`,
  `sa_setFavorite`, `sa_submitFeedback`. A call site and a `mock.module` then
  both show at a glance that the call crosses the network. Only the export is
  prefixed: a prop that carries one (`onCreate`, `setFavorite={sa_setFavorite}`),
  a local helper and a result type keep their own names.
- **A client component imports the action it calls** straight from its
  `actions.ts`, as [`nav-feedback-popover.tsx`](../src/components/feedback/nav-feedback-popover.tsx)
  does from the file beside it. Do not thread an action down as a prop through a layout or parent that
  has no use for it. In a test, `mock.module` the actions module before the
  dynamic import of the component.
- **Use `user.id` from `requireAccount()`, never an id the client sent.** Stamp
  `idCreatedByUser` and `idUpdatedByUser` with it on every insert.
- **Whose row it is comes from [`story-access.ts`](../src/db/story-access.ts):**
  `ownedStory`, `ownedScene`, `ownedSession`, `ownedElement` and
  `ownedSceneElement` answer the row when the caller is its storyteller and
  null (or a reason) otherwise, and `storyAccess` says whether a reader may
  read a story at all. `ownedScene` and `ownedSceneElement` refuse a
  complete scene unless the caller passes `allowLocked`, so every write to a
  scene and to what is in it is held by the one lock; a read passes
  `allowLocked: true`, and so do the few writes that are allowed on a
  finished scene (its text from the tables, its stat blocks). No action
  writes its own join to `stories`.
- **An action never calls another exported `sa_` action:** that runs the gate
  again and bypasses `cache()`. What two actions share is a plain helper in
  the module, or a function in `db/`.
- **Validate the input with the shared zod schema** and return a discriminated
  union: `{ ok: true }` or `{ ok: false, errors: formErrors(parsed.error) }`
  from [`forms.ts`](../src/lib/forms.ts), one message per field keyed by the
  issue path, an issue with no path on `"root"`. Every input is checked with
  `safeParse`: a write refused for a bad id or a row that is not the
  caller's answers `{ ok: false, errors: { root } }`, or `{ ok: false, error }`
  where the result carries one message; a read answers `null` or `[]`; only
  the gate throws, for a caller who is not signed in. `redirect()` on success
  when a navigation is expected. A refusal with no field to sit on is a constant in
  [`messages.ts`](../src/lib/messages.ts), so one refusal has one wording.
- **An id is checked the same way everywhere.** A page reads an id from its URL
  with `parseRouteId` ([`route-ids.ts`](../src/lib/route-ids.ts)) and calls
  `notFound()` on `null`; an action or schema validates an id with `idSchema`
  from [`schemas.ts`](../src/lib/schemas.ts), which is `z.int32()`, the range
  of every id column. An id outside it is a query error rather than a missing
  row, and neither side writes its own regex or range. The same file holds the
  other fragments every feature's schema is built from: `offsetSchema`,
  `searchSchema`, `titleSchema(what)`, `longTextSchema(label)` and
  `selectIntSchema` for a `<select>` whose empty option means null.
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
- **Per-user settings go through `useUserPreferences()`**
  ([`user-preferences-provider.tsx`](../src/components/preferences/user-preferences-provider.tsx)),
  mounted just inside `UserProvider` by `(app)/layout.tsx` with the map that
  `sa_getUserPreferences()` loaded. `get(key, fallback)` reads it;
  `set(key, value)` shows the change at once, sends it to
  `sa_setUserPreference` in
  [`preferences/actions.ts`](../src/components/preferences/actions.ts), one
  merged upsert per key, and puts the old value back if the action refuses.
  Keys are free-form strings, values any JSON, and the whole map is one
  `user_preferences` row per user. Never keep a setting in `localStorage`
  instead. In a test, `mock.module("./actions")` and wrap the component in
  `UserPreferencesProvider`.

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
  [`story-form.tsx`](../src/components/stories/story-form.tsx).
- **Chakra checkboxes and radios go through `Controller`,** not `register()`:
  Chakra's hidden input carries `value="on"`, which react-hook-form would hand
  to the schema instead of the checked flag.
- **Errors the action sends back go through `applyActionErrors`** from
  [`forms.ts`](../src/lib/forms.ts): `applyActionErrors({ setError },
result.errors, FIELDS, fallback?)` sets every field the form registers and
  puts `root`, or a key the form has no field for, on `"root"`. Use
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
  [`stories/actions.ts`](<../src/app/(app)/(nav)/stories/actions.ts>)) rather than a
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
  audit columns, the `set_updated_at` trigger and the foreign keys. A table
  whose rows are taken down rather than deleted also sets `needs_archival` and
  calls `_p_update_tables_archives()` for `is_archived`, `archived_at` and
  `id_archived_by_user`, as
  [`create_news_table.sql`](../../../db/custom/create_news_table.sql) does.
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
- **Action tests hit the real database** through `describeWithDb` from
  [`db-suite.ts`](../src/test/db-suite.ts), which loads `.env.local`, skips
  the suite when `DATABASE_URL` is unset, mocks `getSession` from
  `@/lib/require-session`, makes the test user and closes the pool. The body
  imports `@/db` and the module under test lazily inside its own `before`
  (the pool opens at import time, and a static import would hoist above the
  mocks), makes its fixtures, and removes them in `after`
  ([`feedback/actions.test.ts`](../src/components/feedback/actions.test.ts)).
  [`scripts/run-tests.mjs`](../scripts/run-tests.mjs) runs every file that
  uses `describeWithDb` (or names `DATABASE_URL` itself) one at a time, after
  the rest have run in parallel: side by side, one suite's fixtures land in
  another's lists.
- **A database test signs in as a test user of its own**, the one
  `describeWithDb` makes from the `email` it is given, or more through
  `suite.makeUser`, all under `@example.test` and removed in `after`. Never
  a real or `@irun.games` account: the dev database is where the owner plays,
  and a test's cleanup deletes what its user wrote.
  [`real-accounts.test.ts`](../src/test/real-accounts.test.ts) fails the suite
  if one does. `suite.caller` is who the actions think is asking; a test that
  signs in as someone else sets it and sets it back.
- **Component tests take their shared mocks from
  [`mocks.ts`](../src/test/mocks.ts)**: `mockNavigation` for
  `next/navigation`, `mockHeader` for what a page with the `AppHeader` has
  to replace, `currentUser` for the `CurrentUser` a `UserProvider` is given.
  Each is called inside `before`, ahead of the dynamic import.
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
