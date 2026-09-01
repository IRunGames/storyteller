#!/bin/bash
# call with a full filename in the ./seeds directory
# e.g. ./make_seed.sh 2020-01-01_seed.sql
# you may need to make this file executable: chmod +x make_seed.sh

# Ensure a filename argument is provided
if [ -z "$1" ]; then
    echo "Usage: ./make_seed.sh <filename>"
    exit 1
fi

# Define paths
SEEDS_DIR="./seeds"
MIGRATIONS_DIR="./migrations"

# Ensure the seeds directory exists
if [ ! -d "$SEEDS_DIR" ]; then
    echo "Error: Directory '$SEEDS_DIR' does not exist."
    exit 1
fi

# Build the full path to the seed file
SEED_FILE="$SEEDS_DIR/$1"

# Ensure the seed file exists
if [ ! -f "$SEED_FILE" ]; then
    echo "Error: Seed file '$SEED_FILE' not found."
    exit 1
fi

# Get the current timestamp in UTC (YYYYMMDDHHMMSS format)
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")

# Define the output migration file path
OUTPUT_FILE="$MIGRATIONS_DIR/${TIMESTAMP}_do_${1}"

# Ensure the migrations directory exists
mkdir -p "$MIGRATIONS_DIR"

# Write the SQL header to the output file
cat <<EOF > "$OUTPUT_FILE"
-- migrate:up
DO \$\$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM xxx;

    RAISE NOTICE '+++    [%] Seeding xxx', clock_timestamp();

    -- ------------------------------------------------------------
EOF

# Append the contents of the seed file
cat "$SEED_FILE" >> "$OUTPUT_FILE"

# Append the SQL footer
cat <<EOF >> "$OUTPUT_FILE"
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END \$\$;

-- migrate:down

-- NOPE / Optional! ------------------------------------------------------------

EOF

# Notify the user
echo "Seed file processed and migration created: $OUTPUT_FILE"