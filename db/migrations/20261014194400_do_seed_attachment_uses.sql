-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    -- The seeded attachments' uses too, whatever id they carry: the migration
    -- that moved covers into uses gave the seed's covers uses of their own
    -- before this seed existed, and the attachments seed runs with the
    -- foreign key's cascade off.
    DELETE FROM attachment_uses
    WHERE id_attachment_use IN (-11, -12, -13, -14, -15)
       OR id_attachment IN (-11, -12, -13, -14, -15);

    RAISE NOTICE '+++    [%] Seeding attachment_uses', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `attachment_uses`: each example story's cover, which is
    -- its one picture (db/seeds/seed_attachments.sql, which must run first)
    -- used by the story itself and tagged 'cover'. The story is a holder like
    -- any other here: owning the picture is attachments.id_story, showing it
    -- on its card and page is this row.
    --
    -- id_story and sort_order are written out because the seed runs with
    -- triggers off, so tr_attachment_uses_same_story and
    -- tr_attachment_uses_sort_order are not there to fill them.
    INSERT INTO attachment_uses (id_attachment_use, id_attachment, id_story, kind, external_id,
                                 sort_order, tags, created_at, updated_at,
                                 id_created_by_user, id_updated_by_user)
    VALUES
        (-11, -11, -17, 'STORY', -17, 0, '{cover}', DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000003'),
        (-12, -12, -18, 'STORY', -18, 0, '{cover}', DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000004', '00000000-0000-7000-8000-000000000004'),
        (-13, -13, -19, 'STORY', -19, 0, '{cover}', DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000005', '00000000-0000-7000-8000-000000000005'),
        (-14, -14, -20, 'STORY', -20, 0, '{cover}', DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000006', '00000000-0000-7000-8000-000000000006'),
        (-15, -15, -21, 'STORY', -21, 0, '{cover}', DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000007', '00000000-0000-7000-8000-000000000007');
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

