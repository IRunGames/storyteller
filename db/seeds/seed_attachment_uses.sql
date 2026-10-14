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
