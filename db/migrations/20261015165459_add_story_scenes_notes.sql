-- migrate:up
-- The scene's notes: free text beside the description, written at either
-- table from the panel behind the scene's title, by the storyteller or a
-- player. The description is what the scene is; the notes are what is
-- being kept about it as it is played.
ALTER TABLE story_scenes ADD COLUMN IF NOT EXISTS notes text;

-- migrate:down

