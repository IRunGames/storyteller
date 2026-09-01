#!/bin/bash
# call with a full filename in the ./views directory
# e.g. ./make_view.sh my_custom_view.sql
# you may need to make this file executable: chmod +x make_view.sh

# Ensure a filename argument is provided
if [ -z "$1" ]; then
    echo "Usage: ./make_view.sh <filename>"
    exit 1
fi

# Define paths
VIEWS_DIR="./views"
MIGRATIONS_DIR="./migrations"

# Ensure the views directory exists
if [ ! -d "$VIEWS_DIR" ]; then
    echo "Error: Directory '$VIEWS_DIR' does not exist."
    exit 1
fi

# Build the full path to the view file
VIEW_FILE="$VIEWS_DIR/$1"

# Ensure the view file exists
if [ ! -f "$VIEW_FILE" ]; then
    echo "Error: View file '$VIEW_FILE' not found."
    exit 1
fi

# Extract the view name (remove directory path and .sql extension)
VIEW_NAME=$(basename "$1" .sql)

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
BEGIN
    RAISE NOTICE '[%] START DROP AND CREATE VIEW', clock_timestamp();

    DROP VIEW IF EXISTS ${VIEW_NAME};
    
    -- ------------------------------------------------------------
EOF

# Append the contents of the view file
cat "$VIEW_FILE" >> "$OUTPUT_FILE"

# Append the SQL footer
cat <<EOF >> "$OUTPUT_FILE"

    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE CREATING VIEW', clock_timestamp();
END \$\$;

-- migrate:down

EOF

# Notify the user
echo "View file processed and migration created: $OUTPUT_FILE" 