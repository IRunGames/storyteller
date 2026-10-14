-- migrate:up

-- Moves each attachment's holder (kind, external_id, and the 'cover' tag
-- that made it the holder's picture) into attachment_uses, and each
-- element's picture (elements.id_attachment) into an ELEMENT use tagged
-- cover. Runs only while attachments still has its kind column, so a re-run
-- after drop_attachments_kind_external_id is a no-op.
--
-- A STORY row without the cover tag gets no use: it was only ever "in the
-- story", which attachments.id_story now says on its own. A STORY use means
-- the story shows the file directly, which today is its cover alone.
--
-- id_story is copied rather than left to tr_attachment_uses_same_story,
-- which would set it the same way; the trigger still checks the holder is
-- in that story. sort_order comes across where it was set, and the
-- sort_order trigger fills the rest.
DO $$
BEGIN
    IF _column_data_type('attachments', 'kind') IS NULL THEN
        RAISE NOTICE 'attachments.kind is gone already; nothing to move.';
        RETURN;
    END IF;

    INSERT INTO attachment_uses (id_attachment, id_story, kind, external_id, sort_order, tags,
                                 created_at, updated_at, id_created_by_user, id_updated_by_user)
    SELECT a.id_attachment,
           a.id_story,
           a.kind::text::attachment_uses_kind,
           a.external_id,
           a.sort_order,
           CASE WHEN a.tags @> ARRAY['cover'] THEN ARRAY['cover'] ELSE '{}'::text[] END,
           a.created_at,
           a.updated_at,
           a.id_created_by_user,
           a.id_updated_by_user
    FROM attachments a
    WHERE a.external_id IS NOT NULL
      AND a.id_story IS NOT NULL
      AND (a.kind::text <> 'STORY' OR a.tags @> ARRAY['cover'])
    ON CONFLICT (id_attachment, kind, external_id) DO NOTHING;

    INSERT INTO attachment_uses (id_attachment, id_story, kind, external_id, tags,
                                 created_at, updated_at, id_created_by_user, id_updated_by_user)
    SELECT e.id_attachment,
           e.id_story,
           'ELEMENT',
           e.id_element,
           ARRAY['cover'],
           e.updated_at,
           e.updated_at,
           e.id_updated_by_user,
           e.id_updated_by_user
    FROM elements e
             JOIN attachments a ON a.id_attachment = e.id_attachment
    WHERE e.id_attachment IS NOT NULL
      AND a.id_story = e.id_story
    ON CONFLICT (id_attachment, kind, external_id) DO NOTHING;

    -- The cover now lives on the use; the file's own tags keep the rest.
    UPDATE attachments
    SET tags = array_remove(tags, 'cover')
    WHERE tags @> ARRAY['cover'];
END $$;

-- migrate:down

