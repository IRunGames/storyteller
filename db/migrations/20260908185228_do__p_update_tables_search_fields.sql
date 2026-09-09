-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_tables_search_fields;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_tables_search_fields()
    LANGUAGE plpgsql
AS
$$
	/*
====================================================================
- Description -
This procedure will create the search fields for all tables in the current schema that
- have a `search_fields` column in the `_tables` table
- using the name specified in search_field_name, defaulting to `search_text`

If you want this routine to make a new search_text, or remake it, make sure
- the search column in quesion does not exist
TO RECREATE: DROP the search column, then call this routine.

NOTE: We are currently only accepting text or varchar columns for the search fields.

	 */
DECLARE
	-- Logging
	actionName      VARCHAR DEFAULT '_p_update_tables_search_fields';
	actionVersion   VARCHAR DEFAULT '2025-03-13';
	idLog           BIGINT := _action_log_start(
		actionName,
		actionVersion,
		'_tables',
		(SELECT COUNT(*)
		 FROM _tables)
	                          );

	-- Table-specific variables
	tbl             RECORD;
	search_col_name TEXT;
	col_names       TEXT;
	existing_col    INT;

	-- Results tracking
	processed_count BIGINT DEFAULT 0;
	affected_count  BIGINT DEFAULT 0;
BEGIN

	-- Loop through all tables in the current schema except `_tables`
	FOR tbl IN
		SELECT t.table_name, t.search_field_name, t.search_fields
		FROM _tables t
		WHERE t.search_fields IS NOT NULL
		ORDER BY t.table_name ASC
		LOOP
			-- Increment the processed count
			processed_count := processed_count + 1;


			-- Determine the search column name, defaulting to 'search_text'
			search_col_name := COALESCE(tbl.search_field_name, 'search_text');

			-- log working on this table
			PERFORM _action_log_step(idLog, CONCAT('Working on search text field for table: ', tbl.table_name, '.',
			                                       search_col_name),
			                         tbl.table_name::VARCHAR);


			-- Check if the search column already exists
			SELECT COUNT(*)
			INTO existing_col
			FROM information_schema.columns
			WHERE table_schema = current_schema()
				AND table_name = tbl.table_name
				AND column_name = search_col_name;

			-- If the search column does not exist, create it
			IF existing_col = 0 THEN
				-- Build the column list with casting for non-text columns
				SELECT STRING_AGG(
					       CASE
						       WHEN data_type IN ('text', 'character varying') THEN column_name
						       ELSE 'CAST(' || column_name || ' AS TEXT)'
						       END, ', ')
				INTO col_names
				FROM information_schema.columns
				WHERE table_schema = current_schema()
					AND table_name = tbl.table_name
					AND column_name = ANY (tbl.search_fields)
				AND data_type IN ('text', 'character varying') ; -- casting dates is illegal, so skip non-text fields.

				-- Execute the ALTER TABLE statement to add the generated column
				IF col_names IS NOT NULL THEN
					EXECUTE FORMAT(
						'ALTER TABLE %I ADD COLUMN %I TEXT GENERATED ALWAYS AS (immutable_concat_ws('' '', %s)) STORED',
						tbl.table_name, search_col_name, col_names
					        );

					-- Increment the affected count
					affected_count := affected_count + 1;

					-- log added search column
					PERFORM _action_log_step(idLog, CONCAT('Added search column: ', search_col_name, ' to ', tbl.table_name),
					                         tbl.table_name::VARCHAR, 1);
				END IF;

			ELSE
				PERFORM _action_log_step(idLog, CONCAT(tbl.table_name, ' already has search column:  [', search_col_name,
				                                       '] ; skipping'), tbl.table_name::VARCHAR);

			END IF;
		END LOOP;

	-- End the action log
	PERFORM _action_log_end(idLog, processed_count, affected_count);
END
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

-- NOPE / Optional! ------------------------------------------------------------

