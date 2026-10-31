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

# `next dev` already listens on every interface, but three things still pin
# it to this machine: Next refuses HMR and other /_next requests whose Origin
# is not localhost or the --hostname it was given, Better Auth rejects sign-in
# requests from any origin but BETTER_AUTH_URL, and the browser auth client
# posts to NEXT_PUBLIC_APP_URL. So the server is bound to this machine's LAN
# address and both URLs are pointed at it for this run (values set in the
# environment win over .env.local). Use that URL on this machine too;
# localhost does not work in this mode. Google sign-in only redirects back to
# localhost, so sign in with email and password from other machines.
# The second `--` is for npm: it hands `-- --hostname …` to turbo, which passes
# `--hostname …` on to `next dev`.
# Start the dev server for other machines on the network (http://<this LAN IP>:3000)
[group('web')]
dev-remote:
    #!/usr/bin/env bash
    set -euo pipefail
    iface="$(route -n get default | awk '/interface:/{print $2}')"
    ip="$(ipconfig getifaddr "$iface")"
    url="http://$ip:3000"
    echo "Serving on $url (reach it from other machines at that address; stop with Ctrl+C or just kill)"
    export BETTER_AUTH_URL="$url" NEXT_PUBLIC_APP_URL="$url"
    npm run dev -- -- --hostname "$ip"

# `just dev` spawns two process groups (just → npm → turbo, and the web
# workspace's npm → next dev → next-server), so each matched process's whole
# group is signalled rather than walking a parent chain that turbo breaks.
# Stop a running `just dev` (the turbo/next dev server on port 3000)
[group('web')]
kill:
    #!/usr/bin/env bash
    set -euo pipefail
    # lsof and pgrep exit 1 when they match nothing, which is not a failure here.
    pids="$( { lsof -tiTCP:3000 -sTCP:LISTEN || true
               pgrep -f '{{ justfile_directory() }}/node_modules/.bin/(turbo|next) dev' || true
             } 2>/dev/null | sort -u )"
    if [ -z "$pids" ]; then
        echo "No dev server running"
        exit 0
    fi
    me="$(ps -o pgid= -p $$ | tr -d ' ')"
    groups="$(ps -o pgid= -p $pids | tr -d ' ' | sort -u | grep -vx "$me" || true)"
    for pg in $groups; do kill -TERM -- "-$pg" 2>/dev/null || true; done
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        ps -o pid= -p $pids >/dev/null 2>&1 || break
        sleep 0.5
    done
    for pg in $groups; do kill -KILL -- "-$pg" 2>/dev/null || true; done
    echo "Stopped dev server (process groups: $(echo $groups))"

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

# The production URL lives in db/.env.production (gitignored, like db/.env):
# a DATABASE_URL line holding the direct, non-pooled Neon connection string.
# The dump is pg_dump's custom format, compressed, restorable in whole or by
# table with pg_restore, e.g.
#   pg_restore --list db/backups/production-<stamp>.dump
#   pg_restore -d "$DATABASE_URL" -t stories db/backups/production-<stamp>.dump
# Dump the production database to db/backups/production-<stamp>.dump
[group('db')]
[working-directory: 'db']
backup:
    #!/usr/bin/env bash
    set -euo pipefail
    log() { printf '%s\n\t%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
    # Color only when printing to a terminal, so piped or logged output stays plain.
    if [ -t 1 ]; then
        cyan=$'\e[36m' magenta=$'\e[35m' green=$'\e[32m' reset=$'\e[0m'
    else
        cyan='' magenta='' green='' reset=''
    fi
    if [ ! -f .env.production ]; then
        log "db/.env.production is missing: put the direct Neon DATABASE_URL in it" >&2
        exit 1
    fi
    set -a
    source .env.production
    set +a
    PG_DUMP="$(command -v pg_dump || echo /Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump)"
    # The URL may carry search_path for dbmate, which libpq rejects; drop it.
    url="$(printf '%s' "$DATABASE_URL" | sed -E \
        -e 's/&search_path=[^&]*//g' \
        -e 's/\?search_path=[^&]*&/?/' \
        -e 's/\?search_path=[^&]*$//')"
    mkdir -p backups
    out="backups/production-$(date -u +%Y%m%d-%H%M%S).dump"
    # host[:port]/dbname, with the credentials and query string left out.
    src="$(printf '%s' "$url" | sed -E -e 's#^[^@]*@##' -e 's#\?.*$##')"
    log "Backing up ${cyan}$src${reset} to ${magenta}db/$out${reset}"
    log "Dumping with $("$PG_DUMP" --version)"$'\n\t\t'"from $PG_DUMP"
    SECONDS=0
    "$PG_DUMP" --format=custom --compress=6 --no-owner --no-privileges --file "$out" "$url"
    log "Dump finished in ${SECONDS}s; counting tables in the archive"
    tables="$("$PG_DUMP" --version >/dev/null && "${PG_DUMP%pg_dump}pg_restore" --list "$out" | grep -c ' TABLE DATA ' || true)"
    log "Wrote ${magenta}db/$out${reset} (${green}$(du -h "$out" | cut -f1)${reset}, ${green}$tables tables with data${reset})"

# Logging is switched back off when the tail exits, however it exits.
# Log every statement the server runs and tail the server log (Ctrl+C to stop)
[group('db')]
sqllog:
    #!/usr/bin/env bash
    set -euo pipefail
    log="$(just psql -Atc 'show data_directory')/postgresql.log"
    just psql -q -c "ALTER SYSTEM SET log_statement = 'all'" -c "SELECT pg_reload_conf()" >/dev/null
    trap 'just psql -q -c "ALTER SYSTEM RESET log_statement" -c "SELECT pg_reload_conf()" >/dev/null' EXIT
    echo "Logging all statements to $log (Ctrl+C to stop)"
    # Run the tail as a job so a signal to this shell (VS Code terminating the
    # task, a plain kill) interrupts the wait, ends the tail, and reaches the trap.
    tail -n 0 -F "$log" &
    trap 'kill $! 2>/dev/null' INT TERM HUP
    wait $! || true

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
alias die := kill
alias function := make_function
alias procedure := make_procedure
alias proc := make_procedure
alias seed := make_seed
alias view := make_view
