-- migrate:up

-- Attachments get the standard tags feature: a TEXT[] tags column, NOT NULL
-- DEFAULT '{}', with a GIN index. Through the declaration rather than an
-- ALTER of its own, so _tables records it and the table's other features are
-- re-asserted along the way, which is a no-op for ones already in place.
CALL _p_set_and_update_table_features('attachments', p_tags := TRUE);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM _tables WHERE table_name = 'attachments' AND has_tags) THEN
        RAISE EXCEPTION 'attachments did not get its tags column; see its activity_log in _tables.';
    END IF;
END $$;

-- The picture a story card, a story page, a session popover and a scene panel
-- show is now the attachment tagged 'cover', not merely the first READY one.
-- So every object keeps the picture it shows today, that one is tagged here:
-- the first READY attachment in the order the app used to pick it,
-- sort_order then id_attachment, with NULLs last as ORDER BY puts them. This
-- covers the seed's stories, sessions and scenes as well as everyone else's.
--
-- An object that already has a cover is skipped, so a re-run tags nothing
-- twice and never gives an object a second one.
UPDATE attachments a
SET tags = array_append(a.tags, 'cover')
FROM (SELECT DISTINCT ON (kind, external_id) id_attachment
      FROM attachments
      WHERE status = 'READY'
        AND external_id IS NOT NULL
      ORDER BY kind, external_id, sort_order, id_attachment) first_ready
WHERE a.id_attachment = first_ready.id_attachment
  AND NOT EXISTS (SELECT 1
                  FROM attachments c
                  WHERE c.kind = a.kind
                    AND c.external_id = a.external_id
                    AND c.tags @> ARRAY ['cover']);

-- At most one cover per object, so "which picture is the cover" always has a
-- single answer and two storytellers' clicks cannot leave two. A detached
-- row's NULL external_id never collides with another, which is right: it has
-- no object to be the cover of yet.
CREATE UNIQUE INDEX IF NOT EXISTS attachments_one_cover_idx
    ON attachments (kind, external_id)
    WHERE tags @> ARRAY ['cover'];

-- migrate:down
