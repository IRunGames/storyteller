-- migrate:up
-- Rename Better Auth's tables under the s_ prefix: users, sessions, accounts
-- and verifications become s_users, s_sessions, s_accounts and
-- s_verifications. They are the system's own tracking tables rather than story
-- data, so they sit with the other s_ tables.
--
-- Foreign keys follow a renamed table by oid, so every audit column and
-- id_user that points at users points at s_users afterwards without being
-- touched. RENAME TO leaves constraint and index names alone, though, so each
-- one named after its old table (users_pk, fk_sessions_id_user,
-- idx_fk_accounts_id_user, sessions_expires_at_idx, ...) is renamed with it.
-- That also keeps them matching the fk_<table>_<column> and
-- idx_fk_<table>_<column> names _ensure_foreign_key and _p_update_fk_indexes
-- look for, so neither adds a duplicate under the new name. Renaming a
-- constraint renames its backing index, so indexes are only renamed when no
-- constraint owns them.
--
-- The routines that name users in their SQL text (_append_activity_log,
-- _p_update_tables_user_ids, _p_update_tables_archives) are replaced by the
-- migrations that follow this one. The app reaches the tables through
-- Drizzle (apps/web/src/db/schema.ts), whose pgTable names change with this.

DO
$$
    DECLARE
        pair      TEXT[];
        old_name  TEXT;
        new_name  TEXT;
        obj       RECORD;
        prefix    TEXT;
    BEGIN
        FOREACH pair SLICE 1 IN ARRAY ARRAY [
            ['users', 's_users'],
            ['sessions', 's_sessions'],
            ['accounts', 's_accounts'],
            ['verifications', 's_verifications']
            ]
            LOOP
                old_name := pair[1];
                new_name := pair[2];

                IF to_regclass(new_name) IS NOT NULL THEN
                    RAISE NOTICE '% already exists; skipping rename of %.', new_name, old_name;
                    CONTINUE;
                END IF;

                IF to_regclass(old_name) IS NULL THEN
                    RAISE EXCEPTION 'Cannot rename %: neither it nor % exists.', old_name, new_name;
                END IF;

                EXECUTE format('ALTER TABLE %I RENAME TO %I', old_name, new_name);

                -- <old>_..., fk_<old>_... and idx_fk_<old>_... become the same
                -- names with the new table in them.
                prefix := '^(fk_|idx_fk_)?' || old_name || '_';

                FOR obj IN
                    SELECT conname
                    FROM pg_constraint
                    WHERE conrelid = new_name::regclass
                      AND conname ~ prefix
                    LOOP
                        EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', new_name, obj.conname,
                                       regexp_replace(obj.conname, prefix, '\1' || new_name || '_'));
                    END LOOP;

                FOR obj IN
                    SELECT c.relname
                    FROM pg_index i
                             JOIN pg_class c ON c.oid = i.indexrelid
                    WHERE i.indrelid = new_name::regclass
                      AND c.relname ~ prefix
                      AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = i.indexrelid)
                    LOOP
                        EXECUTE format('ALTER INDEX %I RENAME TO %I', obj.relname,
                                       regexp_replace(obj.relname, prefix, '\1' || new_name || '_'));
                    END LOOP;
            END LOOP;
    END
$$;

-- Keep the _tables metatable in step, guarded against the new row already
-- being present, since table_name is unique. Renaming the rows keeps their
-- settings (users' search_fields recipe and activity log among them);
-- _p_update_tables would otherwise purge them as missing and register the new
-- names with defaults. It then refreshes foreign_key_dependencies and
-- primary_key_dependants, which still spell the old names.
UPDATE _tables t
SET table_name = 's_' || t.table_name
WHERE t.table_name IN ('users', 'sessions', 'accounts', 'verifications')
  AND NOT EXISTS (SELECT 1 FROM _tables t2 WHERE t2.table_name = 's_' || t.table_name);

DELETE
FROM _tables
WHERE table_name IN ('users', 'sessions', 'accounts', 'verifications');

CALL _p_update_tables();

-- migrate:down

