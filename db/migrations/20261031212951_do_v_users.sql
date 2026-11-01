-- migrate:up
DO $$
BEGIN
    RAISE NOTICE '[%] START DROP AND CREATE VIEW', clock_timestamp();

    DROP VIEW IF EXISTS v_users;
    
    -- ------------------------------------------------------------
-- A user with the two things every list of users shows about them that the
-- table holds only in pieces: the name of their account type, and a status.
--
--   user_type_name  The s_user_types name for id_user_type ("Paid
--                   Storyteller"), joined here so no reader keeps a list of
--                   the types in code.
--
--   status          One word for the account's state, from two flags:
--                   'guest' for an anonymous user who came in by a join
--                   link (is_anonymous), 'inactive' for an account that has
--                   been switched off (is_active false), else 'active'. A
--                   guest is a guest whatever is_active says, since a guest
--                   is deleted rather than deactivated.
--
-- The user's own columns come through as they are, search_text included, so
-- a caller selects from here instead of from the table. A view freezes what
-- `u.*` meant when it was created, so a column added to s_users later needs
-- this view rebuilt: `just view v_users`.
CREATE VIEW v_users AS
SELECT u.*,
       ut.user_type_name,
       CASE
           WHEN u.is_anonymous THEN 'guest'
           WHEN NOT u.is_active THEN 'inactive'
           ELSE 'active'
           END AS status
FROM s_users u
         JOIN s_user_types ut ON ut.id_user_type = u.id_user_type;

    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE CREATING VIEW', clock_timestamp();
END $$;

-- migrate:down

