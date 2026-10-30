-- migrate:up
-- Renumber s_user_types and add Paid Player.
--
-- The app ranks user types by id: the smaller the id, the more the account
-- may do (lib/user-types.ts). The old ids -1, -2, -3 sat next to each other
-- with no room for a Paid Player between Unpaid Player and Unpaid
-- Storyteller, so every type moves to a multiple of five. Each tier is its
-- unpaid type then its paid one:
--
--   -1   Unpaid Player       -> -10
--        Paid Player            -15 (new)
--   -2   Unpaid Storyteller  -> -20
--   -3   Paid Storyteller    -> -25
--   -100 Administrator          -100 (unchanged)
--
-- fk_s_users_id_user_type is ON UPDATE CASCADE, so changing a type's id
-- carries every s_users row with it; there is no separate backfill. The
-- updates run in an order where no new id collides with an old one still
-- waiting to move.
UPDATE s_user_types SET id_user_type = -10 WHERE id_user_type = -1;
UPDATE s_user_types SET id_user_type = -20 WHERE id_user_type = -2;
UPDATE s_user_types SET id_user_type = -25 WHERE id_user_type = -3;

INSERT INTO s_user_types (id_user_type, user_type_name, sort_order)
VALUES (-15, 'Paid Player', 0)
ON CONFLICT (id_user_type) DO NOTHING;

-- A new account still lands on Unpaid Player, under its new id.
ALTER TABLE s_users
    ALTER COLUMN id_user_type SET DEFAULT -10;

-- migrate:down
