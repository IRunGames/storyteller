-- migrate:up
DO $$
BEGIN
    RAISE NOTICE '[%] START DROP AND CREATE VIEW', clock_timestamp();

    DROP VIEW IF EXISTS v_scene_elements;
    
    -- ------------------------------------------------------------
-- The elements of a scene: each scene_elements row with the element it brings
-- in, so a caller reads a scene's elements with one
-- `WHERE id_story_scene = $1` instead of joining the two tables itself.
--
-- The link's columns come first under their own names, then the element's.
-- Both tables have a status, a workflow, timestamps and audit columns, so the
-- element's are prefixed element_: `status` is how the element stands in this
-- scene, `element_status` how it stands in the story.
--
-- The columns are listed rather than taken as se.* and e.*, so a column added
-- to either table does not change the view's shape until it is added here and
-- the view rebuilt: `just view v_scene_elements`.
CREATE VIEW v_scene_elements AS
SELECT se.id_scene_element,
       se.id_story_scene,
       se.id_element,
       se.status,
       se.initial_at,
       se.invisible_at,
       se.ready_at,
       se.disabled_at,
       se.created_at,
       se.updated_at,
       se.id_created_by_user,
       se.id_updated_by_user,
       e.id_story,
       e.kind,
       e.status       AS element_status,
       e.initial_name,
       e.name,
       e.title,
       e.description,
       e.notes,
       e.tags,
       e.search_text  AS element_search_text,
       e.updated_at   AS element_updated_at
FROM scene_elements se
         JOIN elements e ON e.id_element = se.id_element;

    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE CREATING VIEW', clock_timestamp();
END $$;

-- migrate:down

