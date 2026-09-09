-- Bring users up to what Better Auth needs, and add the three tables it owns
-- outright: sessions, accounts, verifications.
--
-- Better Auth runs with advanced.database.generateId = "uuid" and the drizzle
-- adapter's provider "pg", so it omits `id` from every INSERT and depends on
-- DEFAULT gen_random_uuid() below. Dropping those defaults breaks sign-in.
--
-- Column names follow the id_<singular> convention. Better Auth's own field
-- names (name, email, emailVerified, image, createdAt...) exist only as
-- TypeScript keys in apps/web/src/db/schema.ts and never reach SQL.
--
-- Requires _column_exists and _column_type_exists, so this migration must be
-- stamped after theirs.


-- ---------------------------------------------------------------------------
-- 1. users: convert id_user from bigint identity to uuid
-- ---------------------------------------------------------------------------

-- Guarded on id_user still being the bigint identity column. The rename steps
-- below are not individually idempotent — re-running them unguarded would
-- rename the *new* uuid id_user to legacy_id_user and destroy the key.
do
$$
    begin
        if not _column_type_exists('users', 'id_user', 'bigint') then
            raise notice 'users.id_user is already uuid; skipping conversion.';
            return;
        end if;

        -- A run that stopped mid-swap leaves legacy_id_user behind while
        -- id_user is still bigint. Renaming into an occupied name fails with a
        -- generic error, so name the real problem instead.
        if _column_exists('users', 'legacy_id_user') then
            raise exception
                'users.legacy_id_user already exists while id_user is still bigint. '
                    'A previous run of this migration stopped partway; resolve by hand.';
        end if;

        -- Staged as a separate column so existing rows keep working until the swap.
        -- uuidv7() is VOLATILE, so this cannot take the PG11+ "fast default"
        -- shortcut of stamping one constant into the catalog: Postgres rewrites
        -- the table and evaluates the default once per row, so existing rows are
        -- backfilled with distinct ids and NOT NULL holds immediately.
        alter table users
            add column if not exists id_user_uuid uuid not null default uuidv7();

        -- The old surrogate key is kept rather than dropped: migrations here are
        -- forward-only, and anything outside this repo still holding a bigint user
        -- id has no other way back to its row. Drop this column once you have
        -- confirmed nothing depends on it.
        alter table users
            rename column id_user to legacy_id_user;

        alter table users
            alter column legacy_id_user drop identity if exists;

        alter table users
            drop constraint if exists users_pk;

        drop index if exists users_id_user_uindex;

        alter table users
            rename column id_user_uuid to id_user;

        alter table users
            add constraint users_pk primary key (id_user);
    end
$$;


-- ---------------------------------------------------------------------------
-- 2. users: columns Better Auth requires
-- ---------------------------------------------------------------------------

alter table users
    add column if not exists email_verified boolean                  default false not null,
    add column if not exists created_at     timestamp with time zone default now() not null,
    add column if not exists updated_at     timestamp with time zone default now() not null;

-- Signup inserts no user type, so the column needs one of its own.
alter table users
    alter column id_user_type set default 1;

-- last_login predates the timestamptz convention. The USING clause reads the
-- stored values as UTC; if they were written in local time, change the zone
-- here before running this.
do
$$
    begin
        if _column_type_exists('users', 'last_login', 'timestamp without time zone') then
            alter table users
                alter column last_login type timestamp with time zone
                    using last_login at time zone 'UTC';

            alter table users
                alter column last_login set default now();
        end if;
    end
$$;

-- Better Auth treats email as the unique login handle. A unique index permits
-- multiple NULLs in Postgres, so this is safe to apply before the backfill.
create unique index if not exists users_user_email_uindex
    on users (user_email);

-- NOT NULL is applied separately because it cannot succeed while any row still
-- has a null email. Failing loudly here beats a half-migrated users table.
do
$$
    declare
        null_emails bigint;
    begin
        select count(*) into null_emails from users where user_email is null;

        if null_emails > 0 then
            raise exception
                'Cannot set users.user_email NOT NULL: % row(s) have a null email. '
                    'Backfill or remove them, then re-run this migration.', null_emails;
        end if;

        alter table users
            alter column user_email set not null;
    end
$$;


-- ---------------------------------------------------------------------------
-- 3. Tables owned entirely by Better Auth
-- ---------------------------------------------------------------------------

create table if not exists sessions
(
    id_session uuid                     default gen_random_uuid()
        constraint sessions_pk
            primary key,
    expires_at timestamp with time zone not null,
    token      text                     not null
        unique,
    ip_address text,
    user_agent text,
    id_user    uuid                     not null
        constraint fk_sessions_id_user
            references users (id_user) on delete cascade,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

create index if not exists sessions_id_user_idx
    on sessions (id_user);

-- Expiry sweeps scan on this alone.
create index if not exists sessions_expires_at_idx
    on sessions (expires_at);

create table if not exists accounts
(
    id_account               uuid                     default gen_random_uuid()
        constraint accounts_pk
            primary key,
    account_id               text                     not null,
    provider_id              text                     not null,
    id_user                  uuid                     not null
        constraint fk_accounts_id_user
            references users (id_user) on delete cascade,
    access_token             text,
    refresh_token            text,
    id_token                 text,
    access_token_expires_at  timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope                    text,
    password                 text,
    created_at               timestamp with time zone default now() not null,
    updated_at               timestamp with time zone default now() not null
);

create index if not exists accounts_id_user_idx
    on accounts (id_user);

-- One row per (provider, remote account); blocks double-linking on OAuth.
create unique index if not exists accounts_provider_id_account_id_uindex
    on accounts (provider_id, account_id);

create table if not exists verifications
(
    id_verification uuid                     default gen_random_uuid()
        constraint verifications_pk
            primary key,
    identifier      text                     not null,
    value           text                     not null,
    expires_at      timestamp with time zone not null,
    created_at      timestamp with time zone default now() not null,
    updated_at      timestamp with time zone default now() not null
);

create index if not exists verifications_identifier_idx
    on verifications (identifier);
