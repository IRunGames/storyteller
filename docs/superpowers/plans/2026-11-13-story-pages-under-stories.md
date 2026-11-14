# Story Pages Under /stories/[id] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page about one story lives under `/stories/[id]/…`, scene pages under `/stories/[id]/scenes/[idScene]…`, and every id in a URL or an action is checked one way.

**Architecture:** The pages split across two route groups that share one URL tree:
`(app)/(nav)/stories/[id]/` for pages with the menu bar and `(app)/stories/[id]/` for the
full-screen ones. Next.js allows this because no two pages resolve to the same path and both trees
name the segment `id`. The action modules that many routes import move to `components/` first, so
the page move moves only pages. Pages read a URL id with `parseRouteId`; actions and schemas
validate an id with Zod's `z.int32()`.

**Tech Stack:** Next.js 16 App Router (route groups), server actions over Drizzle, Zod 4.6
(`z.int32()`), node:test with `--experimental-test-module-mocks`.

**Spec:** None written. The decisions below were settled with the owner on 2026-11-13 and are the
spec.

## Decisions

| Old URL | New URL | File under `src/app/(app)/` |
|---|---|---|
| `/libraries/42` | `/stories/42/library` | `(nav)/stories/[id]/library/page.tsx` |
| `/run/42` | `/stories/42/run` | `stories/[id]/run/page.tsx` |
| `/play/42` | `/stories/42/play` | `stories/[id]/play/page.tsx` |
| `/play/42/waiting` | `/stories/42/play/waiting` | `stories/[id]/play/waiting/page.tsx` |
| `/table/42` | `/stories/42/table` | `stories/[id]/table/page.tsx` |
| `/table/42/waiting` | `/stories/42/table/waiting` | `stories/[id]/table/waiting/page.tsx` |
| (new) | `/stories/42/scenes` | `stories/[id]/scenes/page.tsx` |
| `/scenes/7/live` | `/stories/42/scenes/7` | `stories/[id]/scenes/[idScene]/page.tsx` |
| `/scenes/7` | `/stories/42/scenes/7/info` | `(nav)/stories/[id]/scenes/[idScene]/info/page.tsx` |
| `/scenes/7/edit` | `/stories/42/scenes/7/edit` | `(nav)/stories/[id]/scenes/[idScene]/edit/page.tsx` |

- Unchanged: `/stories`, `/stories/42`, `/stories/42/edit`, `/stories/42/storyboard`, the `/play`
  and `/library` landing pages, `/sessions/7`, `/elements/7/edit`, `/preview/scene/7`, `/join`,
  `/invite`.
- Old URLs are not redirected. They show the not-found page. Add no redirects.
- `/stories/42/scenes` opens the scene the storyteller touched last. Only when the story has no
  scenes does it create one titled "New scene" and open that, so loading it twice opens the same
  scene. Anyone but the storyteller gets the not-found page and nothing is created.
- A page whose URL has a scene id shows the not-found page when the scene is not in the URL's story.
- A URL id is `0` or an optional `-` then digits with no leading zero, inside the int4 range.
  Anything else (`0x2a`, `1e3`, ` 4 `, `+4`, `04`, `-0`, `2147483648`) is the not-found page. Today
  the table pages accept `0x2a` as 42 because `z.coerce.number()` uses `Number()`.
- Actions and shared schemas validate ids with `z.int32()`, which is exactly int4; no shared schema
  of our own. The schemas in `src/lib/realtime/` are left alone: they parse messages the server
  broadcast itself, and nothing they check goes on to a query.
- Not in this plan: splitting the action files by subject; moving `/sessions/7`,
  `/preview/scene/7` or `/elements/7/edit`.

## Global Constraints

- Never commit or push. There are no commit steps. The owner has uncommitted work in the tree,
  including files this plan edits; never stash, reset, check out or revert anything.
- Read `apps/web/docs/standards.md` before touching `apps/web`.
- Paths below are under `apps/web/` unless they start with `docs/`. Quote paths in the shell: they
  contain `(`, `)`, `[` and `]`.
- After each task: `npx prettier --print-width 100 --write` and `npx eslint` on touched files,
  `npx tsc --noEmit -p .` (all from `apps/web`), then `just test` (from the repo root). All green.
- One test file: `cd apps/web && node --import tsx --disable-warning=ExperimentalWarning
  --experimental-test-module-mocks --import ./src/test/setup.ts --test <file>`. The path is a glob,
  so `[` and `]` would need escaping; the files this plan runs alone have none.
- Find a symbol's definition and callers with the LSP tool (typescript-language-server). Use grep
  for URL strings and comments.
- Every exported action is `sa_…`. Client components import their action directly, never as a prop.
- Never touch real data. Tests use throwaway fixtures and never sign in as an `@irun.games`
  account. App walkthroughs run on local dev only, with a throwaway account made at `/signup` and
  its own stories.
- Comments say why, in prose. No analogies. When a comment names a path this plan changes, update
  it.

## Review Focus

1. A scene id under the wrong story (`/stories/9/scenes/7` where scene 7 is story 42's): the builder,
   info and edit pages all show the not-found page. Checked in Task 3's walkthrough.
2. `/stories/42/scenes` loaded twice on a story with no scenes makes one scene, not two. Test in
   Task 3 (`sa_getOrCreateSceneToBuild` called twice).
3. A player, or any non-owner, opening `/stories/42/scenes` creates nothing. Test in Task 3.
4. Odd ids in URLs (`0x2a`, `1e3`, ` 4 `, `04`, `-0`, out of range) are not found, and seed ids
   (negative) still work. Test in Task 2 (`parseRouteId`).
5. A guest following a join link lands on `/stories/42/table` and is not bounced to `/signup`. That
   happens if a table page ends up under `(nav)`, whose layout sends guests away. Checked in Task 3's
   walkthrough.

---

### Task 1: Move the shared action files to `components/`

No URL or behaviour changes. Each file moves whole, with its tests.

**Files:**
- Move: `src/app/(app)/run/[id]/actions.ts` and `actions.test.ts` → `src/components/run/`
- Move: `src/app/(app)/play/[id]/actions.ts` and `actions.test.ts` → `src/components/play/`
- Move: `src/app/(app)/(nav)/libraries/actions.ts`, `actions.test.ts`, `actions.stat-blocks.test.ts`
  → `src/components/prep/`
- Move: `src/app/(app)/scenes/[id]/live/actions.ts` and `actions.test.ts` → `src/components/live/`
- Modify: every importer and every `mock.module(…)` path naming the old modules.

**Interfaces:**
- Produces: `@/components/run/actions`, `@/components/play/actions`, `@/components/prep/actions`,
  `@/components/live/actions`, each with the same exports as before.

- [ ] **Step 1: Move the nine files with `git mv`.** None of the four action files imports another
  route's actions, and their tests import `./actions`, so nothing inside them changes.
- [ ] **Step 2: Rewrite the alias imports.** `@/app/(app)/run/[id]/actions` →
  `@/components/run/actions`; `@/app/(app)/play/[id]/actions` → `@/components/play/actions`;
  `@/app/(app)/(nav)/libraries/actions` → `@/components/prep/actions`;
  `@/app/(app)/scenes/[id]/live/actions` → `@/components/live/actions`. Same for `mock.module`
  paths in tests.
- [ ] **Step 3: Rewrite the relative imports** to the `@/components/…` paths:
  `(nav)/scenes/[id]/page.tsx`, `(nav)/scenes/[id]/edit/page.tsx`,
  `(nav)/elements/[id]/edit/page.tsx`, `(nav)/stories/[id]/page.tsx`, `(nav)/sessions/[id]/page.tsx`
  (all `…/libraries/actions`), `(nav)/libraries/[id_story]/page.tsx` (`../actions`),
  `run/[id]/page.tsx` and `play/[id]/page.tsx` (`./actions`), `play/[id]/waiting/page.tsx`
  (`../actions`).
- [ ] **Step 4: Check nothing names the old modules.**
  Run: `grep -rnE '(run/\[id\]|play/\[id\]|libraries|scenes/\[id\]/live)/actions' src docs`
  Expected: no output, after updating any comments it finds.
- [ ] **Step 5: Type check, lint, `just test`.** Expected: all green, same test count as before.

### Task 2: One id check

No URL changes. Pages read ids one way, actions and schemas validate them one way.

**Files:**
- Create: `src/lib/route-ids.ts`, `src/lib/route-ids.test.ts`
- Modify (pages, 16): `src/app/(app)/(nav)/` `admin/systems/[id]/page.tsx`,
  `elements/[id]/edit/page.tsx`, `libraries/[id_story]/page.tsx`, `scenes/[id]/page.tsx`,
  `scenes/[id]/edit/page.tsx`, `sessions/[id]/page.tsx`, `stories/[id]/page.tsx`,
  `stories/[id]/edit/page.tsx`, `stories/[id]/storyboard/page.tsx`; `src/app/(app)/`
  `run/[id]/page.tsx`, `play/[id]/page.tsx`, `play/[id]/waiting/page.tsx`, `table/[id]/page.tsx`,
  `table/[id]/waiting/page.tsx`, `preview/scene/[id]/page.tsx`, `scenes/[id]/live/page.tsx`
- Modify (int4 copies; lines as of 2026-11-13):

  | File | Line | Becomes |
  |---|---|---|
  | `src/components/live/actions.ts` | 24 | `z.int32()` |
  | `src/components/prep/actions.ts` | 61 | `z.int32()` |
  | `src/components/run/actions.ts` | 96 | `z.int32()` |
  | `src/components/play/actions.ts` | 50 | `z.int32()` |
  | `src/components/status/actions.ts` | 36 | `z.int32()` |
  | `src/components/elements/actions.ts` | 15 | `z.int32()` |
  | `src/components/sessions/actions.ts` | 19 | `z.int32()` |
  | `src/components/stat-blocks/actions.ts` | 119 | `z.int32()` |
  | `src/app/(app)/(nav)/stories/actions.ts` | 88 | `z.int32()` |
  | `src/app/(app)/(nav)/stories/actions.ts` | 576 | `z.int32().positive()` |
  | `src/app/(app)/(nav)/stories/[id]/storyboard/actions.ts` | 31 | `z.int32()` |
  | `src/app/(app)/(nav)/play/actions.ts` | 17 | `z.int32()` |
  | `src/app/(app)/(nav)/home/actions.ts` | 16 | `z.int32()` |
  | `src/app/(app)/(nav)/admin/systems/actions.ts` | 41 | `z.int32()` |
  | `src/app/(app)/(nav)/admin/invitations/actions.ts` | 18 | `z.int32().positive()` |
  | `src/app/(app)/(nav)/admin/users/actions.ts` | 205 | `z.int32()` (has no range today) |
  | `src/app/(app)/preview/scene/[id]/actions.ts` | 18 | `z.int32()` |
  | `src/app/api/table/leave/route.ts` | 8 | `idStory: z.int32()` |
  | `src/lib/attachment-schemas.ts` | 9, 10 | `z.int32()` |
  | `src/lib/element-schemas.ts` | 47 | `z.array(z.int32())…` |
  | `src/lib/profile-schemas.ts` | 49 | `z.int32()` |
  | `src/lib/scene-schemas.ts` | 7 | `z.int32().nullable()` |

- Modify: `apps/web/docs/standards.md` (the Data section, beside "Validate the input with the shared
  zod schema")

**Interfaces:**
- Produces: `parseRouteId(raw: string): number | null` in `src/lib/route-ids.ts`. Returns the id
  when `raw` matches `/^(0|-?[1-9]\d*)$/` and `z.int32()` accepts `Number(raw)`, else `null`. A page
  uses it as `const idStory = parseRouteId(id); if (idStory === null) notFound();`.

- [ ] **Step 1: Write the failing test** `src/lib/route-ids.test.ts`, `describe("parseRouteId")`:
  - returns the number for `"42"` → 42, `"-5"` → -5, `"0"` → 0, `"2147483647"` → 2147483647,
    `"-2147483648"` → -2147483648
  - returns `null` for `"2147483648"`, `"-2147483649"`, `"0x2a"`, `"1e3"`, `" 4 "`, `"4 "`, `"+4"`,
    `"04"`, `"-0"`, `""`, `"-"`, `"4.0"`, `"abc"`
- [ ] **Step 2: Run it alone; it fails** because `src/lib/route-ids.ts` does not exist.
- [ ] **Step 3: Implement `parseRouteId`.** Its doc comment carries the reason now spread over the
  pages: `Number()` alone would accept `0x2a`, `1e3`, ` 4 ` and `Infinity`, each a different URL
  for the same row, and an id outside int4 is a query error rather than a missing row.
- [ ] **Step 4: Run it alone; it passes.**
- [ ] **Step 5: Switch the 16 pages** to `parseRouteId`. Delete each page's own regex or
  `z.coerce.number()` schema, and its comment pointing at `stories/[id]/page.tsx` for the reason.
- [ ] **Step 6: Replace the int4 copies** per the table. Keep each local name
  (`const idStorySchema = z.int32();`) so call sites do not change. Drop the comments that explain
  the hand-written range.
- [ ] **Step 7: Check no copy is left.**
  Run: `grep -rnE '2147483647|2147483648|z\.coerce\.number\(\)\.int\(\)' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
  Expected: no output.
- [ ] **Step 8: Add one bullet to `docs/standards.md`:** a page reads an id from its URL with
  `parseRouteId` (`src/lib/route-ids.ts`) and calls `notFound()` on `null`; an action or schema
  validates an id with `z.int32()`, the range of every id column.
- [ ] **Step 9: Type check, lint, `just test`.** A test that asserted a hand-written range's Zod
  message may need its expectation updated to `z.int32()`'s; the behaviour must not change.

### Task 3: Move the pages under `/stories/[id]`

**Files:**
- Move (`git mv`, under `src/app/(app)/`):
  - `(nav)/libraries/[id_story]/page.tsx` → `(nav)/stories/[id]/library/page.tsx`
  - `(nav)/scenes/[id]/page.tsx` → `(nav)/stories/[id]/scenes/[idScene]/info/page.tsx`
  - `(nav)/scenes/[id]/edit/page.tsx` → `(nav)/stories/[id]/scenes/[idScene]/edit/page.tsx`
  - `run/[id]/page.tsx` → `stories/[id]/run/page.tsx`
  - `play/[id]/page.tsx` → `stories/[id]/play/page.tsx`
  - `play/[id]/waiting/page.tsx` → `stories/[id]/play/waiting/page.tsx`
  - `table/[id]/page.tsx` → `stories/[id]/table/page.tsx`
  - `table/[id]/waiting/page.tsx` → `stories/[id]/table/waiting/page.tsx`
  - `scenes/[id]/live/page.tsx` → `stories/[id]/scenes/[idScene]/page.tsx`
- Create: `src/app/(app)/stories/[id]/scenes/page.tsx`
- Modify: `src/components/prep/actions.ts` (new action), `src/components/prep/actions.test.ts`
- Modify: `src/components/prep/scene-info-popover.tsx` (new `idStory` prop) and its callers
  `src/components/prep/prep-scenes.tsx:243`, `src/components/stories/session-info-popover.tsx:207`
- Modify: every link and redirect to an old URL (Step 7), `apps/web/docs/auth.md`, comments naming
  old paths
- Delete: the folders left empty: `src/app/(app)/run/`, `src/app/(app)/play/` (not
  `(nav)/play/`, which stays), `src/app/(app)/table/`, `src/app/(app)/scenes/`,
  `src/app/(app)/(nav)/scenes/`, `src/app/(app)/(nav)/libraries/`

**Interfaces:**
- Consumes: `parseRouteId` (Task 2); `@/components/prep/actions` (Task 1).
- Produces: `sa_getOrCreateSceneToBuild(idStory: number): Promise<number | null>` in
  `src/components/prep/actions.ts`. For the story's storyteller it returns the scene they touched
  last, in `sa_getSceneToBuild`'s order (`updated_at` desc, then id desc). When the story has no
  scenes, it inserts one (`sceneTitle: "New scene"`, `sceneDescription: null`, no session, created
  and updated by the caller, as `sa_createLiveScene` does) and returns its id. It returns `null`,
  creating nothing, for anyone else and for an id `z.int32()` refuses.
- Produces the URL shapes: `/stories/${idStory}/library`, `/run`, `/play`, `/play/waiting`,
  `/table`, `/table/waiting`, `/scenes`, `/scenes/${idScene}`, `/scenes/${idScene}/info`,
  `/scenes/${idScene}/edit`.
- Produces: `SceneInfoPopover` props gain `idStory: number`.

- [ ] **Step 1: Write the failing tests** in `src/components/prep/actions.test.ts`,
  `describe("sa_getOrCreateSceneToBuild")`, with the file's existing throwaway user and story
  fixtures:
  - storyteller, story with two scenes where the older one was updated last: returns that scene's
    id; the story still has two scenes
  - storyteller, story with no scenes: returns an id whose row has `sceneTitle` `"New scene"`; a
    second call returns the same id; the story has exactly one scene
  - another throwaway account: returns `null`; the story still has no scenes
  - `2147483648`: returns `null`
- [ ] **Step 2: Run the file alone; the new tests fail** because the export does not exist.
- [ ] **Step 3: Implement `sa_getOrCreateSceneToBuild`** beside `sa_getSceneToBuild`, sharing its
  owner check and query through a private helper.
- [ ] **Step 4: Run the file alone; it passes.**
- [ ] **Step 5: Move the pages** (`git mv` per the Files list) and delete the empty folders.
  - Rename the library page's param `id_story` → `id`.
  - Pages with a scene read `idScene` with `parseRouteId` as well. The builder
    (`sa_getStorySceneForEdit`), info page (`sa_getStoryScene`) and edit page
    (`sa_getStorySceneForEdit`) each call `notFound()` when the loaded scene's `idStory` is not the
    URL's story id.
  - The edit page's `returnTo` fallback becomes `/stories/${idStory}/library`.
- [ ] **Step 6: Create `stories/[id]/scenes/page.tsx`.** `requireSession()`, `parseRouteId`, then
  `sa_getOrCreateSceneToBuild`. Call `notFound()` on `null`, otherwise
  `redirect(`/stories/${idStory}/scenes/${idScene}`)`. A comment says why it may write: a story with
  no scenes has nothing to build on, and creating only when there are none makes a reload open the
  same scene.
- [ ] **Step 7: Update every link and redirect to an old URL.**
  Run: `grep -rnE "[\"'\`]/(run|table|libraries|scenes)/|[\"'\`]/play/" src docs`
  Expected sites (2026-11-13), tests included; update test expectations too:
  - `/libraries/` in 18 files, `/play/` in 13, `/table/` in 11, `/run/` in 8.
  - `story-title-menu.tsx`: the item hrefs, the build check at line 75 becomes
    `/^\/stories\/-?\d+\/scenes\/-?\d+$/`, and the push at line 218.
  - `live-table.tsx:117` (`openScene`) and `prep-scenes.tsx:228`, both to the builder.
  - `scene-info-popover.tsx:48`, the pop-out to `/info`. It takes the new `idStory` prop:
    `prep-scenes.tsx` passes its `idStory`, `session-info-popover.tsx` passes the loaded session's
    `idStory`.
  - `scene-preview.tsx:96`, the pencil to `/edit?from=…`.
  - Redirects: the play page (3), play waiting (2), table page (1), table waiting (1),
    `(public)/join/[code]/page.tsx:31`, `sa_startPlaying` in `(nav)/play/actions.ts:210`, and the
    last line of `src/components/prep/actions.ts`.
  - Afterwards the grep finds nothing. `/play` alone (the landing page) and `/api/table/leave` don't
    match it.
- [ ] **Step 8: Docs and comments.** In `apps/web/docs/auth.md`'s private-pages table, the play,
  run and table rows name the new paths and files. Fix comments found by
  `grep -rnE '/(run|play|table|libraries)/\[|scenes/\[id\]' src docs`, among them the list of tables
  in `(nav)/layout.tsx`.
- [ ] **Step 9: Type check, lint, `just test`.**
- [ ] **Step 10: Walk through on local dev** (`just dev`). Use a throwaway account, a second
  throwaway account as a player, and a private window as a guest. Next reports two pages that
  resolve to one path when the route first compiles. Expected:
  - every title-menu item on the story page reaches its new URL
  - `/stories/<id>/scenes` on a story with no scenes opens a new "New scene"; a reload opens the
    same scene
  - a scene's info pop-out, from the library board and from a session's panel, opens `/info`
  - the preview's pencil opens the edit form, and Cancel returns to the preview
  - a scene under another story's id gets the not-found page on the builder, `/info` and `/edit`
  - the player, before a session opens, waits at `/stories/<id>/play/waiting` and is brought to the
    table when it opens
  - the guest follows the join link to `/stories/<id>/table` and is not sent to `/signup`
  - the Library page highlights the Stories menu pill

### Task 4: Build Scenes becomes a plain link

**Files:**
- Modify: `src/components/stories/story-title-menu.tsx` and its test
- Modify (drop the `buildSceneId` prop): `src/components/prep/prep-board.tsx`,
  `src/components/storyboard/storyboard.tsx`, `src/components/stories/story-details.tsx`,
  `src/components/stories/story-table.tsx`, `src/components/stories/story-card.tsx`,
  `src/components/live/live-table.tsx`, `src/components/run/run-table.tsx`, and their tests'
  fixtures
- Modify (drop the `sa_getSceneToBuild` call): the story, library, storyboard, run and builder pages
- Modify: `src/lib/stories.ts:53` (drop `buildSceneId`), `src/db/story-cards.ts:108` (drop the
  `sceneToBuild` subquery, and the helper if nothing else uses it)
- Modify: `src/components/prep/actions.ts`

**Interfaces:**
- Consumes: `/stories/${idStory}/scenes` (Task 3).

- [ ] **Step 1: Write the failing test** in `story-title-menu.test.tsx`. For the storyteller, the
  Build scenes item links to `/stories/42/scenes`, whether or not the story has scenes. Remove the
  tests of making the first scene from the menu.
- [ ] **Step 2: Run it alone; it fails.**
- [ ] **Step 3: Implement.** The Build scenes item is a link to `/stories/${idStory}/scenes` with
  `prefetch={false}`, so nothing loads the page, which can write, before a click. Delete
  `FirstSceneItem`, its `sa_createLiveScene` import, the `buildSceneId` prop, and the
  `item.href === null` branch if nothing else uses it.
- [ ] **Step 4: Run it alone; it passes.**
- [ ] **Step 5: Remove `buildSceneId` everywhere** it is threaded (Files list). Use the LSP's
  references on the prop and on `StoryCard.buildSceneId` to be sure none is left.
- [ ] **Step 6: Tidy `sa_getSceneToBuild`.** If its only caller is now
  `sa_getOrCreateSceneToBuild`, make it the private helper and remove the export. An exported
  server action is an endpoint even when unused. Fix its doc comment, which still says the button
  "leads to the library instead".
- [ ] **Step 7: Type check, lint, `just test`.**
- [ ] **Step 8: Walk through on local dev.** Build scenes from the story page, the library, the
  storyboard, the run page and the builder: it opens the last scene touched. On a story with no
  scenes, it opens a new "New scene".
