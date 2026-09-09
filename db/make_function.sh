#!/bin/bash

# Abort on the first failed command rather than reporting a migration that
# was never written.
set -euo pipefail
# call with a full filename of a function in the ./functions directory
# e.g. ./make_function.sh my_function.sql
# you may need to make this file executable: chmod +x make_function.sh

# Ensure a filename argument is provided
if [ -z "${1:-}" ]; then
    echo "Usage: ./make_function.sh <filename>"
    exit 1
fi

# Assume a .sql file; append the extension if the caller left it off
FILENAME="$1"
if [[ "$FILENAME" != *.sql ]]; then
    FILENAME="${FILENAME}.sql"
fi

# Define paths
FUNCTIONS_DIR="./functions"
MIGRATIONS_DIR="./migrations"

# Ensure the functions directory exists
if [ ! -d "$FUNCTIONS_DIR" ]; then
    echo "Error: Directory '$FUNCTIONS_DIR' does not exist."
    exit 1
fi

# Build the full path to the function file
FUNCTION_FILE="$FUNCTIONS_DIR/$FILENAME"

# Ensure the function file exists
if [ ! -f "$FUNCTION_FILE" ]; then
    echo "Error: Function file '$FUNCTION_FILE' not found."
    exit 1
fi

# Extract the function name (remove directory path and .sql extension)
FUNCTION_NAME=$(basename "$FILENAME" .sql)

# Get the current timestamp in UTC (YYYYMMDDHHMMSS format)
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")

# Define the output migration file path
# Migrations live flat in ./migrations, but a source file may sit in a
# subdirectory (e.g. _tables_metatable/tr_update_updated_at.sql). Use only the
# basename here, or the output path would name a directory that does not exist.
OUTPUT_FILE="$MIGRATIONS_DIR/${TIMESTAMP}_do_$(basename "$FILENAME")"

# Ensure the migrations directory exists
mkdir -p "$MIGRATIONS_DIR"

# Write the SQL header to the output file with dynamic function name
cat <<EOF > "$OUTPUT_FILE"
-- migrate:up
DO \$migrate\$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS ${FUNCTION_NAME};

    -- ------------------------------------------------------------
EOF

# Append the contents of the function file
cat "$FUNCTION_FILE" >> "$OUTPUT_FILE"

# Ensure the body ended with a newline so the footer starts on its own line
if [ -n "$(tail -c 1 "$OUTPUT_FILE")" ]; then
    echo >> "$OUTPUT_FILE"
fi

# Append the SQL footer
cat <<EOF >> "$OUTPUT_FILE"
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END \$migrate\$;

-- migrate:down

EOF

# Notify the user
echo "FUNCTION file processed and migration created: $OUTPUT_FILE"
