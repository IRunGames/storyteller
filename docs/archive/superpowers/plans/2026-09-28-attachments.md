# Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three inline image URL columns with one `attachments` table, so a story, session or scene can carry several pictures, each knowing whether it is a typed link or an upload, each moving through a status workflow while it uploads.

**Architecture:** A database-first build: the table and its workflow land before any application code. `attachments` is registered with `_tables` in one `_p_set_and_update_table_features()` call, which also builds the `kind` enum column. Two triggers supply the referential integrity a polymorphic `external_id` cannot get from a foreign key. Only then do the Drizzle mirror, the server actions, the uploader and the sweep follow.

**Tech Stack:** Postgres 18 + dbmate, the `_tables` metatable and its status workflows, Drizzle, Next.js App Router server actions, Chakra UI v3 `FileUpload`, `@vercel/blob`, `node:test` + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-attachments-design.md`

## Global Constraints

- **Do not commit.** This repo's rule: never commit or push unless the user asks in that message. Each task ends by staging with `git add` and stopping.
- Prettier width 100. Never run bare `prettier --write` over existing files.
- Workflow id is exactly **-3**; -1 and -2 are taken. Statuses are **UPPER CASE**: `UPLOADING`, `READY`, `ERROR`.
- Enum type name is **`attachments_kind`**, built by `_p_update_tables_kinds()` from declared `kind_values`. Do not write `CREATE TYPE` by hand.
- Kind values, exactly: `STORY`, `STORY_SESSION`, `STORY_SCENE`.
- Sweep grace period, exactly **24 hours**. Blob key layout `uploads/<user-id>/<filename>`, `addRandomSuffix: true`.
- Allowed content types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Max upload `10 * 1024 * 1024`.
- Every exported server action is named `sa_…` and starts `const user = await requireUser()`.
- Migrations are forward-only and idempotent; `-- migrate:down` stays empty. Generate one at a time — two `just` calls in the same second collide on the timestamp and dbmate rejects the second.
- **Never `DROP … CASCADE`.** Find dependants and rebuild them deliberately.
- UI is Chakra v3 compound components; icons from `lucide-react`. Errors inline, confirmations toasted.
- Tests: `node:test` + `expect` + Testing Library through `renderWithProviders`, `mock.module` in `before` then dynamic `await import`. Action tests hit the real database and skip without `DATABASE_URL`.
- Run the suite with `just test`; migrations with `just migrate`.
- `psql` is at `/Applications/Postgres.app/Contents/Versions/latest/bin/psql`; the database is `postgres://localhost:5432/runner?sslmode=disable` with `search_path=irun`.

## Review Focus

Failure modes the spec implies but gives no task of its own. Each one's test is folded into the task that owns the code.

1. **A claim racing a second submit** — the same attachment ids posted twice must attach once and ignore the rest, not error. (Task 6)
2. **An attachment whose parent is deleted mid-upload** — the row is `UPLOADING` with `external_id` set when the scene goes; the delete trigger must take it, leaving no row pointing at nothing. (Task 3)
3. **A `READY` row with a null url** — the CHECK must refuse it however it is reached, including an `UPDATE` that clears the url on an already-ready row. (Task 2)
4. **The sweep running while an upload is in flight** — an `UPLOADING` row younger than the grace period, and its blob, must survive. (Task 10)
5. **A story with several attachments** — the card and list must pick deterministically, ordered by `sort_order` then `id_attachment`, never arbitrarily. (Task 6)

---

### Task 1: The status workflow

**Files:**
- Modify: `db/seeds/seed_s_status_workflows.sql`, `db/seeds/seed_s_statuses.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: workflow `-3`, with statuses `UPLOADING`, `READY`, `ERROR`.

The workflow must exist before the table script runs: `_p_set_and_update_table_features` raises if the declared workflow is not in `s_status_workflows`.

- [ ] **Step 1: Add the workflow**

In `db/seeds/seed_s_status_workflows.sql`, after the `-2` row:

```sql
        (-3, 'Attachments Status Workflow', 'status', NULL);
```

(change the `-2` line's terminating `;` to `,`).

- [ ] **Step 2: Add the statuses**

At the end of the `VALUES` block in `raw_statuses` in `db/seeds/seed_s_statuses.sql`. Each row lists the statuses that may transition **into** it:

```sql
-- Attachments: UPLOADING -> READY or ERROR; ERROR -> UPLOADING (retry).
-- UPLOADING lists only ERROR because a retry is the only *transition* into
-- it; rows arrive there by insert, and the transition trigger is BEFORE
-- UPDATE only, so inserts are never checked. That is also what lets a typed
-- link be inserted straight into READY without faking an upload.
(-3, 'UPLOADING', 'The file is being uploaded.',           ARRAY['ERROR']),
(-3, 'READY',     'The file is stored and can be shown.',  ARRAY['UPLOADING']),
(-3, 'ERROR',     'The upload failed and may be retried.', ARRAY['UPLOADING'])
```

- [ ] **Step 3: Generate the two migrations, one at a time**

```bash
just seed seed_s_status_workflows
sleep 1
just seed seed_s_statuses
```

Edit each migration's placeholder `DELETE FROM xxx;` to
`DELETE FROM s_status_workflows WHERE s_status_workflow_id < 0;` and
`DELETE FROM s_statuses WHERE s_status_id < 0;` respectively.

- [ ] **Step 4: Migrate and verify**

```bash
just migrate
```

```sql
SELECT status_key, transition_from_status_keys FROM s_statuses
WHERE s_status_workflow_id = -3 ORDER BY status_key;
```

Expected: three rows, `ERROR {UPLOADING}`, `READY {UPLOADING}`, `UPLOADING {ERROR}`.

- [ ] **Step 5: Stage, do not commit**

```bash
git add db/seeds/ db/migrations/
```

---

### Task 2: The table

**Files:**
- Create: `db/custom/create_attachments_table.sql`

**Interfaces:**
- Consumes: workflow `-3` from Task 1.
- Produces: `attachments` with `id_attachment`, `kind`, `external_id`, `status`, `url`, `is_uploaded`, `file_name`, `content_type`, `byte_size`, `sort_order`, the audit columns, `activity_log`, and the `<status>_at` columns.

- [ ] **Step 1: Write the create script**

```sql
-- A picture (or later, any file) attached to a story, a session or a scene.
-- Replaces the image_url / image_link columns those tables used to carry: one
-- shape for every kind, several files per object, and -- because a row exists
-- before its bytes do -- an upload that has a state rather than being an
-- event that either happened or did not.
--
-- `kind` is NOT declared here. _p_update_tables_kinds() builds it, and the
-- attachments_kind enum behind it, from the kind_values declared below.
CREATE TABLE IF NOT EXISTS attachments (
    id_attachment integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    -- Null until claimed: a create form uploads before its story, session or
    -- scene exists, and the create action claims the row when it is saved.
    external_id   integer,
    status        varchar NOT NULL DEFAULT 'UPLOADING',
    url           text,
    -- Recorded at write time rather than re-derived from the URL, so a change
    -- of Blob domain cannot silently turn our own files into other people's.
    is_uploaded   boolean NOT NULL DEFAULT FALSE,
    file_name     text,
    content_type  varchar,
    byte_size     bigint,
    sort_order    integer,
    -- What makes READY mean the address exists.
    CONSTRAINT attachments_ready_has_url CHECK (status <> 'READY' OR url IS NOT NULL)
);

-- The whole _tables setup in one call: registration, the needs_* flags, the
-- audit columns and their foreign keys, activity_log, the kind column and its
-- enum, the status workflow, and the foreign-key indexes. It raises if the
-- table is missing from _tables afterwards, or if workflow -3 is unseeded.
CALL _p_set_and_update_table_features('attachments',
    p_timestamps          := TRUE,
    p_user_ids            := TRUE,
    p_activity_log        := TRUE,
    p_status_workflow_ids := ARRAY[-3],
    p_kind_values         := ARRAY['STORY', 'STORY_SESSION', 'STORY_SCENE']);

-- _p_update_tables_kinds() adds the column nullable, as it must for a table
-- that might already hold rows. Every attachment has a kind from the start.
ALTER TABLE attachments ALTER COLUMN kind SET NOT NULL;

-- Written by hand because _p_update_fk_indexes only indexes real foreign
-- keys, and external_id is not one. Every read of this table is "the
-- attachments of this object".
CREATE INDEX IF NOT EXISTS attachments_kind_external_id_idx
    ON attachments (kind, external_id);
```

- [ ] **Step 2: Wrap and migrate**

```bash
just custom create_attachments_table
just migrate
```

- [ ] **Step 3: Verify the metatable really did its work**

```sql
SELECT kind_column, kind_values, has_timestamps, has_user_ids, has_activity_log,
       s_status_workflow_ids
FROM _tables WHERE table_name = 'attachments';
```

Expected: `kind`, `{STORY,STORY_SESSION,STORY_SCENE}`, three `t`, `{-3}`.

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'irun' AND table_name = 'attachments' ORDER BY ordinal_position;
```

Expected to include `kind` (type `attachments_kind`), `uploading_at`, `ready_at`, `error_at`, `activity_log`, `created_at`, `updated_at`, `id_created_by_user`, `id_updated_by_user`.

- [ ] **Step 4: Prove the CHECK and the workflow by hand**

Review Focus 3 — the CHECK must hold however `READY` is reached:

```sql
-- refused: READY with no url
INSERT INTO attachments (kind, status, url) VALUES ('STORY', 'READY', NULL);
-- refused: a ready row having its url cleared
INSERT INTO attachments (kind, status, url) VALUES ('STORY', 'READY', 'https://x/y.jpg');
UPDATE attachments SET url = NULL WHERE status = 'READY';
-- refused: READY -> UPLOADING is not a listed transition
UPDATE attachments SET status = 'UPLOADING' WHERE status = 'READY';
-- allowed
INSERT INTO attachments (kind, status) VALUES ('STORY', 'UPLOADING');
UPDATE attachments SET status = 'ERROR' WHERE status = 'UPLOADING';
UPDATE attachments SET status = 'UPLOADING' WHERE status = 'ERROR';
DELETE FROM attachments;
```

Each of the first four must raise; the rest must succeed.

- [ ] **Step 5: Stage, do not commit**

```bash
git add db/custom/create_attachments_table.sql db/migrations/
```

---

### Task 3: The integrity triggers

**Files:**
- Create: `db/functions/tr_attachments_external_exists.sql`, `db/functions/tr_attachments_delete_for_parent.sql`
- Create: `db/custom/attach_attachments_triggers.sql`

**Interfaces:**
- Consumes: `attachments` from Task 2.
- Produces: `tr_biu_attachments_external_exists` on `attachments`; `tr_ad_stories_attachments`, `tr_ad_story_sessions_attachments`, `tr_ad_story_scenes_attachments` on the three parents.

`external_id` is not a real foreign key — Postgres cannot point one column at three tables — so the integrity it would have given is supplied by triggers instead.

- [ ] **Step 1: Write the exists trigger function**

```sql
/*
Proves an attachment's parent row exists. external_id cannot be a foreign key
because it points at one of three tables depending on kind, so this stands in
for the constraint Postgres cannot express.
*/
CREATE OR REPLACE FUNCTION tr_attachments_external_exists() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
DECLARE
    parent_table TEXT;
    parent_key   TEXT;
    found        BOOLEAN;
BEGIN
    -- A detached row is legal: a create form uploads before its story,
    -- session or scene exists, and claims the row when it is saved.
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- No ELSE: a kind added to the enum and not to this CASE raises the first
    -- time it is used, rather than silently attaching to nothing.
    CASE NEW.kind
        WHEN 'STORY' THEN
            parent_table := 'stories';        parent_key := 'id_story';
        WHEN 'STORY_SESSION' THEN
            parent_table := 'story_sessions'; parent_key := 'id_story_session';
        WHEN 'STORY_SCENE' THEN
            parent_table := 'story_scenes';   parent_key := 'id_story_scene';
    END CASE;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1)', parent_table, parent_key)
        INTO found USING NEW.external_id;

    IF NOT found THEN
        RAISE EXCEPTION 'attachments.external_id % has no % row', NEW.external_id, parent_table;
    END IF;

    RETURN NEW;
END;
$$;
```

- [ ] **Step 2: Write the delete trigger function**

```sql
/*
Deletes a parent's attachments when the parent goes. One function attached to
all three parents: the kind and the parent's primary key name arrive through
TG_ARGV, so adding a kind is an enum value and an attach statement, never an
edit to this body.

OLD has a different key name on each parent, so the value is read generically
rather than named.

The blobs those rows point at are left to the sweep, which is the only thing
that talks to Vercel Blob.
*/
CREATE OR REPLACE FUNCTION tr_attachments_delete_for_parent() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    DELETE FROM attachments
    WHERE kind = TG_ARGV[0]::attachments_kind
      AND external_id = (to_jsonb(OLD) ->> TG_ARGV[1])::integer;
    RETURN OLD;
END;
$$;
```

- [ ] **Step 3: Write the attach script**

```sql
CREATE OR REPLACE TRIGGER tr_biu_attachments_external_exists
    BEFORE INSERT OR UPDATE OF kind, external_id ON attachments
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_external_exists();

CREATE OR REPLACE TRIGGER tr_ad_stories_attachments
    AFTER DELETE ON stories
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_delete_for_parent('STORY', 'id_story');

CREATE OR REPLACE TRIGGER tr_ad_story_sessions_attachments
    AFTER DELETE ON story_sessions
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_delete_for_parent('STORY_SESSION', 'id_story_session');

CREATE OR REPLACE TRIGGER tr_ad_story_scenes_attachments
    AFTER DELETE ON story_scenes
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_delete_for_parent('STORY_SCENE', 'id_story_scene');
```

- [ ] **Step 4: Wrap and migrate, one call per second**

```bash
just function tr_attachments_external_exists.sql
sleep 1
just function tr_attachments_delete_for_parent.sql
sleep 1
just custom attach_attachments_triggers
just migrate
```

- [ ] **Step 5: Verify by hand, including Review Focus 2**

```sql
-- a detached row is allowed
INSERT INTO attachments (kind) VALUES ('STORY_SCENE');
-- a parent that does not exist is refused
INSERT INTO attachments (kind, external_id) VALUES ('STORY_SCENE', 999999);
-- deleting a parent takes its attachments, including one still UPLOADING
INSERT INTO story_scenes (id_story, scene_title) VALUES
    ((SELECT id_story FROM stories LIMIT 1), 'trigger probe')
RETURNING id_story_scene;  -- note the id as :sid
INSERT INTO attachments (kind, external_id, status) VALUES ('STORY_SCENE', :sid, 'UPLOADING');
DELETE FROM story_scenes WHERE id_story_scene = :sid;
SELECT count(*) FROM attachments WHERE kind = 'STORY_SCENE' AND external_id = :sid;  -- 0
-- other kinds untouched
DELETE FROM attachments;
```

The second statement must raise; the final count must be `0`.

- [ ] **Step 6: Stage, do not commit**

```bash
git add db/functions/tr_attachments_*.sql db/custom/attach_attachments_triggers.sql db/migrations/
```

---

### Task 4: The data migration

**Files:**
- Create: one migration via `just new move_image_urls_to_attachments`
- Modify: `db/views/v_story_scenes.sql`

**Interfaces:**
- Consumes: `attachments` and its triggers.
- Produces: a `READY` row per existing URL; `stories.image_url`, `story_sessions.image_link`, `story_scenes.image_link` gone.

- [ ] **Step 1: Find every dependant before dropping anything**

```sql
SELECT DISTINCT dependent.relname
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dependent ON dependent.oid = r.ev_class
JOIN pg_class source ON source.oid = d.refobjid
JOIN pg_attribute a ON a.attrelid = source.oid AND a.attnum = d.refobjsubid
WHERE source.relname IN ('stories', 'story_sessions', 'story_scenes')
  AND a.attname IN ('image_url', 'image_link');
```

`v_story_scenes` is known to select `image_link`. **If this returns anything else, stop and add it to Step 3** — the columns cannot be dropped while a view reads them, and `DROP … CASCADE` is forbidden here.

- [ ] **Step 2: Write the backfill**

```sql
-- migrate:up

-- Every migrated row is is_uploaded = FALSE: Vercel Blob has never been wired
-- up, so every URL in the database today is a link someone typed.
-- NOT EXISTS keeps a re-run harmless, as forward-only migrations require.
INSERT INTO attachments (kind, external_id, status, url, is_uploaded, sort_order,
                         id_created_by_user, id_updated_by_user)
SELECT 'STORY', s.id_story, 'READY', s.image_url, FALSE, 0,
       s.id_created_by_user, s.id_updated_by_user
FROM stories s
WHERE s.image_url IS NOT NULL AND btrim(s.image_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM attachments a
                  WHERE a.kind = 'STORY' AND a.external_id = s.id_story);

INSERT INTO attachments (kind, external_id, status, url, is_uploaded, sort_order,
                         id_created_by_user, id_updated_by_user)
SELECT 'STORY_SESSION', ss.id_story_session, 'READY', ss.image_link, FALSE, 0,
       ss.id_created_by_user, ss.id_updated_by_user
FROM story_sessions ss
WHERE ss.image_link IS NOT NULL AND btrim(ss.image_link) <> ''
  AND NOT EXISTS (SELECT 1 FROM attachments a
                  WHERE a.kind = 'STORY_SESSION' AND a.external_id = ss.id_story_session);

INSERT INTO attachments (kind, external_id, status, url, is_uploaded, sort_order,
                         id_created_by_user, id_updated_by_user)
SELECT 'STORY_SCENE', sc.id_story_scene, 'READY', sc.image_link, FALSE, 0,
       sc.id_created_by_user, sc.id_updated_by_user
FROM story_scenes sc
WHERE sc.image_link IS NOT NULL AND btrim(sc.image_link) <> ''
  AND NOT EXISTS (SELECT 1 FROM attachments a
                  WHERE a.kind = 'STORY_SCENE' AND a.external_id = sc.id_story_scene);
```

- [ ] **Step 3: Rebuild the view without `image_link`, then drop the columns**

In the same migration, after the inserts. Edit `db/views/v_story_scenes.sql` to remove `image_link` from its select list first, and paste the resulting `CREATE OR REPLACE VIEW` here — a column cannot be removed from a view by `CREATE OR REPLACE`, so the view is dropped and recreated **by name**, never with `CASCADE`:

```sql
DROP VIEW IF EXISTS v_story_scenes;
-- <paste the edited CREATE VIEW v_story_scenes ... here>

ALTER TABLE stories        DROP COLUMN IF EXISTS image_url;
ALTER TABLE story_sessions DROP COLUMN IF EXISTS image_link;
ALTER TABLE story_scenes   DROP COLUMN IF EXISTS image_link;

-- migrate:down
```

`story_scenes.search_text` is generated from status, title and description only — its column comment says the picture is deliberately excluded — so the generated column needs no rebuild. Confirm that before dropping:

```sql
SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef
WHERE adrelid = 'story_scenes'::regclass;
```

- [ ] **Step 4: Migrate and verify the counts match**

```bash
just migrate
```

```sql
SELECT kind, count(*) FROM attachments GROUP BY kind ORDER BY kind;
SELECT count(*) FROM attachments WHERE status <> 'READY' OR url IS NULL;  -- 0
```

- [ ] **Step 5: Stage, do not commit**

```bash
git add db/views/v_story_scenes.sql db/migrations/
```

---

### Task 5: The Drizzle mirror

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Create: `apps/web/src/lib/attachments.ts`

**Interfaces:**
- Consumes: the `attachments` table.
- Produces: `schema.attachments`, `AttachmentKind`, `Attachment`.

- [ ] **Step 1: Add the table, remove the old columns**

In `schema.ts`, beside the other tables:

```ts
// Files attached to a story, session or scene. `kind` says which, and
// `external_id` which row -- not a foreign key, because Postgres cannot point
// one column at three tables; tr_biu_attachments_external_exists stands in for
// the constraint. status runs through the attachments workflow in s_statuses,
// so it is a plain varchar here for the same reason story_scenes.status is.
export const attachments = pgTable("attachments", {
  idAttachment: integer("id_attachment").primaryKey().generatedByDefaultAsIdentity(),
  kind: varchar("kind").notNull(),
  idExternal: integer("external_id"),
  status: varchar("status")
    .notNull()
    .default(sql`DEFAULT`),
  url: text("url"),
  isUploaded: boolean("is_uploaded").notNull().default(false),
  fileName: text("file_name"),
  contentType: varchar("content_type"),
  byteSize: bigint("byte_size", { mode: "number" }),
  sortOrder: integer("sort_order"),
  activityLog: jsonb("activity_log")
    .default(sql`'[]'::jsonb`)
    .notNull(),
  uploadingAt: timestamp("uploading_at", { withTimezone: true }),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  errorAt: timestamp("error_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});
```

Delete `imageUrl` from `stories`, and `imageLink` from `storySessions` and `storyScenes`. Remove `imageLink` from the `vStoryScenes` view definition too.

- [ ] **Step 2: Add the view type**

```ts
// apps/web/src/lib/attachments.ts

/** Which kind of row an attachment hangs off. Mirrors the attachments_kind enum. */
export type AttachmentKind = "STORY" | "STORY_SESSION" | "STORY_SCENE";

/** One attachment as a form or a card sees it. */
export type Attachment = {
  idAttachment: number;
  kind: AttachmentKind;
  /** Null until a create form's parent row exists and claims it. */
  idExternal: number | null;
  /**
   * The status the row holds, as the database has it. Not narrowed to the
   * statuses the workflow lists today: those live in s_statuses.
   */
  status: string;
  /** Null while UPLOADING; the CHECK makes READY mean this is set. */
  url: string | null;
  /** True for a file we put in Blob, false for a link someone typed. */
  isUploaded: boolean;
  fileName: string | null;
};
```

- [ ] **Step 3: Compile and run the suite**

Run: `just test`
Expected: failures only where code still reads `imageUrl` / `imageLink` — those are Tasks 8 and 9. Note the failing files; do not fix them here.

- [ ] **Step 4: Stage, do not commit**

```bash
git add apps/web/src/db/schema.ts apps/web/src/lib/attachments.ts
```

---

### Task 6: The attachment server actions

**Files:**
- Create: `apps/web/src/components/uploads/actions.ts`, `apps/web/src/components/uploads/actions.test.ts`

**Interfaces:**
- Consumes: `schema.attachments`, `Attachment`, `requireUser`, `isUploadedBlobUrl` (Task 7).
- Produces: `sa_createAttachment`, `sa_markAttachmentReady`, `sa_markAttachmentError`, `sa_retryAttachment`, `sa_deleteAttachment`, `sa_listAttachments`, `sa_claimAttachments`.

This task owns Review Focus 1 and 5.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/components/uploads/actions.test.ts
// Real database, skipped without DATABASE_URL, per the standards. Mock
// getSession from @/lib/require-session, import @/db lazily inside before(),
// create fixtures, clean up in before() and after(), close the pool.
//
// Cases:
//  - sa_createAttachment with a url inserts READY, is_uploaded false
//  - sa_createAttachment without a url inserts UPLOADING, is_uploaded true, url null
//  - sa_createAttachment stamps id_created_by_user from the session, never the client
//  - sa_markAttachmentReady moves UPLOADING -> READY and sets the url
//  - sa_markAttachmentError moves UPLOADING -> ERROR; sa_retryAttachment moves back
//  - sa_deleteAttachment refuses a row created by another user
//  - sa_listAttachments returns only the object's rows, ordered by
//    sort_order then id_attachment  (Review Focus 5)
```

Write each body out following `components/feedback/actions.test.ts`. The three
that pin Review Focus items are given in full, because nothing else covers
them:

```ts
// Review Focus 5: several attachments must order deterministically.
it("lists an object's attachments by sort_order then id", async () => {
  const [a] = await db.insert(attachments).values({
    kind: "STORY_SCENE", idExternal: sceneId, status: "READY",
    url: "https://x/a.jpg", sortOrder: 2, idCreatedByUser: userId,
  }).returning({ id: attachments.idAttachment });
  const [b] = await db.insert(attachments).values({
    kind: "STORY_SCENE", idExternal: sceneId, status: "READY",
    url: "https://x/b.jpg", sortOrder: 1, idCreatedByUser: userId,
  }).returning({ id: attachments.idAttachment });

  const rows = await sa_listAttachments("STORY_SCENE", sceneId);

  expect(rows.map((r) => r.idAttachment)).toEqual([b.id, a.id]);
});

// Review Focus 1: a double-submitted form must attach once and not throw.
it("claims the same ids twice without erroring, attaching once", async () => {
  const [row] = await db.insert(attachments).values({
    kind: "STORY_SCENE", idExternal: null, status: "UPLOADING",
    idCreatedByUser: userId,
  }).returning({ id: attachments.idAttachment });

  await sa_claimAttachments("STORY_SCENE", sceneId, [row.id]);
  await sa_claimAttachments("STORY_SCENE", otherSceneId, [row.id]);

  const [after] = await db.select({ idExternal: attachments.idExternal })
    .from(attachments).where(eq(attachments.idAttachment, row.id));
  // The second claim matched nothing, because external_id was no longer null.
  expect(after.idExternal).toBe(sceneId);
});

it("refuses to claim a row created by another user", async () => {
  const [row] = await db.insert(attachments).values({
    kind: "STORY_SCENE", idExternal: null, status: "UPLOADING",
    idCreatedByUser: otherUserId,
  }).returning({ id: attachments.idAttachment });

  await sa_claimAttachments("STORY_SCENE", sceneId, [row.id]);

  const [after] = await db.select({ idExternal: attachments.idExternal })
    .from(attachments).where(eq(attachments.idAttachment, row.id));
  expect(after.idExternal).toBeNull();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `just test --test-name-pattern "sa_createAttachment"`
Expected: FAIL — cannot find module `./actions`.

- [ ] **Step 3: Write the actions**

```ts
"use server";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { isUploadedBlobUrl } from "@/lib/image-uploads";
import type { Attachment, AttachmentKind } from "@/lib/attachments";

const { attachments } = schema;

export async function sa_createAttachment(input: {
  kind: AttachmentKind;
  idExternal: number | null;
  url?: string;
  fileName?: string;
  contentType?: string;
  byteSize?: number;
}): Promise<{ idAttachment: number; status: string }> {
  const user = await requireUser();
  // A url means a typed link, which is READY at once. No url means an upload
  // is about to start, so the row exists to be marked ready or failed.
  const isLink = !!input.url;
  const [row] = await db
    .insert(attachments)
    .values({
      kind: input.kind,
      idExternal: input.idExternal,
      status: isLink ? "READY" : sql`DEFAULT`,
      url: input.url ?? null,
      isUploaded: !isLink,
      fileName: input.fileName ?? null,
      contentType: input.contentType ?? null,
      byteSize: input.byteSize ?? null,
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .returning({ idAttachment: attachments.idAttachment, status: attachments.status });
  return row;
}
```

`sa_markAttachmentReady`, `sa_markAttachmentError` and `sa_retryAttachment` each `requireUser()`, then update `status` (and `url` for ready) `WHERE id_attachment = $1 AND id_created_by_user = user.id`, stamping `idUpdatedByUser`.

`sa_deleteAttachment` reads the row, refuses unless `idCreatedByUser === user.id`, calls `del(url)` when `isUploaded && isUploadedBlobUrl(url)` — two independent conditions — then deletes the row.

`sa_listAttachments(kind, idExternal)` selects the projection in `Attachment`, `orderBy(asc(attachments.sortOrder), asc(attachments.idAttachment))`.

```ts
export async function sa_claimAttachments(
  kind: AttachmentKind,
  idExternal: number,
  ids: number[],
): Promise<void> {
  const user = await requireUser();
  if (ids.length === 0) return;

  // All four conditions carry weight. Without `external_id IS NULL` a caller
  // could re-point an attachment already on someone else's scene; without the
  // creator check they could claim one they never uploaded; the kind match
  // stops a story picture being claimed as a scene's. A claim that matches
  // nothing is ignored rather than raised -- a double-submitted form should
  // not fail, and the user could do nothing about it if it did.
  await db
    .update(attachments)
    .set({ idExternal, idUpdatedByUser: user.id, updatedAt: new Date() })
    .where(
      and(
        inArray(attachments.idAttachment, ids),
        eq(attachments.kind, kind),
        isNull(attachments.idExternal),
        eq(attachments.idCreatedByUser, user.id),
      ),
    );
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `just test --test-name-pattern "Attachment"`
Expected: PASS.

- [ ] **Step 5: Stage, do not commit**

```bash
git add apps/web/src/components/uploads/
```

---

### Task 7: Blob store, dependency and upload route

**Files:**
- Create: `apps/web/src/lib/image-uploads.ts`, `apps/web/src/lib/image-uploads.test.ts`, `apps/web/src/app/api/blob/upload/route.ts`, `apps/web/src/app/api/blob/upload/route.test.ts`
- Modify: `apps/web/package.json`, `apps/web/technologies.md`, `apps/web/docs/standards.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES`, `uploadPrefix`, `isUploadedBlobUrl`, `isOwnUploadedBlobUrl`, `POST /api/blob/upload`.

**This task is unchanged from the superseded plan** `docs/superpowers/plans/2026-09-28-image-upload-field.md`, Tasks 1–3. Follow those tasks verbatim — the helper, its tests including the lookalike-hostname and trailing-dot cases, the provisioning commands, the route handler with its prefix check, and the `technologies.md` and `standards.md` bullets. Nothing in the attachments design changes them.

The only difference: `sa_deleteUploadedImage` from that plan's Task 3 is **not** built. `sa_deleteAttachment` (Task 6) does that job, because deletion is now driven by a row rather than a bare URL.

---

### Task 8: The attachment list field

**Files:**
- Create: `apps/web/src/components/uploads/attachment-list-field.tsx`, `apps/web/src/components/uploads/attachment-list-field.test.tsx`

**Interfaces:**
- Consumes: Tasks 6 and 7, `useUser`.
- Produces: `AttachmentListField({ kind, idExternal, value, onChange })`, a controlled field holding `number[]` — the attachment ids the form will claim.

- [ ] **Step 1: Write the failing tests**

```tsx
// Mock @vercel/blob/client, ./actions and the user provider in before(), then
// dynamic import. Cases:
//  - a typed URL calls sa_createAttachment with that url and adds its id
//  - an accepted file creates an UPLOADING row, uploads, then marks it ready
//  - a failed upload calls sa_markAttachmentError and shows inline text,
//    leaving the other attachments untouched
//  - an ERROR row renders a Retry button that calls sa_retryAttachment
//  - remove calls sa_deleteAttachment and drops the id from the value
//  - several attachments render in the order given
//  - on a create form (idExternal null) the ids are collected and no claim
//    is attempted from the component
```

- [ ] **Step 2: Run and watch them fail**

Run: `just test --test-name-pattern "AttachmentListField"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

A `Field.Root` containing a URL `Input`, a `FileUpload.Root` dropzone with `accept` and `maxFileSize` matching the route handler, and a list of the current attachments, each with a thumbnail, its file name, a remove button, and a Retry button when `status === "ERROR"`. Responsive: the list is a `Stack`, `column` at `base` and `row` from `sm`.

Upload sequence per file: `sa_createAttachment({ kind, idExternal, fileName, contentType, byteSize })` → `upload()` keyed `uploads/<user-id>/<filename>` with `handleUploadUrl: "/api/blob/upload"` → `sa_markAttachmentReady(id, blob.url)`, or `sa_markAttachmentError(id)` on failure. The ticket pattern from the superseded plan's Task 5 still applies: a second file chosen while the first is uploading must not be overwritten by the slower one.

- [ ] **Step 4: Run and watch them pass**

Run: `just test --test-name-pattern "AttachmentListField"`

- [ ] **Step 5: Stage, do not commit**

```bash
git add apps/web/src/components/uploads/attachment-list-field.tsx apps/web/src/components/uploads/attachment-list-field.test.tsx
```

---

### Task 9: The story form and card

**Files:**
- Modify: `apps/web/src/lib/story-schemas.ts`, `apps/web/src/components/stories/story-form.tsx`, `apps/web/src/components/stories/story-card.tsx`, `apps/web/src/app/(app)/(nav)/stories/actions.ts`, and their tests

**Interfaces:**
- Consumes: Tasks 6 and 8.
- Produces: stories carrying attachments instead of a column.

- [ ] **Step 1: Update the schema and its test**

Remove `imageUrl` from `storyFields` in `story-schemas.ts`. **Keep the protocol-pinned URL rule** — move it to `attachment-schemas.ts` and use it in `sa_createAttachment`'s validation, because the value still lands in a CSS `url("…")` on the story card and `javascript:` must never get that far. The card still encodes the value; both halves are needed.

- [ ] **Step 2: Update the form**

`story-form.tsx` replaces its `Input type="url"` with `AttachmentListField` bound through `Controller` on a new `attachmentIds` field. On create, `sa_createStory` receives those ids and calls `sa_claimAttachments` inside its transaction; on edit, `idExternal` is the story id and the component attaches directly, so the form posts no ids.

- [ ] **Step 3: Update the card**

`story-card.tsx` takes its picture from `sa_getStory`'s projection, which now joins the newest `READY` attachment for the story, ordered by `sort_order` then `id_attachment`.

- [ ] **Step 4: Run the whole suite**

Run: `just test`
Expected: green, including the files Task 5 left failing.

- [ ] **Step 5: Stage, do not commit**

```bash
git add apps/web/src/lib/ apps/web/src/components/stories/ "apps/web/src/app/(app)/(nav)/stories/"
```

---

### Task 10: The sweep

**Files:**
- Create: `apps/web/src/lib/blob-sweep.ts`, `apps/web/src/lib/blob-sweep.test.ts`, `apps/web/src/app/api/cron/blob-sweep/route.ts`, `apps/web/src/app/api/cron/blob-sweep/route.test.ts`

**Interfaces:**
- Consumes: `attachments`, `isUploadedBlobUrl`.
- Produces: `GRACE_MS`, `staleBlobs`, `unclaimedAttachmentIds`, `GET /api/cron/blob-sweep`.

This task owns Review Focus 4.

- [ ] **Step 1: Write the failing tests for the decisions**

Two pure functions, tested exhaustively without a database or a blob store — `staleBlobs(blobs, referenced, now)` exactly as in the superseded plan's Task 7 (including the boundary case), plus:

```ts
const OLD = new Date("2026-09-20T00:00:00Z");
const RECENT = new Date("2026-09-27T23:50:00Z");
const NOW = new Date("2026-09-28T00:00:00Z");

describe("unclaimedAttachmentIds", () => {
  it("returns a detached row past the grace period", () => {
    const rows = [{ idAttachment: 1, idExternal: null, createdAt: OLD }];

    expect(unclaimedAttachmentIds(rows, NOW)).toEqual([1]);
  });

  // Review Focus 4: an upload sitting in a form the user has not submitted is
  // detached and unreferenced, and sweeping it would take the picture out from
  // under them mid-edit. This is the case the grace period exists for.
  it("keeps a detached row uploaded minutes ago", () => {
    const rows = [{ idAttachment: 1, idExternal: null, createdAt: RECENT }];

    expect(unclaimedAttachmentIds(rows, NOW)).toEqual([]);
  });

  it("keeps an attached row however old", () => {
    const rows = [{ idAttachment: 1, idExternal: 42, createdAt: OLD }];

    expect(unclaimedAttachmentIds(rows, NOW)).toEqual([]);
  });

  it("treats a row exactly on the boundary as still within its grace", () => {
    const rows = [
      { idAttachment: 1, idExternal: null, createdAt: new Date(NOW.getTime() - GRACE_MS) },
    ];

    expect(unclaimedAttachmentIds(rows, NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `just test --test-name-pattern "unclaimedAttachmentIds"`

- [ ] **Step 3: Write the decisions and the route**

The route authorises on `CRON_SECRET`, then two passes, both on the 24-hour grace period:

1. **Unreferenced blobs** — the referenced set is now one query,
   `SELECT url FROM attachments WHERE is_uploaded AND url IS NOT NULL`, rather
   than three tables.
2. **Unclaimed attachments** — rows with `external_id IS NULL` past the grace
   period are deleted, and their blobs with them.

- [ ] **Step 4: Run and watch them pass**

Run: `just test --test-name-pattern "blob-sweep"`

- [ ] **Step 5: Schedule it**

Daily cron at `/api/cron/blob-sweep`, `CRON_SECRET` in the project environment. Check which config file the repo uses; if neither `vercel.json` nor `vercel.ts` exists, create `vercel.ts` with `@vercel/config` and add its `technologies.md` bullet.

- [ ] **Step 6: Run the whole suite, then stage**

Run: `just test`
Expected: green.

```bash
git add apps/web/src/lib/blob-sweep.ts apps/web/src/lib/blob-sweep.test.ts apps/web/src/app/api/cron/
```

---

## After the plan

The scene create/edit form is the next piece of work. It was designed in conversation on the bounded path, deliberately has no plan document, and builds on `AttachmentListField` from Task 8 — with `kind: "STORY_SCENE"` and the same claim-on-create flow Task 9 establishes for stories.
