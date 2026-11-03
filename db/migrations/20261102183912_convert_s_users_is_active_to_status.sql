-- migrate:up

-- s_users.is_active becomes status, run by the Users Status Workflow (-8,
-- seeds/seed_s_statuses.sql): ACTIVE, INACTIVE, SUSPENDED or LOCKED, three
-- ways of being switched off where a boolean had room for one. Existing rows
-- keep what they said: true becomes ACTIVE, false INACTIVE.
--
-- v_users reads every column of s_users through u.*, so is_active cannot be
-- dropped while the view stands; the view migration after this one rebuilds
-- it from views/v_users.sql, with status worked out from the new column.
DROP VIEW IF EXISTS v_users;

ALTER TABLE s_users ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'ACTIVE';

-- Guarded so a re-run, after is_active is gone, is harmless.
DO
$$
    BEGIN
        IF EXISTS (SELECT 1
                   FROM information_schema.columns
                   WHERE table_schema = current_schema()
                     AND table_name = 's_users'
                     AND column_name = 'is_active') THEN
            UPDATE s_users SET status = 'INACTIVE' WHERE NOT is_active;
            ALTER TABLE s_users DROP COLUMN is_active;
        END IF;
    END
$$;

-- Maps the table to the workflow and adds the CHECK on status, the
-- active_at / inactive_at / suspended_at / locked_at columns and the triggers
-- that stamp them and refuse a move the workflow does not allow. The
-- timestamps and activity log it already has are left as they are.
--
-- id_created_by_user / id_updated_by_user arrive here too: the transition
-- trigger (functions/_tables_metatable/validate_status_transition.sql) writes
-- NEW.id_updated_by_user into the activity_log entry it appends, so with the
-- column in place a status change records the administrator who made it,
-- on the row and in the log. Both stay null for a sign-up, which has no
-- author. The procedure ORs the needs_* flags into what the row holds and
-- keeps its search_fields recipe, so nothing already set up is undone.
CALL _p_set_and_update_table_features('s_users',
    p_timestamps          := TRUE,
    p_user_ids            := TRUE,
    p_activity_log        := TRUE,
    p_status_workflow_ids := ARRAY[-8]);

-- migrate:down

