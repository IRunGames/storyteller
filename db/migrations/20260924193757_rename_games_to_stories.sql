-- migrate:up
-- The app has talked about stories from the start; the database talked about
-- games. This brings the four game tables over: games, game_players,
-- game_sessions and game_favorites become stories, story_players,
-- story_sessions and story_favorites, and every id, foreign key, sequence,
-- constraint, index, trigger and trigger function that carried the old word
-- follows. games.game_title becomes plain title. characters.id_game and
-- hands.id_game are foreign keys to games, so they are renamed too.
--
-- Nothing is dropped and recreated: rows, defaults and the identity
-- sequences stay where they are. The one exception is the pair of workflow
-- triggers on story_sessions, which the metatable procedures generate from
-- the table's name; the old pair is dropped and the procedures rerun so
-- they come back under the new name. The _tables rows are renamed in place
-- first so they keep their needs_* settings and workflow link: without that,
-- _p_update_tables() would delete the games rows and insert bare stories
-- rows.
--
-- Idempotent throughout. Every rename checks that the old name is still
-- there, and the final block fails loudly if anything named after games is
-- left in the schema.

DO
$$
    DECLARE
        r RECORD;
        new_name TEXT;
    BEGIN
        -- Tables
        IF to_regclass('games') IS NOT NULL THEN
            ALTER TABLE games RENAME TO stories;
        END IF;
        IF to_regclass('game_players') IS NOT NULL THEN
            ALTER TABLE game_players RENAME TO story_players;
        END IF;
        IF to_regclass('game_sessions') IS NOT NULL THEN
            ALTER TABLE game_sessions RENAME TO story_sessions;
        END IF;
        IF to_regclass('game_favorites') IS NOT NULL THEN
            ALTER TABLE game_favorites RENAME TO story_favorites;
        END IF;

        -- Columns: the primary keys, the foreign keys to stories and to
        -- story_sessions, and the title.
        IF _column_exists('stories', 'id_game') THEN
            ALTER TABLE stories RENAME COLUMN id_game TO id_story;
        END IF;
        IF _column_exists('stories', 'game_title') THEN
            ALTER TABLE stories RENAME COLUMN game_title TO title;
        END IF;
        IF _column_exists('stories', 'id_game_session') THEN
            ALTER TABLE stories RENAME COLUMN id_game_session TO id_story_session;
        END IF;
        IF _column_exists('story_players', 'id_game_player') THEN
            ALTER TABLE story_players RENAME COLUMN id_game_player TO id_story_player;
        END IF;
        IF _column_exists('story_players', 'id_game') THEN
            ALTER TABLE story_players RENAME COLUMN id_game TO id_story;
        END IF;
        IF _column_exists('story_sessions', 'id_game_session') THEN
            ALTER TABLE story_sessions RENAME COLUMN id_game_session TO id_story_session;
        END IF;
        IF _column_exists('story_sessions', 'id_game') THEN
            ALTER TABLE story_sessions RENAME COLUMN id_game TO id_story;
        END IF;
        IF _column_exists('story_favorites', 'id_game_favorite') THEN
            ALTER TABLE story_favorites RENAME COLUMN id_game_favorite TO id_story_favorite;
        END IF;
        IF _column_exists('story_favorites', 'id_game') THEN
            ALTER TABLE story_favorites RENAME COLUMN id_game TO id_story;
        END IF;
        IF _column_exists('characters', 'id_game') THEN
            ALTER TABLE characters RENAME COLUMN id_game TO id_story;
        END IF;
        IF _column_exists('hands', 'id_game') THEN
            ALTER TABLE hands RENAME COLUMN id_game TO id_story;
        END IF;

        -- Sequences, constraints and indexes are named after the table and
        -- column they serve, so each is renamed by rewriting the words in its
        -- name: game_title first, since that column is now plain title, then
        -- games before game, or games would come out as storys. A
        -- column default that names a sequence follows the rename by itself,
        -- since it holds the sequence's oid and not its name. Renaming a
        -- primary key or unique constraint renames its index with it, which
        -- is why the index loop runs last and finds only what is left.
        FOR r IN
            SELECT sequencename AS name
            FROM pg_sequences
            WHERE schemaname = current_schema()
              AND sequencename LIKE '%game%'
        LOOP
            new_name := replace(replace(replace(r.name, 'game_title', 'title'), 'games', 'stories'), 'game', 'story');
            EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', r.name, new_name);
        END LOOP;

        FOR r IN
            SELECT conrelid::regclass AS tbl, conname AS name
            FROM pg_constraint
            WHERE connamespace = current_schema()::regnamespace
              AND conname LIKE '%game%'
        LOOP
            new_name := replace(replace(replace(r.name, 'game_title', 'title'), 'games', 'stories'), 'game', 'story');
            EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.name, new_name);
        END LOOP;

        FOR r IN
            SELECT indexname AS name
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND indexname LIKE '%game%'
        LOOP
            new_name := replace(replace(replace(r.name, 'game_title', 'title'), 'games', 'stories'), 'game', 'story');
            EXECUTE format('ALTER INDEX %I RENAME TO %I', r.name, new_name);
        END LOOP;

        -- The hand-written pause trigger (db/functions/) and its trigger.
        IF EXISTS (SELECT 1
                   FROM pg_proc
                   WHERE proname = 'tr_add_game_sessions_paused_time'
                     AND pronamespace = current_schema()::regnamespace) THEN
            ALTER FUNCTION tr_add_game_sessions_paused_time() RENAME TO tr_add_story_sessions_paused_time;
        END IF;
        IF to_regclass('story_sessions') IS NOT NULL
            AND EXISTS (SELECT 1
                        FROM pg_trigger
                        WHERE tgname = 'tr_bu_game_sessions_paused_time'
                          AND tgrelid = 'story_sessions'::regclass) THEN
            ALTER TRIGGER tr_bu_game_sessions_paused_time ON story_sessions
                RENAME TO tr_bu_story_sessions_paused_time;
        END IF;

        -- The generated workflow triggers and their function. The trigger
        -- goes first so the function has no dependant left, and no CASCADE
        -- is needed. The procedures below make the new ones.
        IF to_regclass('story_sessions') IS NOT NULL THEN
            DROP TRIGGER IF EXISTS tr_biu_update_game_sessions_status_timestamps ON story_sessions;
            DROP TRIGGER IF EXISTS tr_bu_status_transition_game_sessions_status ON story_sessions;
        END IF;
        DROP FUNCTION IF EXISTS tr_update_game_sessions_status_timestamps();
    END
$$;

-- The column comments name what they point at.
COMMENT ON COLUMN stories.id_story_session IS
    'The session currently at the table, if any; NULL between sessions. '
    'story_sessions holds the history, this points at the one in progress.';
COMMENT ON COLUMN story_sessions.paused_time IS
    'Time spent suspended, summed by tr_add_story_sessions_paused_time as each '
    'pause ends; length subtracts it.';

-- The metatable rows keep their settings under the new names. A re-run finds
-- nothing to update.
UPDATE _tables SET table_name = 'stories', updated_at = NOW() WHERE table_name = 'games';
UPDATE _tables SET table_name = 'story_players', updated_at = NOW() WHERE table_name = 'game_players';
UPDATE _tables SET table_name = 'story_sessions', updated_at = NOW() WHERE table_name = 'game_sessions';
UPDATE _tables SET table_name = 'story_favorites', updated_at = NOW() WHERE table_name = 'game_favorites';

UPDATE s_status_workflows
SET name       = 'Story Sessions Status Workflow',
    updated_at = NOW()
WHERE s_status_workflow_id = -1
  AND name = 'Game Sessions Status Workflow';

-- Refresh the dependency lists, then regenerate the two workflow triggers on
-- story_sessions under their new names. The other metatable procedures find
-- their columns and triggers already in place and change nothing.
CALL _p_update_tables();
CALL _p_update_workflow_status_timestamp_triggers();
CALL _p_attach_status_transition_triggers();

-- Nothing named after games may remain: a table, column, sequence,
-- constraint, index, trigger or function.
DO
$$
    DECLARE
        leftovers TEXT;
    BEGIN
        SELECT string_agg(name, ', ')
        INTO leftovers
        FROM (SELECT 'table ' || table_name AS name
              FROM information_schema.tables
              WHERE table_schema = current_schema() AND table_name LIKE '%game%'
              UNION ALL
              SELECT 'column ' || table_name || '.' || column_name
              FROM information_schema.columns
              WHERE table_schema = current_schema() AND column_name LIKE '%game%'
              UNION ALL
              SELECT 'sequence ' || sequencename
              FROM pg_sequences
              WHERE schemaname = current_schema() AND sequencename LIKE '%game%'
              UNION ALL
              SELECT 'constraint ' || conname
              FROM pg_constraint
              WHERE connamespace = current_schema()::regnamespace AND conname LIKE '%game%'
              UNION ALL
              SELECT 'index ' || indexname
              FROM pg_indexes
              WHERE schemaname = current_schema() AND indexname LIKE '%game%'
              UNION ALL
              SELECT 'trigger ' || tgname
              FROM pg_trigger
              WHERE NOT tgisinternal AND tgname LIKE '%game%'
              UNION ALL
              SELECT 'function ' || proname
              FROM pg_proc
              WHERE pronamespace = current_schema()::regnamespace AND proname LIKE '%game%'
              UNION ALL
              -- _p_update_tables() rebuilt the dependency arrays on every
              -- row, not only the four renamed ones: characters, hands and
              -- users all listed games.id_game before.
              SELECT '_tables row ' || table_name
              FROM _tables
              WHERE table_name LIKE '%game%'
                 OR array_to_string(foreign_key_dependencies, ',') LIKE '%game%'
                 OR array_to_string(primary_key_dependants, ',') LIKE '%game%'
                 OR search_field_name LIKE '%game%'
                 OR array_to_string(search_fields, ',') LIKE '%game%'
                 OR kind_column LIKE '%game%'
                 OR age_column LIKE '%game%'
                 OR death_condition LIKE '%game%') AS names;
        IF leftovers IS NOT NULL THEN
            RAISE EXCEPTION 'The rename to stories left these behind: %', leftovers;
        END IF;
        IF NOT EXISTS (SELECT 1
                       FROM pg_trigger
                       WHERE tgname = 'tr_biu_update_story_sessions_status_timestamps'
                         AND tgrelid = 'story_sessions'::regclass) THEN
            RAISE EXCEPTION 'story_sessions has no status timestamp trigger after the rename.';
        END IF;
        IF NOT EXISTS (SELECT 1
                       FROM pg_trigger
                       WHERE tgname = 'tr_bu_status_transition_story_sessions_status'
                         AND tgrelid = 'story_sessions'::regclass) THEN
            RAISE EXCEPTION 'story_sessions has no status transition trigger after the rename.';
        END IF;
    END
$$;

-- migrate:down
