-- auto-generated definition
create table _tables
(
    _table_id                serial
        primary key,
    table_name               text                                   not null
        unique,
    s_status_workflow_ids    integer[],
    needs_timestamps         boolean             not null     default false,
    has_timestamps           boolean,
    needs_archival           boolean                not null  default false,
    has_archival             boolean,
    needs_user_ids           boolean               not null   default false,
    has_user_ids             boolean,
    id_is_uuid               boolean default false,
    foreign_key_dependencies text[],
    created_at               timestamp with time zone default now(),
    updated_at               timestamp with time zone default now(),
    needs_fk_indexes         boolean                  default true,
    primary_key_dependants   text[],
    search_field_name        varchar,
    search_fields            text[],
    kind_column              text,
    kind_values              text[],
    needs_activity_log       boolean                  default false not null,
    has_activity_log         boolean                  default false not null,
    needs_system_fields      boolean                  default false not null,
    has_system_fields        boolean                  default false not null,
    max_age                  text,
    cascade_delete           boolean                  default true  not null,
    age_column               text,
    death_condition          text,
    last_culled              timestamp with time zone
);

comment on column _tables.max_age is 'Retention interval for this table, written as an interval string ("90 days", "2 weeks", "6 months", "2 years"). NULL means the table is never reaped by _death_knell.';

comment on column _tables.cascade_delete is 'When TRUE (default), _death_knell DELETEs honor FK constraints (cascading or blocking per declaration). When FALSE, the DELETE is wrapped in SET LOCAL session_replication_role = ''replica'' to bypass FK enforcement entirely.';

comment on column _tables.age_column is 'Override for the column _death_knell uses as the row age. NULL → use updated_at when has_timestamps, else created_at.';

comment on column _tables.death_condition is 'Optional extra WHERE clause fragment AND-ed onto the DELETE. Free-form raw SQL (admin-authored, intentional dynamic SQL). NULL or empty = no extra predicate. Example: status = ''CLOSED''.';

comment on column _tables.last_culled is 'Stamped by _death_knell each time it processes this table (regardless of how many rows were deleted).';
