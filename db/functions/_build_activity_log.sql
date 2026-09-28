CREATE OR REPLACE FUNCTION _build_activity_log(
    activity_category VARCHAR,
    current_activity_log jsonb DEFAULT '[]'::jsonb,
    activity_details TEXT DEFAULT '',
    activity_status VARCHAR DEFAULT NULL,
    activity_source VARCHAR DEFAULT NULL,
    activity_tags VARCHAR[] DEFAULT '{}'::VARCHAR[],
    user_id TEXT DEFAULT NULL,
    template_version_id uuid DEFAULT NULL,
    file_id uuid DEFAULT NULL,
    related_activity_id uuid DEFAULT NULL,
    activity_data jsonb DEFAULT NULL
) RETURNS TABLE (
    activity_log jsonb,
    activity_id uuid
)
    IMMUTABLE
    PARALLEL SAFE
    LANGUAGE plpgsql
AS
$func$
DECLARE
    new_activity_id uuid;
    new_activity_log jsonb;
BEGIN
    new_activity_id := gen_random_uuid();
    
    new_activity_log := COALESCE(current_activity_log, '[]'::jsonb) || JSONB_BUILD_OBJECT(
            'activityId', new_activity_id,
            'activityAt', NOW(),
            'activityCategory', activity_category,
            'activitySource', activity_source,
            'activityDetails', activity_details,
            'activityStatus', activity_status,
            'activityTags', activity_tags,
            'userId', user_id,
            'templateVersionId', template_version_id,
            'fileId', file_id,
            'relatedActivityId', related_activity_id,
            'activityData', COALESCE(activity_data::jsonb, 'null'::jsonb)
                                                          );
    
    RETURN QUERY SELECT new_activity_log, new_activity_id;
END;
$func$;
