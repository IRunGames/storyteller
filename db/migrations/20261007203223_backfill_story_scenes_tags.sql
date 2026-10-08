-- migrate:up

-- Gives the scenes that existed before story_scenes.tags the standard tags a
-- scene made now starts with (functions/standard_tags_for_story.sql): their
-- story's, else its system's, else 'elements' and 'scene'. Only scenes with
-- no tags yet, so a re-run changes nothing.
--
-- The table's triggers are off for the update, set_updated_at among them, so
-- updated_at keeps its value: this is not an edit anyone made, and the run
-- page's scene selector lists scenes by when they were last touched. dbmate
-- runs the migration in a transaction, so a failure cannot leave them off.
ALTER TABLE story_scenes DISABLE TRIGGER USER;

UPDATE story_scenes
SET tags = standard_tags_for_story(id_story)
WHERE tags = '{}';

ALTER TABLE story_scenes ENABLE TRIGGER USER;

-- migrate:down

