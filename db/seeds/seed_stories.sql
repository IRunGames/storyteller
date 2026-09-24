    -- Seed data for `stories`: the campaigns listed under the Stories menu of
    -- https://rpg.irun.games, owned by the storyteller@irun.games user, plus
    -- fixture stories (-15 onward) owned by the users in db/seeds/seed_users.sql,
    -- so that seed must run first too. Who plays in those is in
    -- db/seeds/seed_story_players.sql.
    --
    -- Rows follow the menu order. Index pages that merely group campaigns
    -- (Old Gods of Appalachia, Exalted, Invisible Sun, Numenera) become
    -- id_system links on their child campaigns rather than stories of their
    -- own. "Contact Me", the "Backfeed" feedback form and the character
    -- creation pages are not stories and are left out.
    --
    -- id_system points at db/seeds/seed_systems.sql, so that seed must run
    -- first. Campaigns whose page names no ruleset (Something Wicked, A Time
    -- for Masks, Kaliphate, Psychoneira, True Sight) and Resurrection (WY),
    -- which runs on the homebrew "Twilight Soldiers", carry NULL.
    --
    -- last_played is the date of the last episode the site records; stories
    -- with no dated episodes keep the column default. hours_played assumes
    -- three hours per recorded episode (The Devil's Spine states 6:30–9:30
    -- sessions) and is 0 where the site records none. is_active is false
    -- for campaigns whose last episode is years old.
    --
    -- image_url values under /_astro/ are content-hashed by the site build
    -- and will change when the site is rebuilt; the /images/ ones are stable.
    --
    -- summary is one to three sentences taken from each campaign's page on
    -- the site. is_looking_for_players is true for three of the Hogwarts
    -- stories (-17, -19, -20) so the Stories page has something to advertise.
    INSERT INTO stories (id_story, title, id_system, image_url, summary, hours_played, is_active, is_looking_for_players,
                       last_played, id_created_by_user, id_updated_by_user)
    VALUES
        ( -1, 'Something Wicked',      NULL, 'https://rpg.irun.games/_astro/something-wicked.BDFq7VyR_2qTJPB.webp',
          'A magical gothic horror campaign. Each character has glimpsed the supernatural and been irrevocably changed by it, and is defined by the power they acquired, the price they paid, the curse they carry, their secrets, their calling, their closest companion and the places that matter to them.',
          0, true,  false, DEFAULT,            '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Old Gods of Appalachia (Cypher System)
        ( -2, 'Down in Adder''s Hollow', -28, NULL,
          'A mysterious affliction strikes an Appalachian community, and the residents turn to the estranged healer Ma Nettles to find out what is behind the strange occurrences.',
          0, true,  false, DEFAULT,            '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -3, 'Last Train Out',         -28, 'https://rpg.irun.games/_astro/lto.D2boiODh_kSUkl.webp',
          'A group of Appalachian investigators boards the 7am train out of Asheville to uncover the mystery behind a string of disappearances tied to a suspicious rail line.',
          0, true,  false, DEFAULT,            '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Exalted
        ( -4, 'The Endless Caravan',   -102, 'https://rpg.irun.games/_astro/Caravan.CzLLI-AL_2bqp8z.webp',
          'A Night Guard is hired to protect the Endless Caravan on its dangerous passage across the grasslands of the Green Sea, in a loose take on the Exalted setting.',
          0, true,  false, DEFAULT,            '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -5, 'In the Eye Of...',       -97, 'https://rpg.irun.games/images/exalted/in-the-eye-of/starfall.jpg',
          'Solar Exalted, newly awakened to their power, join the mysterious Night Driver aboard his black ship and sail into the dangerous West to confront an ancient darkness he believed sealed away.',
          0, true,  false, DEFAULT,            '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -6, 'A Time for Masks',      NULL, 'https://rpg.irun.games/images/a-time-for-masks/40337142-0b5d-472b-908e-43fb64ee1cb8.jpg',
          'In a Victorian world, each player character has mysteriously crafted a magical mask that grants extraordinary powers. They begin using the masks to right wrongs, and meet unexpected resistance from forces unknown.',
          0, true,  false, DEFAULT,            '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Invisible Sun
        ( -7, 'Embers Leap',            -34, 'https://rpg.irun.games/images/invisible-sun/embers-leap/InvisibleSunLogo.jpg',
          'Fellow escapees from the Gray gather at Apostate Imbir''s gala in Satyrine to celebrate Imbolc and to take up matters that will shape the city''s future.',
          18, false, false, '2019-01-07',  '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -8, 'Kaliphate',             NULL, NULL,
          'Under the god Baruk''s guidance the aging Kaliph has brought peace and prosperity to the Isthmus and its neighbours. Now he is dying, his young successor is largely unknown, and the factions are positioning themselves. Players take the side of the Prince''s allies or the Kaliph''s old guard.',
          0, true,  false, DEFAULT,            '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -9, 'Resurrection (WY)',     NULL, NULL,
          'Wyoming, 1844. Visions of divine fire have called a group of supernaturally gifted people to a town where Millerite believers await the prophesied return of Christ. Their gifts are rooted in virtue and personal tragedy, and the townsfolk and the apocalyptic newcomers are on a collision course.',
          0, false, false, '2018-01-08',  '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-10, 'Psychoneira',           NULL, 'https://rpg.irun.games/images/psychoneira/psychoneira.jpg',
          'The Sacramento Valley Psychiatric Sleep Disorder Clinic, run by the SimpleCommunion Institute, treats people whose impossible dreams and visions have begun to intrude on waking life. The players are its patients, and the staff may help them find the truth or keep them from it.',
          0, true,  false, DEFAULT,            '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-11, 'True Sight',            NULL, 'https://rpg.irun.games/images/true-sight/5376500817_f27ae1c0ef_z-300x300.jpg',
          'A Witch Hunter and his Elven wife arrive at a remote northern fort, where the Great Plains end and the Dark Trees begin, to investigate disappearances and a woman found ritually murdered among the gardens. The Hunter, the Healer, the Hound, the Captain and the Stalker follow the trail.',
          33, false, false, '2013-09-26',  '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Numenera (Cypher System)
        (-12, 'Amber Spires',           -26, 'https://rpg.irun.games/images/numenera/amber-spires/Parc-guell-spires-1024x768.jpg',
          'In the city of Spires the characters serve the Amber Papacy, and Cardinal R''zak has a mission for them.',
          3, false, false, '2014-03-24',  '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-13, 'The Devil''s Spine',     -26, NULL,
          'Baron Tichronius marches to war against the Gaian Heresy and hires the characters to manage his estate at Uxphon in his absence. What begins as stewardship grows into a sprawling adventure of disappearances, ancient mysteries and the strange forces of the Ninth World.',
          99, false, false, '2015-06-25',  '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-14, 'Silent Running',         -26, 'https://rpg.irun.games/images/numenera/silent-running/Screenshot-2024-01-27-at-11.58.39-1.png',
          'When winter lifts, no word comes from the mountain city of Pesht. Skilled adventurers are hired to climb up and find out why it has fallen silent.',
          9, false, false, '2013-06-10',  '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- Fixture stories owned by the seed users (no site page, so no image or summary)
        (-15, 'Vampire',               -10, NULL,
          NULL,
          0, true,  false, DEFAULT,            '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000001'),
        (-16, 'D&D 5e',                 -2, NULL,
          NULL,
          0, false, false, DEFAULT,            '00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000002'),
        -- Hogwarts staff stories: each staff member runs a different system.
        -- Covers are 1920px renditions of Wikimedia Commons photos (CC BY 2.0
        -- and CC BY-SA, attribution on each file's Commons page): the castle
        -- model, the Great Hall, Diagon Alley and Hagrid's hut at the Warner
        -- Bros studio tour, and the Glenfinnan Viaduct of the Hogwarts Express.
        (-17, 'The Order of the Phoenix',    -69, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Hogwarts_Castle_Model_%2840395351793%29.jpg/1920px-Hogwarts_Castle_Model_%2840395351793%29.jpg',
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000003'),
        (-18, 'The Chamber Below',            -4, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/Hogwart%E2%80%98s_Great_Hall%2C_Warner_Bros_Harry_Potter_Studio%2C_London_01.jpg/1920px-Hogwart%E2%80%98s_Great_Hall%2C_Warner_Bros_Harry_Potter_Studio%2C_London_01.jpg',
          NULL,
          0, true,  false, DEFAULT,            '00000000-0000-7000-8000-000000000004', '00000000-0000-7000-8000-000000000004'),
        (-19, 'Knockturn Alley',              -8, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/Diagon_Alley_%2846637637464%29.jpg/1920px-Diagon_Alley_%2846637637464%29.jpg',
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000005', '00000000-0000-7000-8000-000000000005'),
        (-20, 'Into the Forbidden Forest',   -19, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/Hagrids_Hut_%286973088454%29.jpg/1920px-Hagrids_Hut_%286973088454%29.jpg',
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000006', '00000000-0000-7000-8000-000000000006'),
        (-21, 'Beneath the Floorboards',     -83, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/17/Glenfinnan_Viaduct.jpg/1920px-Glenfinnan_Viaduct.jpg',
          NULL,
          0, true,  false, DEFAULT,            '00000000-0000-7000-8000-000000000007', '00000000-0000-7000-8000-000000000007');
