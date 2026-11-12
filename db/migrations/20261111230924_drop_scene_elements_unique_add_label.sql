-- migrate:up

-- An element may now be in a scene more than once: two goblins from one
-- Goblin element, each link with its own status, stack, pictures and stat
-- blocks. The constraint that held an element to one link per scene goes;
-- the app tells the storyteller a copy was added rather than refusing it.
ALTER TABLE scene_elements
    DROP CONSTRAINT IF EXISTS scene_elements_id_story_scene_id_element_key;

-- The link's own words for its pill, in place of the element's showing
-- field: a copy is named with a counter after the element's name ("Goblin
-- 1", "Goblin 2") when it is made, and the storyteller may change it on the
-- pill's edit form. NULL for a link that goes by the element's field.
ALTER TABLE scene_elements
    ADD COLUMN IF NOT EXISTS label text;

COMMENT ON COLUMN scene_elements.label IS
    'This link''s own words for its pill, offered beside the element''s fields as element_showing ''label''; NULL for none.';

-- The pill may show the label as it shows the element's three fields, so
-- element_showing takes a fourth value. The check is replaced whole, since a
-- CHECK cannot be altered in place.
ALTER TABLE scene_elements
    DROP CONSTRAINT IF EXISTS scene_elements_element_showing_check;
ALTER TABLE scene_elements
    ADD CONSTRAINT scene_elements_element_showing_check
        CHECK (element_showing IN ('initial_name', 'name', 'title', 'label'));

COMMENT ON COLUMN scene_elements.element_showing IS
    'Which field the pill shows for this link in this scene: the element''s initial_name, name or title, or the link''s own label.';

-- migrate:down

-- Links showing their label go back to the default before the value is
-- refused again; the view that reads the column is dropped by its own
-- migration's rollback.
UPDATE scene_elements SET element_showing = 'initial_name' WHERE element_showing = 'label';
ALTER TABLE scene_elements
    DROP CONSTRAINT IF EXISTS scene_elements_element_showing_check;
ALTER TABLE scene_elements
    ADD CONSTRAINT scene_elements_element_showing_check
        CHECK (element_showing IN ('initial_name', 'name', 'title'));

ALTER TABLE scene_elements
    DROP COLUMN IF EXISTS label;

-- Only holds once each element is in each scene at most once again.
ALTER TABLE scene_elements
    ADD CONSTRAINT scene_elements_id_story_scene_id_element_key UNIQUE (id_story_scene, id_element);
