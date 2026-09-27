-- migrate:up
-- Every status key in every workflow becomes UPPER CASE: a status is a
-- constant stored in a column, not prose, and it reads as one wherever it
-- surfaces — a CHECK constraint, an activity_log entry, a query typed by
-- hand. The seeds now carry the keys that way (seeds/seed_s_statuses.sql) and
-- the table scripts' column defaults with them; this brings the database that
-- already exists into line.
--
-- The <status>_at columns do not move. _p_update_workflow_columns and
-- _p_update_workflow_status_timestamp_triggers lower-case the key when they
-- build a column name, so open_at, suspended_at, pending_at and the rest stay
-- exactly as they are, with the history they hold.
--
-- Order matters. The CHECK constraint _p_update_workflow_constraints builds is
-- validating, so it would refuse an upper-case list while the rows still hold
-- lower-case statuses: the constraints come off first, the rows and the
-- workflow definitions change together, and the procedures rebuild everything
-- at the end.
--
-- upper() is idempotent and the constraint work is drop-then-create, so a
-- re-run changes nothing, which is what a forward-only migration has to be
-- able to promise.
DO
$$
    DECLARE
        tbl            RECORD;
        current_default TEXT;
        new_default    TEXT;
    BEGIN
        -- The transition trigger would reject OPEN arriving from open, the
        -- s_statuses trigger would reject a transition list naming keys that
        -- do not exist yet, and set_updated_at would stamp every row for a
        -- change that is not one. All of them off for the conversion.
        SET session_replication_role = 'replica';

        FOR tbl IN
            SELECT t.table_name, COALESCE(w.status_column_name, 'status') AS status_column
            FROM _tables t
                     JOIN s_status_workflows w ON w.s_status_workflow_id = ANY (t.s_status_workflow_ids)
            LOOP
                -- Off with the CHECK, by the name the procedure gives it, so
                -- the column can hold a value neither the old list nor the new
                -- one allows for the length of this transaction.
                EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
                               tbl.table_name,
                               format('%s_%s_check', tbl.table_name, tbl.status_column));

                EXECUTE format('UPDATE %I SET %I = upper(%I) WHERE %I <> upper(%I)',
                               tbl.table_name, tbl.status_column, tbl.status_column,
                               tbl.status_column, tbl.status_column);

                -- The column default too: one left lower-case would insert a
                -- status the rebuilt CHECK refuses. It is stored as an
                -- expression, 'open'::character varying, so the literal is
                -- taken out of it and put back upper-cased. chr(39) is the
                -- quote to trim, spelled that way to keep the quoting of this
                -- block readable.
                SELECT column_default
                INTO current_default
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = tbl.table_name
                  AND column_name = tbl.status_column;

                IF current_default IS NOT NULL THEN
                    new_default := upper(btrim(split_part(current_default, '::', 1), chr(39)));
                    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %L',
                                   tbl.table_name, tbl.status_column, new_default);
                    RAISE NOTICE 'Default for %.% is now %', tbl.table_name, tbl.status_column, new_default;
                END IF;
            END LOOP;

        -- The workflow definitions: the key itself, and every key listed as a
        -- status this one may be arrived at from.
        --
        -- The three cases the list has are all different and all meaningful:
        -- NULL is "the trigger does not check, so anything may move here", an
        -- empty array is "nothing leads here", and a list is a list. array_agg
        -- over an empty array returns NULL, so without the CASE and the
        -- coalesce an empty list would silently turn into the unchecked one,
        -- which is the opposite of what it says.
        UPDATE s_statuses
        SET status_key                  = upper(status_key),
            transition_from_status_keys = CASE
                                              WHEN transition_from_status_keys IS NULL THEN NULL
                                              ELSE coalesce(
                                                      (SELECT array_agg(upper(key) ORDER BY ordinality)
                                                       FROM unnest(transition_from_status_keys)
                                                                WITH ORDINALITY AS t(key, ordinality)),
                                                      '{}'::text[])
                                              END,
            updated_at                  = NOW()
        WHERE status_key <> upper(status_key)
           OR EXISTS (SELECT 1 FROM unnest(transition_from_status_keys) AS k WHERE k <> upper(k));

        SET session_replication_role = 'origin';
    END
$$;

-- The trigger that adds up a session's pauses fires as the row leaves
-- SUSPENDED, and its WHEN clause carries the status key, so it is recreated
-- rather than left watching for a status nothing holds any more.
-- custom/create_story_sessions_table.sql now declares it the same way.
CREATE OR REPLACE TRIGGER tr_bu_story_sessions_paused_time
    BEFORE UPDATE OF status ON story_sessions
    FOR EACH ROW
    WHEN (OLD.status = 'SUSPENDED' AND NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION tr_add_story_sessions_paused_time();

-- Rebuild everything the keys feed: the CHECK constraints from the new list,
-- the <status>_at columns (unchanged, since their names are lower-cased), the
-- trigger that stamps them, and the transition trigger.
CALL _p_update_workflow_constraints();
CALL _p_update_workflow_columns();
CALL _p_update_workflow_status_timestamp_triggers();
CALL _p_attach_workflow_triggers();
CALL _p_attach_status_transition_triggers();

-- Say so loudly if anything was left behind: a lower-case key in a workflow,
-- or a row holding a status its table's CHECK would now refuse.
DO
$$
    DECLARE
        stragglers INT;
    BEGIN
        SELECT count(*)
        INTO stragglers
        FROM s_statuses
        WHERE status_key <> upper(status_key)
           OR EXISTS (SELECT 1 FROM unnest(transition_from_status_keys) AS k WHERE k <> upper(k));
        IF stragglers > 0 THEN
            RAISE EXCEPTION 's_statuses still holds % row(s) with a lower-case status key.', stragglers;
        END IF;

        SELECT count(*) INTO stragglers FROM story_sessions WHERE status <> upper(status);
        IF stragglers > 0 THEN
            RAISE EXCEPTION 'story_sessions still holds % row(s) with a lower-case status.', stragglers;
        END IF;

        SELECT count(*) INTO stragglers FROM story_scenes WHERE status <> upper(status);
        IF stragglers > 0 THEN
            RAISE EXCEPTION 'story_scenes still holds % row(s) with a lower-case status.', stragglers;
        END IF;
    END
$$;

-- migrate:down
