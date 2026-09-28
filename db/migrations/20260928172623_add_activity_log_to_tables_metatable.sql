-- migrate:up

-- _tables gets the same activity_log every other table can have, so the
-- metatable records its own history: what was built, what changed, and what
-- could not be applied, per table.
--
-- Added by hand rather than through _p_update_tables_activity_log() because
-- _p_update_tables() deliberately skips _tables when it iterates, so the
-- metatable is never a row in itself and cannot declare needs_activity_log.
--
-- This is not a replacement for _action_logs. That records every step of
-- every run, no-ops included, and is a log of what the procedures did.
-- This records only real changes to a table, and is a log of what happened
-- to that table.
ALTER TABLE _tables
    ADD COLUMN IF NOT EXISTS activity_log JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN _tables.activity_log IS
    'Per-table history of metatable changes: creates, updates and failures. '
    'Written by _log_table_activity() from the _p_update_tables_* routines. '
    'No-ops are never recorded.';

-- migrate:down
