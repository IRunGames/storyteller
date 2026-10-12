-- migrate:up

-- scene_elements.element_showing: which of the element's names its pill on
-- the run page's play space shows in this scene. The storyteller picks it
-- from the pill's dropdown: the initial name while the players know the
-- element only by that, the name proper once it is revealed, or the title.
-- It belongs to the link and not the element, since the same element can be
-- revealed in one scene and still a stranger in another.
--
-- initial_name is the default because a new link is a first appearance. The
-- column names the field rather than holding its value, so an edit to the
-- element shows through at once; an element without the chosen field shows
-- its name instead, which the page decides.
ALTER TABLE scene_elements
    ADD COLUMN IF NOT EXISTS element_showing varchar NOT NULL DEFAULT 'initial_name';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'scene_elements_element_showing_check'
          AND conrelid = 'scene_elements'::regclass
    ) THEN
        ALTER TABLE scene_elements
            ADD CONSTRAINT scene_elements_element_showing_check
                CHECK (element_showing IN ('initial_name', 'name', 'title'));
    END IF;
END $$;

COMMENT ON COLUMN scene_elements.element_showing IS
    'Which of the element''s fields its pill shows in this scene: '
    'initial_name, name or title.';

-- migrate:down

