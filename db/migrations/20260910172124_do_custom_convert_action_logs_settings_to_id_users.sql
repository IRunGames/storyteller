-- migrate:up
-- Move _action_logs and _global_settings onto the managed actor columns.
--
-- Both carried a hand-rolled `user_id` column that predated the metatable
-- machinery: uuid on _action_logs, bigint on _global_settings, so they did not
-- even agree with each other, and neither had a foreign key to users.
--
-- Instead of renaming them, they are dropped and the pair of managed columns
-- (id_created_by_user, id_updated_by_user) is added by
-- _p_update_tables_user_ids, which also attaches the foreign keys. That puts
-- both tables under the same mechanism as everything else flagged
-- needs_user_ids, rather than leaving two bespoke columns behind.
--
-- Lossless: both columns held zero non-null values when this was written.
-- _global_settings.user_id was a bigint that could not have referenced the
-- uuid users.id_user in any case.

-- 1. Make sure _tables knows about every table.
--
-- No migration calls _p_update_tables(), so on a database built from scratch
-- the metatable is empty and the needs_user_ids update below would match no
-- rows. Populating it here keeps this migration self-sufficient instead of
-- depending on someone having run the procedure by hand.
--
-- This runs BEFORE the columns are dropped, on purpose: _p_update_tables()
-- writes action-log rows through _action_log_start, which at this point in the
-- history still targets _action_logs.user_id.
CALL _p_update_tables();


-- 2. Drop the hand-rolled columns.
ALTER TABLE _action_logs
    DROP COLUMN IF EXISTS user_id;

ALTER TABLE _global_settings
    DROP COLUMN IF EXISTS user_id;

-- 3. Flag both tables as wanting managed actor columns.
--
-- _p_update_tables() only ever overwrites the has_* flags on conflict, never
-- the needs_* ones, so this survives later runs of that procedure.
UPDATE _tables
SET needs_user_ids = TRUE,
    updated_at     = NOW()
WHERE table_name IN ('_action_logs', '_global_settings');

-- A table absent from _tables would silently miss out, so say so instead.
DO
$$
    DECLARE
        missing TEXT;
    BEGIN
        SELECT string_agg(t, ', ')
        INTO missing
        FROM unnest(ARRAY ['_action_logs', '_global_settings']) AS t
        WHERE NOT EXISTS (SELECT 1 FROM _tables WHERE table_name = t);

        IF missing IS NOT NULL THEN
            RAISE EXCEPTION
                'Not present in _tables even after _p_update_tables(), so '
                    'needs_user_ids could not be set: %. Either the table does '
                    'not exist, or _p_update_tables is skipping it.', missing;
        END IF;
    END
$$;

-- 4. Add id_created_by_user / id_updated_by_user and their foreign keys.
--
-- Processes every table flagged needs_user_ids, not just these two. That is
-- the intent: the procedure is idempotent, so any table already carrying the
-- columns is simply reconfirmed.
CALL _p_update_tables_user_ids();

-- migrate:down

