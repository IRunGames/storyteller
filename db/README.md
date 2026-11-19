# Database Migration Tools

[dbmate](https://github.com/amacneil/dbmate) manages the database migrations. The `just` recipes
at the repo root run it (as `bunx dbmate`, inside `db/`), so they work from any folder in the
repo; `just --list` shows them all.

Migrations are forward only. The `-- migrate:down` header stays in every file, and as a rule
nothing goes under it: a mistake is fixed by a new migration, not by rolling back.

---

## Getting Started

1. In the `db/` folder, run `bun install` once. It installs the dbmate version pinned in
   `package.json`, which `bunx dbmate` then runs.
2. Create `db/.env`, which is gitignored. It holds the connection string and the dbmate settings;
   the deploy workflow passes the same names to dbmate for production:

   ```
   DATABASE_URL="postgres://localhost:5432/<database>?sslmode=disable&search_path=irun"
   DBMATE_MIGRATIONS_TABLE=_dbmate_schema_migrations
   DBMATE_MIGRATIONS_DIR="migrations"
   DBMATE_NO_DUMP_SCHEMA=true
   ```

   `search_path=irun` puts every table in the `irun` schema, so migrations use bare table names.
   The migrations table is not dbmate's default name, and without `DBMATE_MIGRATIONS_TABLE`
   dbmate would try to run every migration again. The web app reads the same database through
   its own `DATABASE_URL` in `apps/web/.env.local`, written differently (see
   [`apps/web/.env.example`](../apps/web/.env.example)).

3. `just migrate` applies every pending migration. `just psql` opens psql on the same database.

### Setup a connection from DataGrip

1. Add a `postgresql` data source using the `+` near the top left of the database explorer. Then enter the following information...
2. Host: `localhost`
3. Port: `5432`
4. Authentication: `User and Password`
5. User: `irun`
6. Password: ... (the password you set for the `irun` user)

You may need to go to the `Schemas` tab, and check the tables, and the schemas in the dropdown.

---

## Basic Usage of database schema migration tool, `dbmate`

### Make & Execute a migration with `dbmate`:

1. `just new <migration_name>` creates a new migration file in the `migrations` folder, with the
   `-- migrate:up` / `-- migrate:down` headers already in place.
2. Edit the migration file and make the changes.
   - Leave the `-- migrate:down` header in the file, with nothing under it.
   - Write the migration **idempotent**, so it can run more than once with no ill effects:
     `CREATE TABLE IF NOT EXISTS ...` instead of `CREATE TABLE ...`, or a `DO` block that checks
     before it acts.
3. `just migrate` applies it.
4. `just redo` runs the most recent migration again: `just rollback` runs its `down` section,
   empty as a rule, and marks it unapplied, then `just migrate` runs it. With an empty `down`
   section that is a second run of the same SQL, which is safe because the migration is
   idempotent.

### Make a seeding migration

Our process to seed data is the following:

1. Edit or create a `seeds/seed_<table_name>.sql` file to define the data you want to seed (Use
   negative IDs for seed data).
2. Once you're finished editing the file, run `just seed <seed file>`, e.g.
   `just seed seed_s_statuses.sql` (the `.sql` may be left off). It wraps the file in a new
   migration.
3. Edit the migration as appropriate
   - **Fill in the script's placeholder `DELETE FROM <table> WHERE xxx IN (xxx);`** with the ids
     the seed inserts. Never clear by `id < 0`: a negative id does not prove the row came from
     this seed.
   - The wrapper calls `_seed_begin` / `_seed_end` round the seed, which take the table's foreign
     keys and triggers off and put them back with a check of every row; `functions/_seed_begin.sql`
     says why
4. Run the migrations, `just migrate`.

### Make a function, procedure or view migration

A function, a procedure or a view keeps its source in a file of its own, named after it, in
`functions/`, `procedures/` or `views/`. To create or replace one:

1. Create or edit its `.sql` file in that folder.
2. Run the recipe for the folder with the file's name (the `.sql` may be left off). It writes a new
   migration that drops the old one by that name and then runs the file:

   | Folder        | Recipe                                                          | Script              |
   | ------------- | --------------------------------------------------------------- | ------------------- |
   | `functions/`  | `just function <file>` (or `just make_function`)                | `make_function.sh`  |
   | `procedures/` | `just proc <file>` (or `just procedure`, `just make_procedure`) | `make_procedure.sh` |
   | `views/`      | `just view <file>` (or `just make_view`)                        | `make_view.sh`      |

   e.g. `just proc _p_set_and_update_table_features`.

3. Check the migration to make sure it's correct.
4. Run the migrations, `just migrate`.

### Make a one-time migration

A migration that runs once and is never re-run — renaming a table, dropping
one, adding a constraint — goes straight into `migrations`. There is no source
file in `custom/` to keep in step with it, and nothing to re-execute later.

1. `just new <migration_name>` to scaffold the file, which arrives with the
   `-- migrate:up` / `-- migrate:down` headers already in place.
2. Write the SQL directly into it. Keep it **idempotent** — `IF NOT EXISTS`,
   or a `DO` block that checks before it acts — so a re-run is harmless.
3. Run the migrations, `just migrate`.

### Make a custom migration

`custom/` is for SQL that may be **repeated or revised and re-executed**: the
table-creation scripts, the foundation capture, anything you expect to edit and
run again. One-time changes do not belong here — see above.

To wrap such a file into a migration (it must **not** contain the comments for
up and down — the script adds them)

1. create a `.sql` file in the `custom` folder.
2. write only the SQL: **no** dbmate markers. `make_custom.sh` wraps the file in
   `-- migrate:up` / `-- migrate:down` itself, so a file that carries them of
   its own would end up with them twice.
3. Run `just custom <file>` (or `just make_custom`) with the name of the custom file, e.g.
   `just custom create_feedback_table.sql`.
4. Check the migration to make sure it's correct.
5. Run the migrations, `just migrate`.

New tables should register with the metatable rather than declaring audit
columns by hand, in one call after the `CREATE TABLE`:

```sql
CALL _p_set_and_update_table_features('<table>',
    p_timestamps := TRUE,
    p_user_ids   := TRUE);
```

It registers the table in `_tables` and raises if it is not there afterwards,
records what the table needs, runs only the procedures those needs call for,
and indexes every foreign key. Its other switches add the rest:
`p_archival` (`is_archived`, `archived_at`, `id_archived_by_user` and the
triggers that keep them in step), `p_system_fields` (`system_by`, `system_at`,
`system_id`, nullable with no default), `p_activity_log`, `p_tags`, `p_kind_values`,
`p_status_workflow_ids` (see [`STATUS_WORKFLOWS.md`](STATUS_WORKFLOWS.md)) and `p_search_fields`;
[`procedures/_p_set_and_update_table_features.sql`](procedures/_p_set_and_update_table_features.sql)
describes each. Copy [`custom/create_invitations_table.sql`](custom/create_invitations_table.sql)
for a plain table, [`custom/create_feedback_table.sql`](custom/create_feedback_table.sql) for one
with a status workflow, and [`custom/create_elements_table.sql`](custom/create_elements_table.sql)
for one with a kind, tags, an activity log and a workflow. Older scripts
(`create_story_favorites_table.sql`, `create_news_table.sql`) spell the same steps out by hand;
don't copy that form.

---

### Common Commands

Every recipe runs in `db/` wherever it is typed.

- `just new <name>` — Create a new migration file.
- `just migrate` — Apply any pending migrations.
- `just status` — Show the status of all migrations.
- `just rollback` — Roll back the most recent migration: run its `down` section, empty as a rule,
  and mark it unapplied.
- `just redo` — Roll back the most recent migration, then re-run it.
- `just custom`, `just seed`, `just function`, `just proc`, `just view` — Wrap a source file into a
  migration (above).
- `just psql` — Open psql on the database in `db/.env`.

### All dbmate Commands

The recipes cover what this project uses. dbmate itself has more, run from `db/` with `bunx`:

- `bunx dbmate --help` — Print usage help.
- `bunx dbmate new` — Generate a new migration file.
- `bunx dbmate up` — Create the database (if it does not already exist) and run any pending migrations.
- `bunx dbmate create` — Create the database.
- `bunx dbmate drop` — Drop the database.
- `bunx dbmate migrate` — Run any pending migrations.
- `bunx dbmate rollback` — Roll back the most recent migration.
- `bunx dbmate down` — Alias for rollback.
- `bunx dbmate status` — Show the status of all migrations (supports `--exit-code` and `--quiet`).
- `bunx dbmate dump` — Write the database `schema.sql` file.
- `bunx dbmate load` — Load `schema.sql` file to the database.
- `bunx dbmate wait` — Wait for the database server to become available.

### The metatable and status workflows

`just migrate` builds the `_tables` metatable and the status-workflow machinery on a fresh
database along with everything else; nothing here is run by hand. The sources:

1. The tables
   - `_tables`: [`create_foundation_tables.sql`](custom/create_foundation_tables.sql), which
     captured it with the other tables that predate dbmate
   - [`create_global_settings_table.sql`](custom/create_global_settings_table.sql)
   - [`create_s_status_workflows_table.sql`](custom/create_s_status_workflows_table.sql)
   - [`create_s_statuses_table.sql`](custom/create_s_statuses_table.sql)

2. The procedures
   - [`_p_update_tables.sql`](procedures/_p_update_tables.sql), which registers every table in
     `_tables`, and the `_p_update_tables_*` procedures beside it that add each feature
   - [`_p_update_workflow_constraints.sql`](procedures/_p_update_workflow_constraints.sql)
   - [`_p_update_workflow_columns.sql`](procedures/_p_update_workflow_columns.sql)
   - [`_p_update_workflow_status_timestamp_triggers.sql`](procedures/_p_update_workflow_status_timestamp_triggers.sql)
   - [`_p_attach_workflow_triggers.sql`](procedures/_p_attach_workflow_triggers.sql)
   - [`_p_attach_status_transition_triggers.sql`](procedures/_p_attach_status_transition_triggers.sql)

3. The trigger functions they attach, in [`functions/_tables_metatable/`](functions/_tables_metatable/).

[`STATUS_WORKFLOWS.md`](STATUS_WORKFLOWS.md) says how to add a workflow and put a table on it.

---

## Editing a migration that has already run

dbmate keys a migration by its **filename** and records nothing else: no
checksum, no copy of the SQL. A row in `_dbmate_schema_migrations` says only
"this version has been applied here". Two consequences follow.

### Editing an applied migration

Changing the body of a migration that has already run **changes only what a
database built from scratch does**. Every database that already holds its
version row skips the file for ever, so nothing re-runs and nothing is
re-checked. That makes editing an applied migration the right tool for one
job: correcting what a _fresh_ build produces — a seed that names a user who
no longer exists, a `CREATE TABLE` missing a column later migrations assume.

The trap is the other half of the same sentence. An already-migrated database
never sees the correction, so the edit is only safe when **it is a no-op
against a database that has already migrated** — when applying old file and
new file in turn would leave the two databases identical. If the edit would
actually change an existing database, it is not an edit at all: write a new
migration with `just new` and let both paths run it.

Before editing an applied migration, ask in this order:

1. Would a fresh build be **wrong** without this edit? If not, do not edit.
2. Does every database that already ran the old version **already satisfy** the
   new one? If not, the edit needs a companion migration that brings them up.
3. Does anything that ran **after** the old version depend on its old output?
   Ordering is by filename, so an edited file re-runs in its original place on
   a fresh build, with everything after it still following.

### Marking a migration applied without running it

Sometimes a fresh-build migration describes a state the live database is
already in — a seed whose data was entered by hand long before the seed file
existed, say. Running it would be wrong (it would delete and re-insert live
rows); leaving it pending would block `just migrate` for ever.

The escape is to insert the version row alone, so dbmate treats the file as
done:

```sql
INSERT INTO _dbmate_schema_migrations (version)
VALUES ('20260929185043')
ON CONFLICT DO NOTHING;
```

This is a claim about that one database, made by hand, and it is only honest
when the database really does hold what the migration would have produced.
Check first, do it on that database only, and say in the commit message which
database was stamped and why — a stamped-but-unapplied migration is invisible
afterwards, and the next person has nothing but the history to learn it from.
