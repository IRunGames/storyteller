#!/bin/bash
# call with a full filename of a procedure in the ./routines directory
# e.g. ./make_routine.sh 2020-01-01_seed.sql
# you may need to make this file executable: chmod +x make_procedure.sh

# Ensure a filename argument is provided
if [ -z "$1" ]; then
    echo "Usage: ./make_routine.sh <filename>"
    exit 1
fi

# Define paths
ROUTINES_DIR="./routines"
MIGRATIONS_DIR="./migrations"

# Ensure the routines directory exists
if [ ! -d "$ROUTINES_DIR" ]; then
    echo "Error: Directory '$ROUTINES_DIR' does not exist."
    exit 1
fi

# Build the full path to the seed file
ROUTINE_FILE="$ROUTINES_DIR/$1"

# Ensure the seed file exists
if [ ! -f "$ROUTINE_FILE" ]; then
    echo "Error: Seed file '$ROUTINE_FILE' not found."
    exit 1
fi

# Extract the stored procedure name (remove directory path and .sql extension)
STORED_PROCEDURE_NAME=$(basename "$1" .sql)

# Get the current timestamp in UTC (YYYYMMDDHHMMSS format)
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")

# Define the output migration file path
OUTPUT_FILE="$MIGRATIONS_DIR/${TIMESTAMP}_do_${1}"

# Ensure the migrations directory exists
mkdir -p "$MIGRATIONS_DIR"

# Write the SQL header to the output file with dynamic procedure name
cat <<EOF > "$OUTPUT_FILE"
-- migrate:up
DO \$migrate\$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE <ROUTINE>', clock_timestamp();

    DROP PROCEDURE IF EXISTS ${STORED_PROCEDURE_NAME};

    -- ------------------------------------------------------------
EOF

# Append the contents of the seed file
cat "$ROUTINE_FILE" >> "$OUTPUT_FILE"

# Append the SQL footer
cat <<EOF >> "$OUTPUT_FILE"
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_ROUTINE.SH', clock_timestamp();
END \$migrate\$;

-- migrate:down

-- NOPE / Optional! ------------------------------------------------------------

EOF

# Notify the user
echo "ROUTINE file processed and migration created: $OUTPUT_FILE"