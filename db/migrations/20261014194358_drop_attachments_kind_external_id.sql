-- migrate:up

-- The holder left attachments for attachment_uses two migrations back
-- (attachment_uses_from_attachments), and the views that read these
-- columns have been rebuilt without them, so what tied an attachment to one
-- holder goes: the triggers and functions that kept kind / external_id
-- honest, the indexes over them, the columns, the enum, and the kind
-- declaration in _tables that would otherwise build the column back.
-- sort_order went to the use as well, and elements.id_attachment, the
-- element's old pointer at its picture, is now its ELEMENT use. Every drop
-- is plain: anything still depending on one makes Postgres refuse rather
-- than take it down too.

DROP TRIGGER IF EXISTS tr_biu_attachments_external_exists ON attachments;
DROP TRIGGER IF EXISTS tr_biu_attachments_id_story ON attachments;
DROP TRIGGER IF EXISTS tr_ad_stories_attachments ON stories;
DROP TRIGGER IF EXISTS tr_ad_story_sessions_attachments ON story_sessions;
DROP TRIGGER IF EXISTS tr_ad_story_scenes_attachments ON story_scenes;

DROP FUNCTION IF EXISTS tr_attachments_external_exists();
DROP FUNCTION IF EXISTS tr_attachments_set_id_story();
DROP FUNCTION IF EXISTS tr_attachments_delete_for_parent();

DROP INDEX IF EXISTS attachments_kind_external_id_idx;
DROP INDEX IF EXISTS attachments_one_cover_idx;

ALTER TABLE attachments
    DROP COLUMN IF EXISTS kind,
    DROP COLUMN IF EXISTS external_id,
    DROP COLUMN IF EXISTS sort_order;

DROP TYPE IF EXISTS attachments_kind;

UPDATE _tables
SET kind_values = NULL,
    kind_column = NULL
WHERE table_name = 'attachments';

COMMENT ON COLUMN attachments.id_story IS
    'The story that owns the attachment. Which of its parts show it is '
    'attachment_uses; a row with no story is a create form''s upload not yet '
    'claimed by a use, and the blob sweep takes it after a while.';

ALTER TABLE elements
    DROP COLUMN IF EXISTS id_attachment;

CALL _p_update_tables();

-- migrate:down

