-- A user with the two things every list of users shows about them that the
-- table holds only in pieces: the name of their account type, and a status.
--
--   user_type_name  The s_user_types name for id_user_type ("Paid
--                   Storyteller"), joined here so no reader keeps a list of
--                   the types in code.
--
--   status          One word for the account's state: 'guest' for an
--                   anonymous user who came in by a join link (is_anonymous),
--                   else the row's own status from the Users Status Workflow
--                   (seeds/seed_s_statuses.sql: ACTIVE, INACTIVE, SUSPENDED
--                   or LOCKED) in lower case, so the app's one-word statuses
--                   read alike whichever side they come from. A guest is a
--                   guest whatever its status says, since a guest is deleted
--                   rather than deactivated; Better Auth makes one with the
--                   column's default and never touches it again.
--
-- The user's own columns come through as they are, search_text included, so
-- a caller selects from here instead of from the table. They are named one
-- by one rather than taken with u.*, because the table's own status column
-- would arrive under the same name as the one worked out above and Postgres
-- refuses a view with two columns called status. So a column added to
-- s_users that a reader needs is added here and the view rebuilt:
-- `just view v_users`.
CREATE VIEW v_users AS
SELECT u.id_user,
       u.name,
       u.email,
       u.email_verified,
       u.image,
       u.created_at,
       u.updated_at,
       u.nick_name,
       u.last_login,
       u.hours_played,
       u.id_user_type,
       u.tags,
       u.bio,
       u.is_anonymous,
       u.search_text,
       u.id_created_by_user,
       u.id_updated_by_user,
       u.active_at,
       u.inactive_at,
       u.suspended_at,
       u.locked_at,
       ut.user_type_name,
       CASE
           WHEN u.is_anonymous THEN 'guest'
           ELSE lower(u.status)
           END AS status
FROM s_users u
         JOIN s_user_types ut ON ut.id_user_type = u.id_user_type;
