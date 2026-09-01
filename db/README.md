# FormForge Database Migration Tools

This project utilizes [dbmate](https://github.com/amacneil/dbmate) to manage database migrations for the formforge database.

We are embracing a forward-only migration strategy, and not creating `down` migrations.

---

## Getting Started

All commands must be run inside the virtual machine in docker. Here's how to access it:

```zsh
docker exec -it metaphase_formforge_1 sh -c 'cd apps/formforge && exec sh'
```

### **Connecting to and Setting up the Database(s)**

Within the `apps/formforgedb/` folder:

1. Run `yarn install`
2. Download the 1Password environment file for formforgedb and name it `.env` in this directory

```bash
cp example.env .env
```

Within the `apps/formforge` folder: 3. Run `docker compose up`

### Setup a connection from DataGrip

1. Add a `postgresql` data source using the `+` near the top left of the database explorer. Then enter the following information...
2. Host: `localhost`
3. Port: `5012`
4. Authentication: `User and Password`
5. User: `formforge`
6. Password: `abc123`

You may need to go to the `Schemas` tab, and check the tables, and the schemas in the dropdown.

---

## Basic Usage of database schema migration tool, `dbmate`

### Make & Execute a migration with `dbmate`:

1. Use the `yarn new <migration_name>` command to create a new migration file in the `migrations` folder.
2. Edit the migration file and make the changes.
   - You don't to write 'down' functionality, but the placeholder for it must remain in the file
   - You should be writing your migrations **idempotent**, so you can run the migration multiple times and it should not have any ill effects.
   - e.g. `CREATE TABLE IF NOT EXISTS ...` instead of `CREATE TABLE ...`
3. Shell `yarn migrate` command to apply the changes to the database.
4. Shell `yarn rollback` command to revert the changes.
5. `yarn redo` will rollback the last migration and then run it again

### Make a seeding migration

Our process to seed data is the following:

1. Edit or create a `seeds/seed_<table_name>.sql` file to define the data you want to seed (Use negative IDs for seed data).
2. Once you're finished editing the file, from `apps/formforge/db` run `./make_seed.sh <full seed table filename>` e.g. `./make_seed.sh seed_s_statuses.sql`
3. Edit the migration as appropriate
   - **You either need to edit or delete the script's placeholder `DELETE FROM xxx;` to clean out the table **
4. run the migrations, `yarn migrate`

```bash
yarn migrate
```

### Make a routine migration

To CREATE OR REPLACE a FUNCTION, PROCEDURE, or TRIGGER:

1. create a `.sql` file in the `routines` folder.
2. Run the `make_routine.sh` script in the `db` folder with the name of the routine file as the argument.
   - e.g. `./make_routine.sh my_routine.sql`
3. Check the migration to make sure it's correct.
4. run the migrations, `yarn migrate`

```bash
yarn migrate
```

### Make a view migration

To create or update a VIEW:

1. create a `.sql` file in the `views` folder.
2. Run the `make_view.sh` script in the `db` folder with the name of the view file as the argument.
   - e.g. `./make_view.sh my_view.sql`
3. Check the migration to make sure it's correct.
4. run the migrations, `yarn migrate`

```bash
yarn migrate
```

### Make a custom migration

To create a migration based on some custom migration code (must contain the comments for up and down!!!!)

1. create a `.sql` file in the `custom` folder.
2. make sure it contains the headers for dbmate, e.g. `-- migrate:up`
3. Run the `make_custom.sh` script in the `db` folder with the name of the view file as the argument.

- e.g. `./make_custom.sh my_custom_script.sql`

4. Check the migration to make sure it's correct.
5. run the migrations, `yarn migrate`

---

### Common (Aliased) Commands

- `yarn new` — Create a new migration file.
- `yarn migrate` — Apply any pending migrations.
- `yarn rollback` — Revert the last migration.
- `yarn status` — Show the status of the database.

### All Commands

- `yarn dbmate --help` — Print usage help.
- `yarn dbmate new` — Generate a new migration file.
- `yarn dbmate up` — Create the database (if it does not already exist) and run any pending migrations.
- `yarn dbmate create` — Create the database.
- `yarn dbmate drop` — Drop the database.
- `yarn dbmate migrate` — Run any pending migrations.
- `yarn dbmate rollback` — Roll back the most recent migration.
- `yarn dbmate down` — Alias for rollback.
- `yarn dbmate status` — Show the status of all migrations (supports `--exit-code` and `--quiet`).
- `yarn dbmate dump` — Write the database `schema.sql` file.
- `yarn dbmate load` — Load `schema.sql` file to the database.
- `yarn dbmate wait` — Wait for the database server to become available.

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
