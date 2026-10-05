-- migrate:up

-- attachments.id_story: the story every attachment belongs to, whichever
-- part of it -- the story, a session, a scene -- it is attached to. Nothing
-- lists attachments by it; it is there so a story's attachments can all be
-- found from the story, for cleaning up after one. tr_attachments_set_id_story
-- keeps it filled and has to be migrated before this runs.
--
-- ON DELETE CASCADE, as story_scenes.id_story is: the tr_ad_*_attachments
-- triggers already remove each part's attachments as it goes, so this only
-- catches a row they missed. The blobs are left to the sweep, as ever.
ALTER TABLE attachments
    ADD COLUMN IF NOT EXISTS id_story integer REFERENCES stories (id_story) ON DELETE CASCADE;

COMMENT ON COLUMN attachments.id_story IS
    'The story the attachment belongs to, whatever it is attached to; kept by '
    'tr_attachments_set_id_story. Not read by any list: for cleaning up a story.';

-- The same name _p_update_fk_indexes would choose, so its next run finds it.
CREATE INDEX IF NOT EXISTS idx_fk_attachments_id_story ON attachments (id_story);

-- After tr_biu_attachments_external_exists by name, so the parent is known to
-- be there before it is looked up.
CREATE OR REPLACE TRIGGER tr_biu_attachments_id_story
    BEFORE INSERT OR UPDATE OF kind, external_id ON attachments
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_set_id_story();

-- Every attachment already on a story, session or scene. Only rows still
-- without one, so a re-run sets nothing twice.
UPDATE attachments a
SET id_story = CASE a.kind
                   WHEN 'STORY' THEN a.external_id
                   WHEN 'STORY_SESSION' THEN (SELECT ss.id_story
                                              FROM story_sessions ss
                                              WHERE ss.id_story_session = a.external_id)
                   WHEN 'STORY_SCENE' THEN (SELECT sc.id_story
                                            FROM story_scenes sc
                                            WHERE sc.id_story_scene = a.external_id)
    END
WHERE a.id_story IS NULL
  AND a.external_id IS NOT NULL;

-- Make sure the metatable's record of foreign keys and dependants catches up.
CALL _p_update_tables();

-- migrate:down

