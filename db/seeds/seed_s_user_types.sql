    -- Seed data for `s_user_types`: the kinds of account a user can hold.
    -- db/seeds/seed_s_users.sql gives its fixture users -1 and -2, so this
    -- seed must run before it; a database built from scratch had no rows here
    -- and the users seed only passed because nothing checked the key.
    INSERT INTO s_user_types (id_user_type, user_type_name, sort_order)
    VALUES
        (-1,   'Unpaid Player',      0),
        (-2,   'Unpaid Storyteller', 0),
        (-3,   'Paid Storyteller',   0),
        (-100, 'Administrator',      0);
