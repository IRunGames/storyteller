-- migrate:up
-- Drop games.id_user.
--
-- The column is integer NOT NULL with no foreign key, while users.id_user has
-- been uuid since 6aa39c9 rebuilt users on a uuidv7 key. That migration
-- converted game_players.id_user and characters.id_user but missed this one,
-- so it has been pointing at nothing ever since: no integer can name a row in
-- users, and no constraint was there to say so.
--
-- It is dropped rather than converted to uuid because games already records
-- ownership twice over. id_created_by_user, added by the _p_update_tables_user_ids
-- machinery, is a uuid with a real foreign key and holds whoever created the
-- game. A second owner column would be a second answer to the same question.
-- If the storyteller ever needs to be someone other than the creator, that
-- wants its own explicitly named column (id_storyteller_user) rather than a
-- revived id_user, so nothing is preserved here.
--
-- games is empty at the time of writing, so no data is lost. Nothing selects
-- the column: no view or rule depends on it (checked against pg_depend), no
-- routine names it, and the Drizzle schema models only the better-auth tables,
-- not games.

ALTER TABLE games
    DROP COLUMN IF EXISTS id_user;

-- migrate:down

