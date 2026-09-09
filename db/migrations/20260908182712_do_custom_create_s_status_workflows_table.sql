-- migrate:up
-- Create s_status_workflows
create table s_status_workflows
(
    s_status_workflow_id bigserial
        primary key,
    name                 varchar,
    status_column_name   varchar,
    workflow_trigger     varchar,
    created_at           timestamp with time zone default now(),
    updated_at           timestamp with time zone default now()
);


-- migrate:down
