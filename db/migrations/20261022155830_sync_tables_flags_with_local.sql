-- migrate:up
-- Bring every database's _tables flags up to what the development database
-- holds, then let the metatable procedures add what the flags ask for.
--
-- The flags below were switched on by hand in the development database and
-- never written down as a migration, so a database built from the history
-- (production among them) lacked the timestamps, author columns, archival
-- columns and activity logs the flags give. From here the two agree.
--
-- Only needs_* flags are set: the has_* columns and the dependency arrays
-- are the procedures' own bookkeeping. The procedures add what is missing
-- and leave what is there, so a re-run changes nothing.
CALL _p_update_tables();

UPDATE _tables
SET needs_timestamps = TRUE
WHERE table_name IN ('cards', 'deck_stocks', 'decks', 'hands', 's_card_types', 's_hand_types',
                     's_status_workflows', 's_statuses', 's_user_types', 's_users', 'stories',
                     'story_players', 'systems');

UPDATE _tables
SET needs_activity_log = TRUE
WHERE table_name IN ('cards', 'hands', 's_users', 'stories', 'story_players', 'systems');

UPDATE _tables
SET needs_user_ids = TRUE
WHERE table_name IN ('stories', 'systems');

UPDATE _tables
SET needs_archival = TRUE
WHERE table_name IN ('stories');

CALL _p_update_tables_timestamps();
CALL _p_update_tables_user_ids();
CALL _p_update_tables_archives();
CALL _p_update_tables_activity_log();
CALL _p_update_fk_indexes();

-- The one place the development database was looser than a fresh build:
-- s_users' timestamps are NOT NULL from the auth tables' creation, and the
-- development database had lost that. Idempotent; no row holds a NULL.
ALTER TABLE s_users
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

-- migrate:down

