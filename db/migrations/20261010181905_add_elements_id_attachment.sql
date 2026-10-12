-- migrate:up

-- elements.id_attachment: the element's picture, which its pill in the run
-- page's play space shows. One of the story's attachments, picked from the
-- story's or a scene's list, and only pointed at: it stays where it is, in
-- that list, a handout or a cover as before. The run page's action checks it
-- belongs to the element's story; nothing here does, as nothing holds a
-- scene element's two halves to one story either.
--
-- ON DELETE SET NULL: deleting the attachment leaves the element without a
-- picture rather than taking the element with it.
ALTER TABLE elements
    ADD COLUMN IF NOT EXISTS id_attachment integer
        REFERENCES attachments (id_attachment) ON DELETE SET NULL;

COMMENT ON COLUMN elements.id_attachment IS
    'The element''s picture: one of its story''s attachments, pointed at, not moved.';

-- The same name _p_update_fk_indexes would choose, so its next run finds it.
CREATE INDEX IF NOT EXISTS idx_fk_elements_id_attachment
    ON elements (id_attachment);

-- Make sure the metatable's record of foreign keys and dependants catches up.
CALL _p_update_tables();

-- migrate:down

