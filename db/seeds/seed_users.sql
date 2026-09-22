    -- Seed data for `users`: fixture people to play alongside the signed-in
    -- storyteller@irun.games account, so the Stories page has games owned by,
    -- and played with, someone else.
    --
    -- The primary key is a uuidv7, so the "negative id" seed convention cannot
    -- apply; the rows use fixed, obviously synthetic version-7 UUIDs in the
    -- 00000000-0000-7000-8000-… range instead. db/seeds/seed_games.sql and
    -- db/seeds/seed_game_players.sql reference these ids, so this seed must run
    -- before both.
    --
    -- The emails are placeholders under example.com: these users have no
    -- accounts row, so they cannot sign in. Users who run a game are Unpaid
    -- Storytellers (-2); the rest are Unpaid Players (-1). Everything else
    -- keeps the column default.
    --
    -- …001 and …002 are two friends of the storyteller. …003 to …017 are the
    -- Hogwarts cast: five staff, who each run a game, and ten students.
    INSERT INTO users (id_user, name, nick_name, email, id_user_type)
    VALUES
        ('00000000-0000-7000-8000-000000000001', 'PalmDave Quist',     'PalmDave',  'palmdave.quist@example.com',     -2),
        ('00000000-0000-7000-8000-000000000002', 'PaulKhash Manian',   'PaulKhash', 'paulkhash.manian@example.com',   -2),
        -- Hogwarts staff
        ('00000000-0000-7000-8000-000000000003', 'Albus Dumbledore',   'Albus',     'albus.dumbledore@example.com',   -2),
        ('00000000-0000-7000-8000-000000000004', 'Minerva McGonagall', 'Minerva',   'minerva.mcgonagall@example.com', -2),
        ('00000000-0000-7000-8000-000000000005', 'Severus Snape',      'Severus',   'severus.snape@example.com',      -2),
        ('00000000-0000-7000-8000-000000000006', 'Rubeus Hagrid',      'Hagrid',    'rubeus.hagrid@example.com',      -2),
        ('00000000-0000-7000-8000-000000000007', 'Filius Flitwick',    'Filius',    'filius.flitwick@example.com',    -2),
        -- Hogwarts students
        ('00000000-0000-7000-8000-000000000008', 'Harry Potter',       'Harry',     'harry.potter@example.com',       -1),
        ('00000000-0000-7000-8000-000000000009', 'Hermione Granger',   'Hermione',  'hermione.granger@example.com',   -1),
        ('00000000-0000-7000-8000-000000000010', 'Ron Weasley',        'Ron',       'ron.weasley@example.com',        -1),
        ('00000000-0000-7000-8000-000000000011', 'Neville Longbottom', 'Neville',   'neville.longbottom@example.com', -1),
        ('00000000-0000-7000-8000-000000000012', 'Luna Lovegood',      'Luna',      'luna.lovegood@example.com',      -1),
        ('00000000-0000-7000-8000-000000000013', 'Ginny Weasley',      'Ginny',     'ginny.weasley@example.com',      -1),
        ('00000000-0000-7000-8000-000000000014', 'Draco Malfoy',       'Draco',     'draco.malfoy@example.com',       -1),
        ('00000000-0000-7000-8000-000000000015', 'Cho Chang',          'Cho',       'cho.chang@example.com',          -1),
        ('00000000-0000-7000-8000-000000000016', 'Cedric Diggory',     'Cedric',    'cedric.diggory@example.com',     -1),
        ('00000000-0000-7000-8000-000000000017', 'Seamus Finnigan',    'Seamus',    'seamus.finnigan@example.com',    -1);
