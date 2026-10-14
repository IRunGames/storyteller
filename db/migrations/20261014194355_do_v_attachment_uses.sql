-- migrate:up
DO $$
BEGIN
    RAISE NOTICE '[%] START DROP AND CREATE VIEW', clock_timestamp();

    DROP VIEW IF EXISTS v_attachment_uses;
    
    -- ------------------------------------------------------------
-- The pictures of a holder: each attachment_uses row with the attachment it
-- shows, so a caller reads a scene's, a session's or an element's pictures
-- with one `WHERE kind = $1 AND external_id = $2` instead of joining the two
-- tables itself. (A story's own pool is read from attachments by id_story;
-- the story is a holder here only for what it shows directly, its cover.)
--
-- The use's columns come first under their own names, then the attachment's.
-- Both tables have tags, timestamps and audit columns, so the attachment's
-- that clash are prefixed attachment_: `tags` is the use's (where 'cover'
-- lives, which is_cover reads), `attachment_tags` the file's own, which the
-- search_text is built from.
--
-- The rows come in the holder's order: sort_order, then the most recently
-- changed use first. A caller that wants that order repeats the ORDER BY,
-- since Postgres does not promise a view's order survives the outer query.
--
-- The columns are listed rather than taken as u.* and a.*, so a column added
-- to either table does not change the view's shape until it is added here and
-- the view rebuilt: `just make_view v_attachment_uses`.
CREATE VIEW v_attachment_uses AS
SELECT u.id_attachment_use,
       u.id_attachment,
       u.id_story,
       u.kind,
       u.external_id,
       u.sort_order,
       u.tags,
       u.tags @> ARRAY['cover'] AS is_cover,
       u.created_at,
       u.updated_at,
       u.id_created_by_user,
       u.id_updated_by_user,
       a.status,
       a.url,
       a.is_uploaded,
       a.file_name,
       a.content_type,
       a.byte_size,
       a.tags        AS attachment_tags,
       a.search_text,
       a.uploading_at,
       a.ready_at,
       a.error_at,
       a.created_at  AS attachment_created_at,
       a.updated_at  AS attachment_updated_at
FROM attachment_uses u
         JOIN attachments a ON a.id_attachment = u.id_attachment
ORDER BY u.sort_order, u.updated_at DESC, u.id_attachment_use;

    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE CREATING VIEW', clock_timestamp();
END $$;

-- migrate:down

