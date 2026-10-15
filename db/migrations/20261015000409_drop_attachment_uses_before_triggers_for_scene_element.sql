-- migrate:up
-- The two BEFORE triggers on attachment_uses are dropped so their functions
-- can be replaced by the next two migrations, which add the SCENE_ELEMENT
-- holder to each: a function with triggers on it cannot be dropped without
-- taking them along. attach_attachment_uses_triggers puts both back, with
-- the new holder's AFTER DELETE trigger beside them.
DROP TRIGGER IF EXISTS tr_biu_attachment_uses_external_exists ON attachment_uses;
DROP TRIGGER IF EXISTS tr_biu_attachment_uses_same_story ON attachment_uses;

-- migrate:down

