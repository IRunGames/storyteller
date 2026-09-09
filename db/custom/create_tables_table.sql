
-- auto-generated definition
CREATE TABLE _tables
(
    _table_id                SERIAL
        PRIMARY KEY,
    table_name               TEXT NOT NULL,
    s_status_workflow_ids    INTEGER[],
    needs_timestamps         BOOLEAN                  DEFAULT FALSE,
    has_timestamps           BOOLEAN,
    needs_archival           BOOLEAN                  DEFAULT FALSE,
    has_archival             BOOLEAN,
    needs_user_ids           BOOLEAN                  DEFAULT FALSE,
    has_user_ids             BOOLEAN,
    needs_system_fields      BOOLEAN                  DEFAULT FALSE,
    has_system_fields        BOOLEAN,
    id_is_uuid               BOOLEAN,
    foreign_key_dependencies TEXT[],
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    needs_fk_indexes         BOOLEAN                  DEFAULT TRUE,
    primary_key_dependants   TEXT[],
    search_field_name        VARCHAR,
    search_fields            TEXT[],
    kind_column              TEXT,
    kind_values              TEXT[],
    UNIQUE (step_name)
);

ALTER TABLE _tables
    OWNER TO formforge;

CREATE UNIQUE INDEX _tables_table_name_key
    ON _tables (_table_id);

CREATE UNIQUE INDEX _tables_table_name_key
    ON _tables ();

