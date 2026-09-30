# Database Migration Tools

[dbmate](https://github.com/amacneil/dbmate) manages database migrations

Embrace: forward-only migration strategy, not creating `down` migrations.

---

## Getting Started

Within the `db/` folder:

1. Run `bun install`

### Setup a connection from DataGrip

1. Add a `postgresql` data source using the `+` near the top left of the database explorer. Then enter the following information...
2. Host: `localhost`
3. Port: `5432`
4. Authentication: `User and Password`
5. User: `irun`
6. Password: `games`

You may need to go to the `Schemas` tab, and check the tables, and the schemas in the dropdown.

---

## Basic Usage of database schema migration tool, `dbmate`

### Make & Execute a migration with `dbmate`:

1. Use the `bun run new <migration_name>` command to create a new migration file in the `migrations` folder.
2. Edit the migration file and make the changes.
   - You don't to write 'down' functionality, but the placeholder for it must remain in the file
   - You should be writing your migrations **idempotent**, so you can run the migration multiple times and it should not have any ill effects.
   - e.g. `CREATE TABLE IF NOT EXISTS ...` instead of `CREATE TABLE ...`
3. Shell `bun run migrate` command to apply the changes to the database.
4. Shell `bun run rollback` command to revert the changes.
5. `bun run redo` will rollback the last migration and then run it again

### Make a seeding migration

Our process to seed data is the following:

1. Edit or create a `seeds/seed_<table_name>.sql` file to define the data you want to seed (Use negative IDs for seed data).
2. Once you're finished editing the file, from `apps/formforge/db` run `./make_seed.sh <full seed table filename>` e.g. `./make_seed.sh seed_s_statuses.sql`
3. Edit the migration as appropriate
   - **You either need to edit or delete the script's placeholder `DELETE FROM xxx;` to clean out the table **
4. run the migrations, `bun run migrate`

```bash
bun run migrate
```

### Make a routine migration

To CREATE OR REPLACE a FUNCTION, PROCEDURE, or TRIGGER:

1. create a `.sql` file in the `routines` folder.
2. Run the `make_routine.sh` script in the `db` folder with the name of the routine file as the argument.
   - e.g. `./make_routine.sh my_routine.sql`
3. Check the migration to make sure it's correct.
4. run the migrations, `bun run migrate`

```bash
bun run migrate
```

### Make a view migration

To create or update a VIEW:

1. create a `.sql` file in the `views` folder.
2. Run the `make_view.sh` script in the `db` folder with the name of the view file as the argument.
   - e.g. `./make_view.sh my_view.sql`
3. Check the migration to make sure it's correct.
4. run the migrations, `bun run migrate`

```bash
bun run migrate
```

### Make a one-time migration

A migration that runs once and is never re-run — renaming a table, dropping
one, adding a constraint — goes straight into `migrations`. There is no source
file in `custom/` to keep in step with it, and nothing to re-execute later.

1. `just new <migration_name>` (or `bun run new <migration_name>`) to scaffold
   the file, which arrives with the `-- migrate:up` / `-- migrate:down` headers
   already in place.
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
3. Run the `make_custom.sh` script in the `db` folder with the name of the view file as the argument.

- e.g. `./make_custom.sh my_custom_script.sql`

4. Check the migration to make sure it's correct.
5. run the migrations, `bun run migrate`

New tables should register with the metatable rather than declaring audit
columns by hand: `CALL _p_update_tables();`, then
`UPDATE _tables SET needs_timestamps = TRUE, needs_user_ids = TRUE WHERE table_name = '<table>';`,
then `CALL _p_update_tables_timestamps(); CALL _p_update_tables_user_ids();`.
See `custom/create_story_favorites_table.sql` for the full pattern including
the guard that fails loudly if the table was not registered. A table whose
rows are taken down rather than deleted also sets `needs_archival = TRUE` and
calls `_p_update_tables_archives()`, which adds `is_archived`, `archived_at`
and `id_archived_by_user` with the triggers that keep them in step; see
`custom/create_news_table.sql`.
A table whose rows move through statuses maps itself to a workflow in the same
`UPDATE _tables` and calls the workflow procedures; see
`custom/create_story_sessions_table.sql` and `STATUS_WORKFLOWS.md`.

---

### Common (Aliased) Commands

- `bun run new` — Create a new migration file.
- `bun run migrate` — Apply any pending migrations.
- `bun run rollback` — Revert the last migration.
- `bun run status` — Show the status of the database.

### All Commands

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

### Setting up a Database For Database Driven Status Workflows

All of what you need is in `routines/_tables_metatable`.

1. Create the required tables
   - [`create_tables_table.sql`](routines/_tables_metatable/create_tables_table.sql)
   - [`create_global_settings_table.sql`](routines/_tables_metatable/create_global_settings_table.sql)
   - [`create_s_status_workflows_table.sql`](routines/_tables_metatable/create_s_status_workflows_table.sql)
   - [`create_s_statuses_table.sql`](routines/_tables_metatable/create_s_statuses_table.sql)

2. Create the required routines
   - [`_update_tables.sql`](routines/_tables_metatable/_update_tables.sql)
   - [`_update_workflow_constraints.sql`](routines/_tables_metatable/_update_workflow_constraints.sql)
   - [`_update_workflow_columns.sql`](routines/_tables_metatable/_update_workflow_columns.sql)
   - [`_update_workflow_status_timestamp_triggers.sql`](routines/_tables_metatable/_update_workflow_status_timestamp_triggers.sql)
   - [`_attach_workflow_triggers.sql`](routines/_tables_metatable/_attach_workflow_triggers.sql)

3. Done! See the [Database Driven Status Workflows](https://www.figma.com/board/nA4Llj9n13U7iI1C5rRQzY/-Docs--Database-Driven-Status-Workflows?node-id=0-1&p=f&t=mMUjmB9rPcul0Br5-0) doc for more details on adding a workflow to a specific table.

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
job: correcting what a *fresh* build produces — a seed that names a user who
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
