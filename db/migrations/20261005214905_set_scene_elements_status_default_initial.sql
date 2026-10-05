-- migrate:up
-- A new scene element starts in INITIAL rather than READY. The status is
-- seeded into workflow -5 by the s_statuses seed migration just before this
-- one, which also rebuilds the CHECK on scene_elements.status to allow it and
-- adds initial_at. Only the column default is left, which a re-seed does not
-- touch.
--
-- Rows already in the table keep the status they hold: READY was a real
-- choice for them, not a placeholder.
ALTER TABLE scene_elements
    ALTER COLUMN status SET DEFAULT 'INITIAL';

-- migrate:down

