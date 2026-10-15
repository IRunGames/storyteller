-- migrate:up
-- An external link on an element, and another on an element's link to one
-- scene: the address, and the words to show for it (the pill's tooltip,
-- else the address itself). The scene's pair stands in front of the
-- element's at the players' table, as the scene's picture does.
ALTER TABLE elements ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS url_text text;
ALTER TABLE scene_elements ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE scene_elements ADD COLUMN IF NOT EXISTS url_text text;

-- migrate:down

