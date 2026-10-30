    -- Seed data for `s_user_types`: the kinds of account a user can hold.
    -- The smaller the id, the more the account may do; each tier is its
    -- unpaid type then its paid one, five apart, so a type can be added
    -- between two others by id alone.
    -- db/seeds/seed_s_users.sql gives its fixture users -10 and -20, so this
    -- seed must run before it; a database built from scratch had no rows here
    -- and the users seed only passed because nothing checked the key.
    INSERT INTO s_user_types (id_user_type, user_type_name, sort_order)
    VALUES
        (-10,  'Unpaid Player',      0),
        (-15,  'Paid Player',        0),
        (-20,  'Unpaid Storyteller', 0),
        (-25,  'Paid Storyteller',   0),
        (-100, 'Administrator',      0);
