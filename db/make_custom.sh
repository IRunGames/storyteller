#!/bin/bash

# Abort on the first failed command rather than reporting a migration that
# was never written.
set -euo pipefail
# call with a full filename in the ./custom directory
# e.g. ./make_seed.sh 2020-01-01_seed.sql
# you may need to make this file executable: chmod +x make_custom.sh

# Ensure a filename argument is provided
if [ -z "${1:-}" ]; then
    echo "Usage: ./make_custom.sh <filename>"
    exit 1
fi

# Assume a .sql file; append the extension if the caller left it off
FILENAME="$1"
if [[ "$FILENAME" != *.sql ]]; then
    FILENAME="${FILENAME}.sql"
fi

# Define paths
CUSTOM_DIR="./custom"
MIGRATIONS_DIR="./migrations"

# Ensure the custom directory exists
if [ ! -d "$CUSTOM_DIR" ]; then
    echo "Error: Directory '$CUSTOM_DIR' does not exist."
    exit 1
fi

# Build the full path to the seed file
CUSTOM_FILE="$CUSTOM_DIR/$FILENAME"

# Ensure the custom migration file exists
if [ ! -f "$CUSTOM_FILE" ]; then
    echo "Error: Seed file '$CUSTOM_FILE' not found."
    exit 1
fi

# Get the current timestamp in UTC (YYYYMMDDHHMMSS format)
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")

# Define the output migration file path
# Migrations live flat in ./migrations, but a source file may sit in a
# subdirectory (e.g. _tables_metatable/tr_update_updated_at.sql). Use only the
# basename here, or the output path would name a directory that does not exist.
OUTPUT_FILE="$MIGRATIONS_DIR/${TIMESTAMP}_do_custom_$(basename "$FILENAME")"

# Ensure the migrations directory exists
mkdir -p "$MIGRATIONS_DIR"

# Write the SQL header to the output file
cat <<EOF > "$OUTPUT_FILE"
-- migrate:up
EOF

# Append the contents of the custom file
cat "$CUSTOM_FILE" >> "$OUTPUT_FILE"

# Ensure the body ended with a newline so the footer starts on its own line
if [ -n "$(tail -c 1 "$OUTPUT_FILE")" ]; then
    echo >> "$OUTPUT_FILE"
fi

# Append the SQL footer
cat <<EOF >> "$OUTPUT_FILE"

-- migrate:down

EOF

# Notify the user
echo "Custom migration file processed and migration created: $OUTPUT_FILE"
