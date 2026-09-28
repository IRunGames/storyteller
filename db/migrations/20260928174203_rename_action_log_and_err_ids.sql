-- migrate:up

-- The last primary keys still spelled the formforge way. Everything else in
-- this schema is `id_<singular>` -- and these three tables already carry
-- `id_created_by_user`, so they were inconsistent with themselves.
--
-- `_action_steps._action_log_id` is the reference to `_action_logs`, renamed
-- with it so the two spellings do not diverge.
--
-- Safe to rename: no foreign key constraints point at any of these tables,
-- and the only code that names the columns is the four `_action_log_*`
-- functions, replaced in the migrations immediately after this one.
DO
$$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN
            SELECT * FROM (VALUES
                ('_action_logs',  '_action_log_id',  '_id_action_log'),
                ('_action_steps', '_action_log_id',  '_id_action_log'),
                ('_action_steps', '_action_step_id', '_id_action_step'),
                ('_err',          '_err_id',         '_id_err')
            ) AS v(tbl, old_name, new_name)
        LOOP
            IF _column_exists(r.tbl, r.old_name) THEN
                EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I',
                               r.tbl, r.old_name, r.new_name);
            END IF;
        END LOOP;
    END
$$;

-- migrate:down
