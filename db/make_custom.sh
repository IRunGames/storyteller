#!/bin/bash
# call with a full filename in the ./custom directory
# e.g. ./make_seed.sh 2020-01-01_seed.sql
# you may need to make this file executable: chmod +x make_custom.sh

# Ensure a filename argument is provided
if [ -z "$1" ]; then
    echo "Usage: ./make_custom.sh <filename>"
    exit 1
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
CUSTOM_FILE="$CUSTOM_DIR/$1"

# Ensure the custom migration file exists
if [ ! -f "$CUSTOM_FILE" ]; then
    echo "Error: Seed file '$CUSTOM_FILE' not found."
    exit 1
fi

# Get the current timestamp in UTC (YYYYMMDDHHMMSS format)
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")

# Define the output migration file path
OUTPUT_FILE="$MIGRATIONS_DIR/${TIMESTAMP}_do_custom_${1}"

# Ensure the migrations directory exists
mkdir -p "$MIGRATIONS_DIR"

# Write the SQL header to the output file

# Append the contents of the seed file
cat "$CUSTOM_FILE" >> "$OUTPUT_FILE"

# Notify the user
echo "Custom migration file processed and migration created: $OUTPUT_FILE"
