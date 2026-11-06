-- migrate:up

-- A system is its name, version and variant together ("Cypher System",
-- "Revised", "Numenera"), so two rows that agree on all three are the same
-- system twice, and the New system dialog on the administrators' Systems
-- page is refused a second one. NULLS NOT DISTINCT because version and
-- variant are usually empty: without it two "Palladium" rows with no
-- version would pass, as a unique index treats each NULL as unlike every
-- other. Idempotent, as every migration here is; the table held no
-- duplicate when this was written.
CREATE UNIQUE INDEX IF NOT EXISTS systems_name_version_variant_uindex
    ON systems (system_name, system_version, variant)
    NULLS NOT DISTINCT;

-- migrate:down

