-- migrate:up
-- Rebuild users on a uuid primary key, and add the three tables Better Auth
-- owns outright: sessions, accounts, verifications.
--
-- users was empty, so it is dropped and recreated rather than converted in
-- place. That also avoids the bigint->uuid dance on the two tables that
-- reference it.
--
-- The Better Auth columns use Better Auth's own field names (name, email,
-- image, email_verified, created_at, updated_at) exactly as declared in
-- apps/web/src/db/schema.ts, so the Drizzle adapter maps straight onto them.
-- `image` is the former avatar_link column under its Better Auth name.
-- The primary key is the one column schema.ts remaps, keeping the
-- id_<singular> convention: id -> id_user.
--
-- This file and schema.ts are one contract: renaming a column here without
-- updating the matching declaration there breaks every query on that table.
--
-- Better Auth runs with advanced.database.generateId = "uuid" and the drizzle
-- adapter's provider "pg", so it omits `id` from every INSERT and depends on
-- DEFAULT uuidv7() below. Dropping those defaults breaks sign-in. uuidv7 is
-- time-ordered, so new rows append to the right edge of the primary key index
-- instead of scattering across it the way uuidv4 does. Requires Postgres 18+.
--
-- DESTRUCTIVE: drops and recreates users, sessions, accounts and
-- verifications, and drops/recreates the columns referencing users. On
-- game_players that column is renamed in passing: the old bigint id_player
-- becomes id_user, matching characters and the FK name that already said so.
-- Every one of these tables was empty when this was written; there is no
-- bigint -> uuid mapping, so running this against populated tables discards
-- those rows.


-- ---------------------------------------------------------------------------
-- 1. Release the columns referencing users
-- ---------------------------------------------------------------------------

-- Dropping the column drops its foreign key with it. Both columns are plain
-- data columns: neither belongs to a primary key nor carries an index of its
-- own, so nothing else is lost.
alter table characters
    drop column if exists id_user;

alter table game_players
    drop column if exists id_player,
    drop column if exists id_user;

-- The three Better Auth tables carry FKs to users, so they must go before
-- users can be dropped below. They hold no state worth keeping: sessions and
-- verifications are short-lived by nature, and accounts is rebuilt when a user
-- next signs in through a provider.
drop table if exists sessions;
drop table if exists accounts;
drop table if exists verifications;


-- ---------------------------------------------------------------------------
-- 2. Rebuild users
-- ---------------------------------------------------------------------------

drop table if exists users;

create table users
(
    id_user        uuid                     default uuidv7()          not null
        constraint users_pk
            primary key,

    -- Better Auth's required fields, under Better Auth's own names so the
    -- Drizzle adapter maps straight onto them with no translation. `image` is
    -- the avatar URL — it is the old avatar_link column under its Better Auth
    -- name, not an additional column.
    name           text                                               not null,
    email          text                                               not null
        constraint users_email_uindex
            unique,
    email_verified boolean                  default false             not null,
    image          text,

    -- Columns the app owns. Better Auth ignores them unless they are also
    -- declared in `user.additionalFields` in auth.ts.
    nick_name      varchar,
    last_login     timestamp with time zone default now()             not null,
    hours_played   double precision         default 0                 not null,
    -- Signup inserts no user type, so the column needs a default of its own.
    id_user_type   integer                  default 1                 not null,
    tags           integer,
    is_active      boolean                  default true              not null,

    created_at     timestamp with time zone default now()             not null,
    updated_at     timestamp with time zone default now()             not null,

    -- Retired bigint surrogate key. Nothing populates it now that users is
    -- rebuilt empty, but schema.ts declares it, and Drizzle selects every
    -- declared column: drop it and every query on `user` fails.
    legacy_id_user bigint
);


-- ---------------------------------------------------------------------------
-- 3. Restore the referencing columns as uuid
-- ---------------------------------------------------------------------------

alter table characters
    add column if not exists id_user uuid;

alter table game_players
    add column if not exists id_user uuid not null;

alter table characters
    drop constraint if exists characters_users_id_user_fk;

alter table characters
    add constraint characters_users_id_user_fk
        foreign key (id_user) references users (id_user);

alter table game_players
    drop constraint if exists game_players_users_id_user_fk;

alter table game_players
    add constraint game_players_users_id_user_fk
        foreign key (id_user) references users (id_user);


-- ---------------------------------------------------------------------------
-- 4. Tables owned entirely by Better Auth
-- ---------------------------------------------------------------------------
-- All three are dropped in section 1, above, so that users can be dropped.

create table if not exists sessions
(
    id_session uuid                     default uuidv7()
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
    id_account               uuid                     default uuidv7()
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
    id_verification uuid                     default uuidv7()
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

-- migrate:down

