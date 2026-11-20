# Storyteller

A tabletop role-playing companion. A storyteller prepares a story's scenes and elements, runs
them at a table that players follow live from their own screens, and keeps the sessions and
stat blocks in one place. It is a Next.js web app over a Postgres database, in one repository run
with npm workspaces, turbo and [`just`](https://github.com/casey/just).

## Layout

| Path          | Holds                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/`   | The web app: Next.js App Router, Chakra UI v3, Drizzle, Better Auth. Its docs are in `apps/web/docs/`.                                           |
| `db/`         | The database: dbmate migrations in `db/migrations/` and the SQL they are made from (`custom/`, `functions/`, `procedures/`, `views/`, `seeds/`). |
| `docs/`       | Decision records (`adr/`), plans for work not yet done (`plans/`), and finished plans kept for history (`archive/`).                             |
| `GLOSSARY.md` | The words the project uses for its own ideas.                                                                                                    |
| `justfile`    | Every task: `just --list` shows them.                                                                                                            |

## Getting started

You need:

- Node 24 (the version in `.nvmrc`; `nvm use` picks it up) and the npm that comes with it.
- [Bun](https://bun.sh), which runs dbmate for the migration recipes.
- [`just`](https://github.com/casey/just).
- PostgreSQL 18 or later, running locally. The schema uses `uuidv7()`, which is new in 18.

Then, from the repo root:

1. Install the dependencies:

   ```sh
   npm ci
   (cd db && bun install)
   ```

2. Create an empty database, e.g. `createdb storyteller`. The migrations put every table in an
   `irun` schema inside it.

3. Create `db/.env` for dbmate:

   ```
   DATABASE_URL="postgres://localhost:5432/storyteller?sslmode=disable&search_path=irun"
   DBMATE_MIGRATIONS_TABLE=_dbmate_schema_migrations
   DBMATE_MIGRATIONS_DIR="migrations"
   DBMATE_NO_DUMP_SCHEMA=true
   ```

4. Copy `apps/web/.example.env` to `apps/web/.env.local` and fill it in. Each line says what it
   is for and what happens without it. To run locally you need at least:

   ```
   DATABASE_URL=postgres://localhost:5432/storyteller?sslmode=disable&options=-c%20search_path%3Dirun
   BETTER_AUTH_SECRET=<any long random string>
   BETTER_AUTH_URL=http://localhost:3000
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_ENVIRONMENT=DEV
   ```

   The two `DATABASE_URL`s name the schema differently on purpose: dbmate reads `search_path`,
   and node-postgres drops parameters it does not know, so the web app passes it in `options`.

5. Build the database and start the app:

   ```sh
   just migrate   # apply every migration
   just dev       # the web app on http://localhost:3000
   ```

   Sign up with an email and a password. Google sign-in needs its own OAuth client, and email
   sign-in works without it.

6. Run the tests with `just test`. The database tests run against the `DATABASE_URL` in
   `apps/web/.env.local`, as test users of their own that they remove again; without that
   variable they skip themselves. Flags pass through to `node --test`, e.g.
   `just test --test-name-pattern AppHeader`.

## Where the docs are

- [`apps/web/docs/standards.md`](apps/web/docs/standards.md): how the web app's code is written
  (UI, data, forms, migrations, tests, comments), with the file to copy for each. Read it before
  changing `apps/web`.
- [`apps/web/docs/auth.md`](apps/web/docs/auth.md): sign-up, sign-in, guests, invitations and route
  protection.
- [`apps/web/technologies.md`](apps/web/technologies.md): what the app depends on and why.
- [`db/README.md`](db/README.md): migrations, seeds, and the `_tables` metatable that adds the
  audit columns.
- [`db/STATUS_WORKFLOWS.md`](db/STATUS_WORKFLOWS.md): adding a status workflow to a table.
- [`docs/adr/`](docs/adr/): decisions and the reasons for them.
- [`docs/plans/`](docs/plans/): planned work.
