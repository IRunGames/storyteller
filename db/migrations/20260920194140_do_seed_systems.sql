-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM systems WHERE id_system < 0;

    RAISE NOTICE '+++    [%] Seeding systems', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `systems`: 100 currently prominent tabletop roleplaying
    -- game systems, ordered roughly by present-day popularity, followed by
    -- the remaining editions and lines on the shelf (iCloud Books-RPG).
    --
    -- Seeded rows use negative ids so they never collide with rows the app
    -- creates from the sequence. The wrapping migration deletes only the
    -- negative-id rows before re-inserting, so user-created systems survive
    -- a re-seed.
    --
    -- Columns:
    --   system_name    the ruleset as it is sold and spoken of at the table
    --   system_version the edition / revision of that ruleset (NULL when the
    --                  game has only ever had one)
    --   variant        a setting or product line that runs on that ruleset
    --                  (Numenera on Cypher, Trail of Cthulhu on GUMSHOE, ...);
    --                  NULL for the plain core rules
    --
    -- Sources (September 2026): ScriptoriumGM "Most Popular TTRPG Systems in
    -- 2026", Foundry VTT year-in-review install share, Gen Con 2026 event
    -- counts, 2026 ENNIE winners, Wargamer "Best tabletop RPGs 2026".
    INSERT INTO systems (id_system, system_name, system_version, variant)
    VALUES
        -- ---- the big table --------------------------------------------------
        (  -1, 'Dungeons & Dragons',                    '5e',                     '2024 Revised'),
        (  -2, 'Dungeons & Dragons',                    '5e',                     '2014'),
        (  -3, 'Pathfinder',                            '2e',                     'Remaster'),
        (  -4, 'Call of Cthulhu',                       '7e',                     NULL),
        (  -5, 'Call of Cthulhu',                       '7e',                     'Pulp Cthulhu'),
        (  -6, 'Daggerheart',                           '1e',                     NULL),
        (  -7, 'Starfinder',                            '2e',                     NULL),
        (  -8, 'Blades in the Dark',                    '1e',                     NULL),
        (  -9, 'Shadowdark',                            '1e',                     NULL),
        ( -10, 'World of Darkness',                     '5e',                     'Vampire: The Masquerade'),
        ( -11, 'World of Darkness',                     '5e',                     'Werewolf: The Apocalypse'),
        ( -12, 'World of Darkness',                     '5e',                     'Hunter: The Reckoning'),
        ( -13, 'Cosmere Roleplaying Game',              '1e',                     'Stormlight'),
        ( -14, 'Pathfinder',                            '1e',                     NULL),
        ( -15, 'Old-School Essentials',                 'Advanced Fantasy',       NULL),
        ( -16, 'Dungeon Crawl Classics',                '1e',                     NULL),
        ( -17, 'Dolmenwood',                            '1e',                     NULL),
        ( -18, 'Draw Steel',                            '1e',                     NULL),
        ( -19, 'Dragonbane',                            '1e',                     NULL),
        ( -20, 'Fabula Ultima',                         '1e',                     NULL),
        ( -21, 'Mörk Borg',                             '1e',                     NULL),
        ( -22, 'Mothership',                            '1e',                     NULL),
        ( -23, 'Legend in the Mist',                    '1e',                     NULL),
        ( -24, 'City of Mist',                          '1e',                     NULL),
        -- ---- Cypher System family (Monte Cook Games) -------------------------
        ( -25, 'Cypher System',                         'Revised',                NULL),
        ( -26, 'Cypher System',                         'Revised',                'Numenera'),
        ( -27, 'Cypher System',                         'Revised',                'The Strange'),
        ( -28, 'Cypher System',                         'Revised',                'Old Gods of Appalachia'),
        ( -29, 'Cypher System',                         'Revised',                'The Magnus Archives'),
        ( -30, 'Cypher System',                         'Revised',                'Gods of the Fall'),
        ( -31, 'Cypher System',                         'Revised',                'Predation'),
        ( -32, 'Cypher System',                         'Revised',                'Unmasked'),
        ( -33, 'Cypher System',                         'Revised',                'Claim the Sky'),
        ( -34, 'Invisible Sun',                         '1e',                     NULL),
        ( -35, 'Stealing Stories for the Devil',        '1e',                     NULL),
        -- ---- cyberpunk, science fiction, licensed ----------------------------
        ( -36, 'Shadowrun',                             '6e',                     NULL),
        ( -37, 'Shadowrun',                             '5e',                     NULL),
        ( -38, 'Cyberpunk RED',                         '1e',                     NULL),
        ( -39, 'Star Wars Roleplaying Game',            'FFG / Edge Studio',      NULL),
        ( -40, 'Genesys',                               '1e',                     NULL),
        ( -41, 'Warhammer 40,000: Wrath & Glory',       'Revised',                NULL),
        ( -42, 'Warhammer 40,000: Imperium Maledictum', '1e',                     NULL),
        ( -43, 'Warhammer Fantasy Roleplay',            '4e',                     NULL),
        ( -44, 'Alien',                                 'Evolved Edition',        NULL),
        ( -45, 'Tales from the Loop',                   '1e',                     NULL),
        ( -46, 'Forbidden Lands',                       '1e',                     NULL),
        ( -47, 'Vaesen',                                '1e',                     NULL),
        ( -48, 'Blade Runner',                          '1e',                     NULL),
        ( -49, 'The One Ring',                          '2e',                     NULL),
        ( -50, 'Lancer',                                '1e',                     NULL),
        ( -51, 'Traveller',                             'Mongoose 2e (2022)',     NULL),
        ( -52, 'Eclipse Phase',                         '2e',                     NULL),
        ( -53, 'Star Trek Adventures',                  '2e',                     NULL),
        ( -54, 'Dune: Adventures in the Imperium',      '1e',                     NULL),
        ( -55, 'Fallout',                               '2d20',                   NULL),
        ( -56, 'Marvel Multiverse Role-Playing Game',   '1e',                     NULL),
        -- ---- horror and investigation ----------------------------------------
        ( -57, 'Delta Green',                           'Handler''s Guide',       NULL),
        ( -58, 'Kult: Divinity Lost',                   '4e',                     NULL),
        ( -59, 'GUMSHOE',                               NULL,                     'Trail of Cthulhu'),
        ( -60, 'GUMSHOE',                               NULL,                     'Night''s Black Agents'),
        ( -61, 'GUMSHOE',                               NULL,                     'The Yellow King'),
        ( -62, 'GUMSHOE',                               NULL,                     'The Esoterrorists'),
        ( -63, 'GUMSHOE',                               NULL,                     'Fear Itself'),
        ( -64, 'Ten Candles',                           '1e',                     NULL),
        ( -65, 'Candela Obscura',                       '1e',                     NULL),
        ( -66, 'Dread',                                 '1e',                     NULL),
        ( -67, 'Chronicles of Darkness',                '2e',                     NULL),
        -- ---- d100 / Chaosium lineage -----------------------------------------
        ( -68, 'RuneQuest',                             'Roleplaying in Glorantha', NULL),
        ( -69, 'Pendragon',                             '6e',                     NULL),
        ( -70, 'Basic Roleplaying',                     'Universal Game Engine',  NULL),
        ( -71, 'Mythras',                               '1e',                     NULL),
        -- ---- generic engines -------------------------------------------------
        ( -72, 'Savage Worlds',                         'Adventure Edition',      NULL),
        ( -73, 'Fate',                                  'Core',                   NULL),
        ( -74, 'Fate',                                  'Accelerated',            NULL),
        ( -75, 'Fate',                                  'Condensed',              NULL),
        ( -76, 'GURPS',                                 '4e',                     NULL),
        ( -77, 'Mutants & Masterminds',                 '3e',                     NULL),
        ( -78, 'Coyote & Crow',                         '1e',                     NULL),
        -- ---- old school and its descendants ----------------------------------
        ( -79, 'Advanced Dungeons & Dragons',           '2e',                     NULL),
        ( -80, 'Dungeons & Dragons',                    '3.5e',                   NULL),
        ( -81, 'Cairn',                                 '2e',                     NULL),
        ( -82, 'Knave',                                 '2e',                     NULL),
        ( -83, 'Mausritter',                            '1e',                     NULL),
        ( -84, 'Worlds Without Number',                 'Revised',                NULL),
        ( -85, 'Stars Without Number',                  'Revised',                NULL),
        ( -86, 'Swords & Wizardry',                     'Complete Revised',       NULL),
        ( -87, '13th Age',                              '2e',                     NULL),
        ( -88, 'Rolemaster',                            'Unified',                NULL),
        ( -89, 'Rolemaster',                            'Standard System',        NULL),
        ( -90, 'Palladium Fantasy Role-Playing Game',   '2e',                     NULL),
        -- ---- story games and Powered by the Apocalypse -----------------------
        ( -91, 'Apocalypse World',                      '2e',                     NULL),
        ( -92, 'Dungeon World',                         '1e',                     NULL),
        ( -93, 'Monster of the Week',                   'Revised',                NULL),
        ( -94, 'Masks: A New Generation',               '1e',                     NULL),
        ( -95, 'Ironsworn',                             'Starforged',             NULL),
        ( -96, 'DramaSystem',                           '1e',                     'Hillfolk'),
        -- ---- Onyx Path and other lines on the shelf --------------------------
        ( -97, 'Exalted',                               '3e',                     NULL),
        ( -98, 'Exalted',                               'Essence',                NULL),
        ( -99, 'Scion',                                 '2e',                     NULL),
        (-100, 'Ars Magica',                            'Definitive Edition',     NULL),
        -- ---- the rest of the shelf: older editions and small-press games -----
        (-101, 'Call of Cthulhu',                       '6e',                     NULL),
        (-102, 'Exalted',                               '2e',                     NULL),
        (-103, 'Palladium Fantasy Role-Playing Game',   '1e',                     NULL),
        (-104, 'Rolemaster',                            'Fantasy Role Playing',   NULL),
        (-105, 'Middle-earth Role Playing',             '2e',                     NULL),
        (-106, 'Against the Darkmaster',                '1e',                     NULL),
        (-107, 'Emissary',                              '1e',                     NULL),
        (-108, 'Queerz!',                               '1e',                     NULL),
        (-109, 'Beak, Feather & Bone',                  '1e',                     NULL),
        (-110, 'Claw Atlas',                            '1e',                     NULL),
        (-111, 'Cypher System',                         'Revised',                'Path of the Planebreaker'),
        (-112, 'Fate',                                  'Core',                   'Fate of Cthulhu'),
        (-113, 'Fate',                                  'Core',                   'Tachyon Squadron'),
        (-114, 'Fate',                                  'Core',                   'Shadow of the Century'),
        (-115, 'Fate',                                  'Accelerated',            'Young Centurions'),
        (-116, 'HOUNDs',                                '1e',                     NULL),
        (-117, 'Dating Sim',                            '1e',                     NULL),
        (-118, 'Grandpa''s Farm',                       '1e',                     NULL),
        (-119, 'Scene Thieves',                         '1e',                     NULL),
        (-120, 'Single Unique Power',                   '1e',                     NULL),
        (-121, 'Wishless',                              '1e',                     NULL);
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

