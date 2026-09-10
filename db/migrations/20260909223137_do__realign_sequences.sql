-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _realign_sequences;

    -- ------------------------------------------------------------
/**
  _realign_sequences

  Move sequence-backed columns forward when their sequence has fallen behind
  the data. Rows seeded with explicit ids do not advance the owning sequence,
  so the next `nextval()` returns a value that already exists and the insert
  fails on the primary key. This finds those columns and sets each sequence to
  the column's current maximum.

  Only ever moves a sequence FORWARD. A sequence already at or ahead of
  `max(id)` is left untouched, so the function is safe to run repeatedly and
  is a no-op on an empty database.

  "Behind" is judged by the value `nextval()` would actually return next --
  `last_value + 1` once the sequence has been called, `last_value` before that
  -- rather than by `last_value` alone, which would misread a fresh sequence
  as broken.

  Covers `serial`/`bigserial` defaults and identity columns alike: both are
  resolved through `pg_get_serial_sequence`. Columns with no sequence are not
  considered.

  Parameters:
    _table_names — optional list of tables to check, unqualified and resolved
                   in the current schema. NULL (the default) checks every
                   table in the current schema. An empty array checks nothing
                   and returns no rows. Naming a table that does not exist
                   raises, since that is nearly always a typo; naming a table
                   that exists but has no sequence-backed column is silently
                   skipped.

  Returns one row per sequence actually realigned -- nothing when everything
  was already in order. Also emits a NOTICE per repair for interactive use.

  Examples:
    SELECT * FROM _realign_sequences();
    SELECT * FROM _realign_sequences(ARRAY['s_hand_types', '_table_types']);
 */
CREATE OR REPLACE FUNCTION _realign_sequences(
    _table_names VARCHAR[] DEFAULT NULL
)
    RETURNS TABLE
            (
                table_name    TEXT,
                column_name   TEXT,
                sequence_name TEXT,
                was_next      BIGINT,
                max_id        BIGINT,
                now_set_to    BIGINT
            )
    LANGUAGE plpgsql
AS
$function$
DECLARE
    r        RECORD;
    missing  TEXT;
    v_last   BIGINT;
    v_called BOOLEAN;
    v_next   BIGINT;
    v_max    BIGINT;
BEGIN
    -- A named table that does not exist is almost always a typo. Report every
    -- such name at once rather than failing on the first.
    IF _table_names IS NOT NULL THEN
        SELECT string_agg(t, ', ' ORDER BY t)
        INTO missing
        FROM unnest(_table_names) AS t
        WHERE to_regclass(quote_ident(t)) IS NULL;

        IF missing IS NOT NULL THEN
            RAISE EXCEPTION 'No such table(s) in schema %: %', current_schema(), missing;
        END IF;
    END IF;

    FOR r IN
        SELECT c.relname::TEXT                                             AS tbl,
               a.attname::TEXT                                             AS col,
               pg_get_serial_sequence(quote_ident(c.relname), a.attname)   AS seq
        FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 JOIN pg_attribute a ON a.attrelid = c.oid
                     AND a.attnum > 0
                     AND NOT a.attisdropped
        WHERE n.nspname = current_schema()
          AND c.relkind = 'r'
          AND pg_get_serial_sequence(quote_ident(c.relname), a.attname) IS NOT NULL
          AND (_table_names IS NULL OR c.relname = ANY (_table_names))
        ORDER BY 1, 2
        LOOP
            EXECUTE format('SELECT last_value, is_called FROM %s', r.seq)
                INTO v_last, v_called;
            EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', r.col, r.tbl)
                INTO v_max;

            v_next := CASE WHEN v_called THEN v_last + 1 ELSE v_last END;

            IF v_next <= v_max THEN
                -- is_called = TRUE, so the next nextval() returns v_max + 1
                PERFORM setval(r.seq, v_max, TRUE);

                RAISE NOTICE 'realigned %.%: next would have been %, max id is % -> sequence set to %',
                    r.tbl, r.col, v_next, v_max, v_max;

                table_name := r.tbl;
                column_name := r.col;
                sequence_name := r.seq;
                was_next := v_next;
                max_id := v_max;
                now_set_to := v_max;
                RETURN NEXT;
            END IF;
        END LOOP;
END;
$function$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

