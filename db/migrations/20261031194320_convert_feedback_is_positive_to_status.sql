-- migrate:up

-- feedback.is_positive becomes status, run by the Feedback Status Workflow
-- (-7): THUMBS_UP, THUMBS_DOWN, or IDEA for the popover's new lightbulb, a
-- third kind a boolean has no room for. Existing rows keep what they said:
-- true becomes THUMBS_UP, false THUMBS_DOWN.
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'THUMBS_UP';

-- Guarded so a re-run, after is_positive is gone, is harmless.
DO
$$
    BEGIN
        IF EXISTS (SELECT 1
                   FROM information_schema.columns
                   WHERE table_schema = current_schema()
                     AND table_name = 'feedback'
                     AND column_name = 'is_positive') THEN
            UPDATE feedback SET status = 'THUMBS_DOWN' WHERE NOT is_positive;
            ALTER TABLE feedback DROP COLUMN is_positive;
        END IF;
    END
$$;

-- Maps the table to the workflow and adds the CHECK on status, the
-- thumbs_up_at / thumbs_down_at / idea_at columns and the triggers that stamp
-- them and refuse a move the workflow does not allow. The timestamps and
-- user ids it already has are left as they are.
CALL _p_set_and_update_table_features('feedback',
    p_timestamps          := TRUE,
    p_user_ids            := TRUE,
    p_status_workflow_ids := ARRAY[-7]);

-- migrate:down

