create table _global_settings
(
    key        varchar not null
        primary key,
    value      varchar,
    value_id   bigint,
    tags       character varying[]      default '{}'::character varying[],
    user_id    bigint,
    value_at   timestamp,
    json_value jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);



