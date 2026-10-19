-- migrate:up

-- scene_elements.show_image: whether the players' table opens the element's
-- picture full size, as the storyteller's pill pins it from the tack over
-- its thumbnail. It belongs to the link, as show_info does: the same picture
-- can be on show in one scene and not another. False by default, since a
-- picture is put up on purpose; the action that sets it true clears it on
-- the scene's other links, so one picture is up at a time.
ALTER TABLE scene_elements
    ADD COLUMN IF NOT EXISTS show_image boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN scene_elements.show_image IS
    'Whether the players'' table shows the element''s picture full size in this scene.';

-- migrate:down

