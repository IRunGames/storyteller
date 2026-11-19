# Pull request environments

Status: planned, not started (written 2026-11-18). Tracked in issue #1. Work on this when pull
requests become the way changes reach `main`.

## Goal

Every pull request gets an environment of its own, kept up to date on each
push and removed when the pull request closes:

- its own Neon database branch, migrated with the pull request's migrations;
- the full test suite, database tests included, run against that branch;
- a Vercel preview deployment that uses that branch, its URL posted on the
  pull request;
- nothing it does can reach production's data, files, realtime topics or
  mail.

This also delivers review item G2 (database tests in CI), which was held
until pull requests exist.

## How production works today

- `.github/workflows/deploy.yml` runs on every push to `main`: `npm ci`, the
  unit tests (the database tests skip because CI has no `DATABASE_URL`),
  `vercel pull --environment=production`, `vercel build --prod`, dbmate
  migrations against the Neon `production` branch, then
  `vercel deploy --prebuilt --prod`. Secrets live in the repo's
  `production` GitHub environment.
- Neon has one branch, `production` (the default, a root branch). Local
  development runs on a local Postgres.
- The production database URL carries `&search_path=irun`; every branch URL
  will need the same.
- `just preview` deploys a preview from a developer's machine with the
  Vercel project's Preview settings.
- Seeds are migrations (review item A6), so every database built from the
  migrations gets the seed rows.

## What a preview must not share with production

Each of these is a real path from a preview to production, and the plan
closes each one.

- **Database.** A branch copied from `production` holds real users' emails,
  stories and chat. A preview behind a URL is the wrong place for that, so
  pull request branches come from a `preview-base` branch built from the
  migrations alone (schema plus seed rows, no user data). A schema-only copy
  of production is not enough: it leaves `_dbmate_schema_migrations` empty,
  so dbmate would try to run every migration again.
- **Uploaded files.** Upload paths sit under the uploading user's prefix in
  the one Blob store. A preview using production's store, with a copy of
  production's rows, would delete production's files when someone removes
  an attachment there. Previews get their own Blob store.
- **Realtime.** Topics are `story/<id>/…` (`lib/realtime/topics.ts`), and
  the seed stories exist in production too, so a preview publishing on the
  production broker would reach real players' tables. Previews need a
  non-production broker, or at least an environment prefix on every topic.
- **Mail.** Already handled: anywhere but production, `lib/email.ts` sends
  to `EMAIL_NON_PRODUCTION_TO`, or sends nothing when it is unset.
- **Scheduled jobs.** Vercel runs the crons in `apps/web/vercel.json` only
  for production deployments, so previews never sweep anything.

## Phase 0: check before building

- [ ] Read the Vercel project's settings (the Vercel connection used while
      writing this plan had no access to the `storyteller4` team):
  - Is the Git integration creating its own preview deployments for
    branches? If so, they would run without a database branch; turn it
    off for this project (`"git": { "deploymentEnabled": false }` in
    `vercel.json`, or the project setting) so the workflow is the only
    thing that deploys previews.
  - Which `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` and `MQTT_*` do the
    Preview variables hold today? If they are production's, `just preview`
    already writes to production; fix that first, whatever happens to the
    rest of this plan.
- [ ] Confirm `vercel deploy --prebuilt --env NAME=value` sets a runtime
      variable on that one deployment in the current Vercel CLI (it is how
      the branch's `DATABASE_URL` reaches the preview). If not, use a Preview
      variable scoped to the pull request's Git branch (`vercel env add
    DATABASE_URL preview <branch>`), removed on close.
- [ ] Better Auth on a preview: decide how it learns its own origin. Either
      let it take the origin from the request when `BETTER_AUTH_URL` is unset
      (check the installed version's behaviour and its trusted-origins check),
      or alias each preview to a fixed hostname such as
      `pr-<number>-storyteller.vercel.app` and set `BETTER_AUTH_URL` to it.
- [ ] Google sign-in cannot work on previews: Google accepts only exact
      redirect URIs. Previews use email and password. Decide whether the
      Google button hides when `GOOGLE_CLIENT_ID` is unset (a change visible
      on previews only), or stays and fails there.
- [ ] Check the Neon plan's limits on branch count and storage, and on root
      branches if `preview-base` is made as one.
- [ ] Check that `just migrate` on an empty database succeeds from the first
      migration to the last. Early migrations lack `IF NOT EXISTS` guards
      (review item F3), which is harmless on an empty database, but no one has
      run the whole chain from scratch recently.

## Phase 1: shared non-production pieces (one-time setup)

- [ ] **Neon `preview-base` branch:** an empty database with every migration
      applied, so it holds the schema and the seed rows and no user data.
      Protect it from deletion. Record its id.
- [ ] **Keep `preview-base` current:** after `deploy.yml` migrates
      production, migrate `preview-base` too (a second dbmate step with its own
      secret), so new pull request branches start from `main`'s schema.
- [ ] **Blob:** a second Vercel Blob store connected to the Preview
      environment only.
- [ ] **Realtime:** a non-production MQTT deployment for every preview (and,
      if wanted, local development), with its own player login. If a second
      broker is not worth it, use the topic prefix in phase 2 against the
      production broker, with a broker rule that keeps the preview player
      login inside its prefix.
- [ ] **Vercel Preview variables:** `NEXT_PUBLIC_ENVIRONMENT=STAGING`, the
      preview Blob token, the non-production `MQTT_*`, `RESEND_API_KEY` with
      `EMAIL_NON_PRODUCTION_TO`, no Google credentials, and no
      `DATABASE_URL` (each deployment gets its branch's).
- [ ] **GitHub `preview` environment** with `NEON_API_KEY`, the Neon project
      id, and the three Vercel ids and token that `production` already has.
      Pull request workflows read only this environment, never `production`.

## Phase 2: app changes (with tests)

- [ ] Topic prefix by environment, if phase 1 shares a broker:
      `storyTopicPrefix()` in `lib/realtime/topics.ts` puts the environment's
      prefix before `story/`; the browser's subscriptions use the same helper.
      Production's prefix stays empty, so production's topics do not change.
- [ ] Auth origin on previews, per the phase 0 decision (`lib/auth.ts`).
- [ ] Google sign-in when unconfigured, per the phase 0 decision.
- [ ] `lib/env.ts` (review item G6) marks the preview-only gaps as optional:
      Google credentials, and anything else a preview deliberately leaves
      out.

## Phase 3: `.github/workflows/preview.yml`

Runs on `pull_request` (opened, synchronize, reopened) for branches in this
repository; GitHub withholds secrets from forks, so forks get no preview.
`concurrency` is one group per pull request with `cancel-in-progress: true`,
since only the latest push matters. Permissions: `contents: read`,
`pull-requests: write` (for the comment).

1. Checkout, Node 24, `npm ci`, lint, type check, unit tests.
2. Create the Neon branch `preview/pr-<number>` from `preview-base` with an
   expiry of 14 days, or, on a later push, reset it from its parent so every
   push starts clean (data typed into the preview is lost on each push; an
   edited migration would otherwise never re-run). Use Neon's GitHub
   actions (`create-branch-action`, `reset-branch-action`), each pinned to a
   commit as `deploy.yml` pins `setup-bun`. Take the direct URL and append
   `&search_path=irun`.
3. Run the pull request's pending migrations against the branch with
   dbmate, with the same settings `deploy.yml` gives (migrations table
   `_dbmate_schema_migrations`, no schema dump).
4. Run the database tests against the branch (`DATABASE_URL` set to it).
   They make and remove their own `@example.test` fixtures, so a throwaway
   branch is exactly what they want.
5. `vercel pull --environment=preview`, `vercel build`, then
   `vercel deploy --prebuilt` with the branch's `DATABASE_URL` (and
   `BETTER_AUTH_URL` if phase 0 chose a fixed hostname), then the alias if
   one was chosen.
6. Post or update one comment on the pull request with the preview URL, the
   Neon branch name, and the migrations applied.

## Phase 4: cleanup

- [ ] `.github/workflows/preview-cleanup.yml` on `pull_request` closed:
      delete the Neon branch (`delete-branch-action`, pinned), remove the
      alias or branch-scoped variable if phase 0 needed one. The 14-day
      expiry covers a run that never happens.
- [ ] Files uploaded on previews stay in the preview Blob store. Either
      accept that (it is not production's), or add a scheduled job that
      empties the preview store of files no live preview branch references.

## Phase 5: `main` and docs

- [ ] Optionally protect `main`: require the preview workflow's checks to
      pass before merging, and stop pushing to `main` directly.
- [ ] `deploy.yml` keeps deploying production on every push to `main`.
      Since checks already ran on the pull request, decide whether it still
      runs the unit tests (cheap; keep them).
- [ ] Document the flow (where previews come from, what they share, how to
      reset `preview-base`) in `apps/web/docs/` beside `auth.md`, and point
      `CLAUDE.md` at it.

## Verification

- Open a pull request that adds a trivial migration and a visible text
  change. The workflow comments a URL; the preview shows the change; the
  Neon console lists `preview/pr-<n>` with the migration applied and
  `production` without it.
- Sign up on the preview and upload a picture: the account exists only in
  the pull request's branch, and the file is in the preview Blob store.
- Open a story's table in two preview browsers: realtime works between them
  and nothing appears on production's broker (or production's topics).
- Push again: the branch resets and migrates again, and the comment updates.
- Close the pull request: the branch is gone within a minute.
- The production deploy on merge behaves exactly as before.
