-- migrate:up

-- story_scenes.wide_tags: the scene's stacks the storyteller has widened to
-- the whole play space, each named by its tag, with '' standing for the
-- Default stack of a scene that has no tags (a stack's name can never be
-- empty, lib/stack-schemas.ts). It belongs to the scene, as the stacks
-- themselves (tags) do: the players' table and the display table draw the
-- same stacks wide, whoever opens them and whenever, and coming back to the
-- scene finds them as they were left. Empty by default, since a stack is
-- widened on purpose.
ALTER TABLE story_scenes
    ADD COLUMN IF NOT EXISTS wide_tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN story_scenes.wide_tags IS
    'The stacks (tags, '''' for the Default stack) the storyteller has widened to the whole play space.';

-- migrate:down

