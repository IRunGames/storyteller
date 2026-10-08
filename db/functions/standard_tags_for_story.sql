/*
The tags a story's new scene starts with: the story's own standard_tags, or
when it has none its system's, or when that has none either the defaults
'elements' and 'scene'. Used by tr_story_scenes_standard_tags as each scene
is inserted, and by the migration that backfilled the scenes already there.

An empty array counts as none, the same as NULL, since the columns default
to '{}' rather than NULL. A story with no system, or one that is not there,
falls through to the defaults.
*/
CREATE OR REPLACE FUNCTION standard_tags_for_story(p_id_story integer) RETURNS text[]
    LANGUAGE sql
    STABLE
AS
$$
SELECT COALESCE(
    (SELECT NULLIF(st.standard_tags, '{}')
     FROM stories st
     WHERE st.id_story = p_id_story),
    (SELECT NULLIF(sy.standard_tags, '{}')
     FROM stories st
              JOIN systems sy ON sy.id_system = st.id_system
     WHERE st.id_story = p_id_story),
    ARRAY ['elements', 'scene']::text[]
);
$$;
