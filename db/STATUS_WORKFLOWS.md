# Adding or Updating a Status Workflow

## Overview

Status workflows are seeded via custom migration files in `custom/`. The workflow system adds CHECK constraints, status timestamp columns, and transition-enforcement triggers to the target table automatically.

## Prerequisites

The target table **must already have a `status` column** before the workflow seeds run. If it doesn't, create a migration to add it first:

```sql
ALTER TABLE my_table ADD COLUMN IF NOT EXISTS status VARCHAR;
```

## Steps

### 1. Add the workflow to `custom/seed_s_status_workflows.sql`

Use the next lowest negative ID (check the file for the current lowest).

In the `INSERT INTO s_status_workflows` block, add a row:

```sql
(-N, 'My Table Status Workflow', 'status', NULL)
```

In the `UPDATE _tables SET s_status_workflow_ids = CASE` block, map the workflow to the table:

```sql
WHEN table_name = 'my_table' THEN ARRAY[-N]
```

### 2. Add the statuses to `custom/seed_s_statuses.sql`

Add status rows at the end of the `VALUES` block (before the closing `)`), referencing the workflow ID from step 1.

Each row is: `(workflow_id, status_key, description, transition_from_status_keys)`

- `transition_from_status_keys` is an array of status keys that can transition **to** this status
- Use `NULL` if no other status can transition to it (but note: if bidirectional, the initial status should list keys that can return to it)
- Use `<->` to denote bidirectional transitions between adjacent statuses

Example (DRAFT <-> PROPOSED <-> READY <-> ARCHIVED):

```sql
-- My Table: `my_table`
(-N, 'DRAFT', 'New or work-in-progress.', ARRAY['PROPOSED']),
(-N, 'PROPOSED', 'Proposed for review.', ARRAY['DRAFT', 'READY']),
(-N, 'READY', 'Approved and ready for use.', ARRAY['PROPOSED', 'ARCHIVED']),
(-N, 'ARCHIVED', 'Archived.', ARRAY['READY'])
```

### 3. Generate the custom migrations

From `db/formforge/`:

```bash
just custom seed_s_status_workflows.sql
just custom seed_s_statuses.sql
```

This creates timestamped migration files in `migrations/`.

### 4. Run and verify

```bash
just migrate
```

Verify in the database:

- **`s_status_workflows`** has the new row with the correct ID and name
- **`s_statuses`** has rows for each status in the new workflow
- **`_tables`** row for the target table has `s_status_workflow_ids` set to the new workflow ID
- The target table now has:
  - A CHECK constraint on the `status` column
  - Timestamp columns for each status (e.g. `draft_at`, `proposed_at`, etc.)
  - Transition-enforcement triggers
