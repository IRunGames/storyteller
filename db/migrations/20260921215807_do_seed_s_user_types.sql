-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    -- Foreign keys to and from the table off, its triggers off; _seed_end
    -- puts them back and checks every row (functions/_seed_begin.sql says why).
    PERFORM _seed_begin('s_user_types');

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    -- Name the ids this seed inserts; never clear by id < 0.
    DELETE FROM s_user_types WHERE id_user_type IN (-1, -2, -3, -100);

    RAISE NOTICE '+++    [%] Seeding s_user_types', clock_timestamp();

    -- ------------------------------------------------------------
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
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    PERFORM _seed_end('s_user_types');

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

