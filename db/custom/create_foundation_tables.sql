-- Foundation: the tables that predate dbmate.
--
-- These were created by hand before migrations existed, so the history could
-- not build a database from scratch -- create_auth_tables.sql alters
-- characters and game_players, which nothing created.
--
-- Captured from the live schema with pg_dump --schema-only. Dated ahead of
-- every other migration so a fresh database builds these first, and marked as
-- already applied on databases that predate it.
--
-- Foreign keys to users are deliberately absent: users does not exist at this
-- point, and create_auth_tables.sql rebuilds it and adds them.
--
-- Idempotent throughout, so it is safe even where the marker was not set:
-- tables and indexes use IF NOT EXISTS, and every constraint and identity
-- column is catalog-guarded.

-- --------------------------------------------------------------------------
-- _tables
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS _tables (
    _table_id integer NOT NULL,
    table_name text NOT NULL,
    s_status_workflow_ids integer[],
    needs_timestamps boolean DEFAULT false NOT NULL,
    has_timestamps boolean,
    needs_archival boolean DEFAULT false NOT NULL,
    has_archival boolean,
    needs_user_ids boolean DEFAULT false NOT NULL,
    has_user_ids boolean,
    id_is_uuid boolean DEFAULT false,
    foreign_key_dependencies text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    needs_fk_indexes boolean DEFAULT true,
    primary_key_dependants text[],
    search_field_name character varying,
    search_fields text[],
    kind_column text,
    kind_values text[],
    needs_activity_log boolean DEFAULT false NOT NULL,
    has_activity_log boolean DEFAULT false NOT NULL,
    needs_system_fields boolean DEFAULT false NOT NULL,
    has_system_fields boolean DEFAULT false NOT NULL,
    max_age text,
    cascade_delete boolean DEFAULT true NOT NULL,
    age_column text,
    death_condition text,
    last_culled timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS _tables__table_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE _tables__table_id_seq OWNED BY _tables._table_id;

ALTER TABLE _tables ALTER COLUMN _table_id SET DEFAULT nextval('_tables__table_id_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = '_tables_pkey'
                     AND conrelid = '_tables'::regclass) THEN
        ALTER TABLE _tables ADD CONSTRAINT _tables_pkey PRIMARY KEY (_table_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = '_tables_table_name_key'
                     AND conrelid = '_tables'::regclass) THEN
        ALTER TABLE _tables ADD CONSTRAINT _tables_table_name_key UNIQUE (table_name);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- _user_type
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS _user_type (
    id_user_type bigint NOT NULL,
    user_type_name character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    tags integer
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = '_user_type_pk'
                     AND conrelid = '_user_type'::regclass) THEN
        ALTER TABLE _user_type ADD CONSTRAINT _user_type_pk PRIMARY KEY (id_user_type);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- games
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS games (
    id_game integer NOT NULL,
    game_title character varying NOT NULL,
    hours_played double precision DEFAULT 0 NOT NULL,
    id_system integer,
    image_url text,
    id_user integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_played timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS games_id_game_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE games_id_game_seq OWNED BY games.id_game;

ALTER TABLE games ALTER COLUMN id_game SET DEFAULT nextval('games_id_game_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'games_pkey'
                     AND conrelid = 'games'::regclass) THEN
        ALTER TABLE games ADD CONSTRAINT games_pkey PRIMARY KEY (id_game);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- systems
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS systems (
    id_system integer NOT NULL,
    system_name character varying NOT NULL,
    system_version character varying,
    variant character varying
);

CREATE SEQUENCE IF NOT EXISTS systems_id_system_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE systems_id_system_seq OWNED BY systems.id_system;

ALTER TABLE systems ALTER COLUMN id_system SET DEFAULT nextval('systems_id_system_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'systems_pk'
                     AND conrelid = 'systems'::regclass) THEN
        ALTER TABLE systems ADD CONSTRAINT systems_pk PRIMARY KEY (id_system);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS systems_id_system_uindex ON systems USING btree (id_system);

-- --------------------------------------------------------------------------
-- decks
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS decks (
    id_deck bigint NOT NULL,
    deck_title character varying,
    deck_description text,
    id_deck_type bigint,
    back_image_url text
);

CREATE SEQUENCE IF NOT EXISTS decks_id_deck_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE decks_id_deck_seq OWNED BY decks.id_deck;

ALTER TABLE decks ALTER COLUMN id_deck SET DEFAULT nextval('decks_id_deck_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'decks_pkey'
                     AND conrelid = 'decks'::regclass) THEN
        ALTER TABLE decks ADD CONSTRAINT decks_pkey PRIMARY KEY (id_deck);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- deck_stocks
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deck_stocks (
    id_stock bigint NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS deck_stocks_id_stock_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE deck_stocks_id_stock_seq OWNED BY deck_stocks.id_stock;

ALTER TABLE deck_stocks ALTER COLUMN id_stock SET DEFAULT nextval('deck_stocks_id_stock_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'deck_stocks_pk'
                     AND conrelid = 'deck_stocks'::regclass) THEN
        ALTER TABLE deck_stocks ADD CONSTRAINT deck_stocks_pk PRIMARY KEY (id_stock);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- s_card_type
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS s_card_type (
    id_card_type bigint NOT NULL,
    type_title character varying,
    details character varying,
    tags character varying[]
);

CREATE SEQUENCE IF NOT EXISTS _card_type_id_card_type_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE _card_type_id_card_type_seq OWNED BY s_card_type.id_card_type;

ALTER TABLE s_card_type ALTER COLUMN id_card_type SET DEFAULT nextval('_card_type_id_card_type_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = '_card_type_pk'
                     AND conrelid = 's_card_type'::regclass) THEN
        ALTER TABLE s_card_type ADD CONSTRAINT _card_type_pk PRIMARY KEY (id_card_type);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- s_hand_types
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS s_hand_types (
    id_hand_type integer NOT NULL,
    type_title character varying,
    details character varying,
    tags character varying[],
    custom_properties jsonb
);

CREATE SEQUENCE IF NOT EXISTS _hand_types_id_hand_type_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE _hand_types_id_hand_type_seq OWNED BY s_hand_types.id_hand_type;

ALTER TABLE s_hand_types ALTER COLUMN id_hand_type SET DEFAULT nextval('_hand_types_id_hand_type_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = '_hand_types_pk'
                     AND conrelid = 's_hand_types'::regclass) THEN
        ALTER TABLE s_hand_types ADD CONSTRAINT _hand_types_pk PRIMARY KEY (id_hand_type);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- s_table_type
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS s_table_type (
    id_table_type integer NOT NULL,
    table_prefix character varying,
    needs_create boolean DEFAULT true NOT NULL,
    needs_update boolean DEFAULT true NOT NULL,
    needs_create_user boolean DEFAULT false NOT NULL,
    needs_update_user boolean DEFAULT false NOT NULL,
    description text
);

CREATE SEQUENCE IF NOT EXISTS s_table_type_id_table_type_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE s_table_type_id_table_type_seq OWNED BY s_table_type.id_table_type;

ALTER TABLE s_table_type ALTER COLUMN id_table_type SET DEFAULT nextval('s_table_type_id_table_type_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 's_table_type_pk'
                     AND conrelid = 's_table_type'::regclass) THEN
        ALTER TABLE s_table_type ADD CONSTRAINT s_table_type_pk PRIMARY KEY (id_table_type);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- s_tables
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS s_tables (
    id_tables bigint NOT NULL,
    table_name text NOT NULL,
    primary_key_column character varying,
    id_table_type bigint
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_attribute
                   WHERE attrelid = 's_tables'::regclass
                     AND attname = 'id_tables'
                     AND attidentity <> '') THEN
        ALTER TABLE s_tables ALTER COLUMN id_tables ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME s_tables_id_tables_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 's_tables_pk'
                     AND conrelid = 's_tables'::regclass) THEN
        ALTER TABLE s_tables ADD CONSTRAINT s_tables_pk PRIMARY KEY (id_tables);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 's_tables_s_table_type_id_table_type_fk'
                     AND conrelid = 's_tables'::regclass) THEN
        ALTER TABLE s_tables ADD CONSTRAINT s_tables_s_table_type_id_table_type_fk FOREIGN KEY (id_table_type) REFERENCES s_table_type(id_table_type);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- characters
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS characters (
    id_character integer NOT NULL,
    character_name character varying NOT NULL,
    chracter_description text,
    id_game bigint,
    id_user uuid
);

CREATE SEQUENCE IF NOT EXISTS characters_id_character_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE characters_id_character_seq OWNED BY characters.id_character;

ALTER TABLE characters ALTER COLUMN id_character SET DEFAULT nextval('characters_id_character_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'characters_pk'
                     AND conrelid = 'characters'::regclass) THEN
        ALTER TABLE characters ADD CONSTRAINT characters_pk PRIMARY KEY (id_character);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'characters_games_id_game_fk'
                     AND conrelid = 'characters'::regclass) THEN
        ALTER TABLE characters ADD CONSTRAINT characters_games_id_game_fk FOREIGN KEY (id_game) REFERENCES games(id_game);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- game_players
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS game_players (
    id_game_player integer NOT NULL,
    id_game bigint NOT NULL,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    hours_played double precision,
    id_character bigint,
    id_user uuid NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS game_players_id_game_player_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE game_players_id_game_player_seq OWNED BY game_players.id_game_player;

ALTER TABLE game_players ALTER COLUMN id_game_player SET DEFAULT nextval('game_players_id_game_player_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'game_players_pk'
                     AND conrelid = 'game_players'::regclass) THEN
        ALTER TABLE game_players ADD CONSTRAINT game_players_pk PRIMARY KEY (id_game_player);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'game_players_games_id_game_fk'
                     AND conrelid = 'game_players'::regclass) THEN
        ALTER TABLE game_players ADD CONSTRAINT game_players_games_id_game_fk FOREIGN KEY (id_game) REFERENCES games(id_game);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- hands
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hands (
    id_hand integer NOT NULL,
    hand_title character varying NOT NULL,
    hand_state character varying,
    id_hand_state bigint,
    orientation character varying,
    display_order integer DEFAULT 0 NOT NULL,
    id_hand_type bigint,
    is_addable boolean DEFAULT false NOT NULL,
    id_character bigint,
    id_game bigint
);

CREATE SEQUENCE IF NOT EXISTS hands_id_hand_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE hands_id_hand_seq OWNED BY hands.id_hand;

ALTER TABLE hands ALTER COLUMN id_hand SET DEFAULT nextval('hands_id_hand_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'hands_pk'
                     AND conrelid = 'hands'::regclass) THEN
        ALTER TABLE hands ADD CONSTRAINT hands_pk PRIMARY KEY (id_hand);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'hands__hand_types_id_hand_type_fk'
                     AND conrelid = 'hands'::regclass) THEN
        ALTER TABLE hands ADD CONSTRAINT hands__hand_types_id_hand_type_fk FOREIGN KEY (id_hand_type) REFERENCES s_hand_types(id_hand_type);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'hands_characters_id_character_fk'
                     AND conrelid = 'hands'::regclass) THEN
        ALTER TABLE hands ADD CONSTRAINT hands_characters_id_character_fk FOREIGN KEY (id_character) REFERENCES characters(id_character);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'hands_games_id_game_fk'
                     AND conrelid = 'hands'::regclass) THEN
        ALTER TABLE hands ADD CONSTRAINT hands_games_id_game_fk FOREIGN KEY (id_game) REFERENCES games(id_game);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- cards
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cards (
    id_card bigint NOT NULL,
    card_title character varying,
    card_type character varying,
    description character varying,
    tags character varying[],
    pool_int integer,
    current_int integer,
    die_roll character varying,
    custom_properties jsonb,
    sort_order integer,
    face_image_url character varying,
    id_hand bigint,
    id_card_type integer,
    is_tappable boolean DEFAULT false NOT NULL,
    is_selectable boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS cards_id_card_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE cards_id_card_seq OWNED BY cards.id_card;

ALTER TABLE cards ALTER COLUMN id_card SET DEFAULT nextval('cards_id_card_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'cards_pk'
                     AND conrelid = 'cards'::regclass) THEN
        ALTER TABLE cards ADD CONSTRAINT cards_pk PRIMARY KEY (id_card);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'cards__card_type_id_card_type_fk'
                     AND conrelid = 'cards'::regclass) THEN
        ALTER TABLE cards ADD CONSTRAINT cards__card_type_id_card_type_fk FOREIGN KEY (id_card_type) REFERENCES s_card_type(id_card_type);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'cards_hands_id_hand_fk'
                     AND conrelid = 'cards'::regclass) THEN
        ALTER TABLE cards ADD CONSTRAINT cards_hands_id_hand_fk FOREIGN KEY (id_hand) REFERENCES hands(id_hand);
    END IF;
END $$;

