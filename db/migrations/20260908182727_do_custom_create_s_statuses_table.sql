-- migrate:up
-- Create s_statuses to house statues that are a part of a s_status_workflow
create table s_statuses
(
    s_status_id                 bigserial
        primary key,
    s_status_workflow_id        bigint
        constraint fk_s_statuses_s_status_workflow_id
            references s_status_workflows,
    status_key                  varchar,
    description                 varchar,
    transition_from_status_keys text[],
    created_at                  timestamp with time zone default now(),
    updated_at                  timestamp with time zone default now()
);



-- migrate:down
