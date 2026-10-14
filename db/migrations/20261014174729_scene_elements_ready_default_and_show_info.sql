-- migrate:up

-- The scene elements workflow loses INITIAL: nothing read it, since an
-- element brought into a scene is in play from the start, so READY is what
-- a link now starts in. TAPPED, an element used up for now, takes its place
-- in the workflow; the s_statuses seed that follows this migration rebuilds
-- the CHECK, which is why every INITIAL row moves first. The move goes
-- through the transition trigger, which allows it and stamps ready_at.
UPDATE scene_elements
SET status = 'READY'
WHERE status = 'INITIAL';

ALTER TABLE scene_elements
    ALTER COLUMN status SET DEFAULT 'READY';

-- Whether the players' table shows the element's description under its
-- name. True by default: the storyteller hides what the players are not to
-- know yet, which the run page's library can do as elements are added.
ALTER TABLE scene_elements
    ADD COLUMN IF NOT EXISTS show_info boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN scene_elements.show_info IS
    'Whether the players'' table shows the element''s description in this scene.';

-- migrate:down

