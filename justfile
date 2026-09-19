# Storyteller task runner.
# `just` walks up from the current directory, so these work anywhere in the repo.

# Pass recipe arguments through to shebang recipes as "$@"
set positional-arguments

# List the available recipes
default:
    @just --list --unsorted

# Start the web app's dev server on http://localhost:3000 (via turbo)
[group('web')]
dev:
    npm run dev

# Run the web app's tests
# Pass node --test flags through, e.g. `just test --test-name-pattern LoginForm`
[group('web')]
[working-directory: 'apps/web']
test *args:
    #!/usr/bin/env bash
    set -euo pipefail
    npm test -- "$@"

# The repo root is linked to the storyteller-web project (.vercel/), whose
# Root Directory is apps/web. Pass vercel flags through, e.g. `just deploy --force`
# Deploy the web app to Vercel production, running the tests first
[group('web')]
deploy *args:
    #!/usr/bin/env bash
    set -euo pipefail
    just test
    npx --yes vercel@latest deploy --prod "$@"

# Deploy a preview build of the web app to Vercel (no tests, no production traffic)
[group('web')]
preview *args:
    #!/usr/bin/env bash
    set -euo pipefail
    npx --yes vercel@latest deploy "$@"

# Wrap a custom SQL file (db/custom/) into a dbmate migration
[group('db')]
[working-directory: 'db']
make_custom file:
    bash ./make_custom.sh {{ file }}

# Wrap a function (db/functions/) into a DROP FUNCTION + create migration
[group('db')]
[working-directory: 'db']
make_function file:
    bash ./make_function.sh {{ file }}

# Wrap a procedure (db/procedures/) into a DROP PROCEDURE + create migration
[group('db')]
[working-directory: 'db']
make_procedure file:
    bash ./make_procedure.sh {{ file }}

# Wrap a seed file (db/seeds/) into a seeding migration
[group('db')]
[working-directory: 'db']
make_seed file:
    bash ./make_seed.sh {{ file }}

# Wrap a view (db/views/) into a DROP VIEW + create migration
[group('db')]
[working-directory: 'db']
make_view file:
    bash ./make_view.sh {{ file }}

# Open psql on the project database, with search_path from db/.env
# Pass psql args through, e.g. `just psql -c "\dt"`
[group('db')]
[working-directory: 'db']
psql *args:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a
    source .env
    set +a
    PSQL="$(command -v psql || echo /Applications/Postgres.app/Contents/Versions/latest/bin/psql)"
    # dbmate understands search_path in the URL but libpq rejects it,
    # so promote it to PGOPTIONS and strip it from the URL psql sees.
    url="$DATABASE_URL"
    case "$url" in
        *search_path=*)
            schema="${url##*search_path=}"
            export PGOPTIONS="-csearch_path=${schema%%&*}"
            url="$(printf '%s' "$url" | sed -E \
                -e 's/&search_path=[^&]*//g' \
                -e 's/\?search_path=[^&]*&/?/' \
                -e 's/\?search_path=[^&]*$//')"
            ;;
    esac
    exec "$PSQL" "$url" "$@"

# Generate a new empty dbmate migration
[group('dbmate')]
[working-directory: 'db']
new name:
    bunx dbmate new {{ name }}

# Run any pending migrations
[group('dbmate')]
[working-directory: 'db']
migrate:
    bunx dbmate migrate

# Roll back the most recent migration
[group('dbmate')]
[working-directory: 'db']
rollback:
    bunx dbmate rollback

# Show the status of all migrations
[group('dbmate')]
[working-directory: 'db']
status:
    bunx dbmate status

# Roll back the most recent migration, then re-run it
[group('dbmate')]
[working-directory: 'db']
redo:
    bunx dbmate rollback && bunx dbmate migrate

# Write the database structure to schema.sql
[group('dbmate')]
[working-directory: 'db']
dump:
    bunx dbmate dump

# Load schema.sql into the database
[group('dbmate')]
[working-directory: 'db']
load:
    bunx dbmate load

alias custom := make_custom
alias function := make_function
alias procedure := make_procedure
alias proc := make_procedure
alias seed := make_seed
alias view := make_view
