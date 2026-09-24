# Adding or Updating a Status Workflow

## Overview

Status workflows are seeded from `seeds/seed_s_status_workflows.sql` and `seeds/seed_s_statuses.sql`, wrapped with `just seed`. The workflow system adds CHECK constraints, status timestamp columns, and transition-enforcement triggers to the target table automatically.

The first workflow, and the file to copy for the table side, is `story_sessions`: see [`custom/create_story_sessions_table.sql`](custom/create_story_sessions_table.sql).

## Prerequisites

The target table needs a `status` column, and the workflow's statuses must be seeded before the table script calls the workflow procedures. A new table declares the column itself with the default status (`status varchar NOT NULL DEFAULT 'open'`); an existing table adds it first:

```sql
ALTER TABLE my_table ADD COLUMN IF NOT EXISTS status VARCHAR;
```

## Steps

### 1. Add the workflow to `seeds/seed_s_status_workflows.sql`

Use the next lowest negative ID (check the file for the current lowest).

```sql
(-N, 'My Table Status Workflow', 'status', NULL)
```

The mapping from workflow to table is **not** made here: a workflow is seeded
before its table exists, so there is no `_tables` row yet. See step 3.

### 2. Add the statuses to `seeds/seed_s_statuses.sql`

Add status rows at the end of the `VALUES` block in `raw_statuses`, referencing
the workflow ID from step 1. `s_status_id` is numbered downwards automatically.

Each row is: `(workflow_id, status_key, description, transition_from_status_keys)`

- `transition_from_status_keys` is an array of status keys that can transition **to** this status
- Use `ARRAY[]::text[]` if no other status can transition to it (the initial
  status, unless something can return to it). `NULL` is not the same thing:
  `validate_status_transition` skips the check for a status whose list is
  NULL, so any status could move into it
- Rows may be listed in any order and two statuses may point at each other:
  the seed runs with `session_replication_role = 'replica'`, which turns off
  the trigger that checks each listed key already exists, so a workflow
  inserts in one statement
- It helps to write the transitions **from** each status in a comment
  first, then invert them into each row's list, as the example does

Example (open -> suspended or done; suspended -> resumed or done; resumed -> suspended or done):

```sql
-- Story sessions: `story_sessions`
(-1, 'open',      'The session is being played.',                     ARRAY[]::text[]),
(-1, 'suspended', 'The session is paused, to be resumed.',           ARRAY['open', 'resumed']),
(-1, 'resumed',   'The session is being played again after a pause.', ARRAY['suspended']),
(-1, 'done',      'The session has ended.',                          ARRAY['open', 'suspended', 'resumed'])
```

### 3. Map the table to the workflow in its create script

In `custom/create_<table>_table.sql`, after `CALL _p_update_tables()`, set
`s_status_workflow_ids = ARRAY[-N]` in the same `UPDATE _tables` that sets the
`needs_*` flags, then call the five workflow procedures after the audit-column
ones:

```sql
CALL _p_update_workflow_constraints();
CALL _p_update_workflow_columns();
CALL _p_update_workflow_status_timestamp_triggers();
CALL _p_attach_workflow_triggers();
CALL _p_attach_status_transition_triggers();
```

Anything built on the `<status>_at` columns (a generated column, an index)
goes after those calls, because that is when the columns appear. The seed for
`s_statuses` makes the same calls so a later edit to a workflow is applied to
every mapped table on re-seed.

### 4. Generate the migrations

From the repo root, in this order:

```bash
just seed seed_s_status_workflows
just seed seed_s_statuses
just custom create_<table>_table
```

Each creates a timestamped migration in `migrations/`. Edit the two seed
migrations' `DELETE FROM xxx;` placeholders to
`DELETE FROM s_status_workflows WHERE s_status_workflow_id < 0;` and
`DELETE FROM s_statuses WHERE s_status_id < 0;`.

### 5. Run and verify

```bash
just migrate
```

Verify in the database:

- **`s_status_workflows`** has the new row with the correct ID and name
- **`s_statuses`** has rows for each status in the new workflow
- **`_tables`** row for the target table has `s_status_workflow_ids` set to the new workflow ID
- The target table now has:
  - A CHECK constraint on the `status` column
  - Timestamp columns for each status (e.g. `open_at`, `suspended_at`, `resumed_at`, `done_at`)
  - Transition-enforcement triggers
