/*
Starts a new scene with its story's standard tags (standard_tags_for_story):
the story's, else its system's, else 'elements' and 'scene'. In the database
rather than the actions so every way a scene is made gets them, the board's
New scene, the table's Create new scene and a seed alike.

Only a scene inserted with no tags is filled; one given tags keeps them.
*/
CREATE OR REPLACE FUNCTION tr_story_scenes_standard_tags() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    IF NEW.tags IS NULL OR NEW.tags = '{}' THEN
        NEW.tags := standard_tags_for_story(NEW.id_story);
    END IF;
    RETURN NEW;
END;
$$;
