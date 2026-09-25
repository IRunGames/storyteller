-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM story_sessions WHERE id_story_session < 0;

    RAISE NOTICE '+++    [%] Seeding story_sessions', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `story_sessions`: the three recorded sittings of Something
    -- Wicked (id_story -1 in db/seeds/seed_stories.sql, owned by the
    -- storyteller@irun.games account), which the site writes up as An Eastern
    -- King, episodes 1 to 3. Each ran on a Saturday, a fortnight apart, from
    -- ten in the morning to six in the evening Pacific time, with a lunch pause
    -- of between three quarters of an hour and an hour and a half around
    -- noon; the write-ups went online a few days after each.
    --
    -- The seed runs with triggers off, so the workflow timestamps, paused_time
    -- and the audit columns are written here as the triggers would have left
    -- them: created_at is open_at, since a row is created as its session
    -- opens, and updated_at is done_at. length is generated from them.
    -- activity_log keeps its empty default: the transition trigger's entries
    -- carry generated ids and the database role, and nothing reads them yet.
    --
    -- title is each write-up's title less its episode number. id_users is the
    -- three players seated on the story in db/seeds/seed_story_players.sql,
    -- who all came to every session, as the write-ups list the same company
    -- each time; that seed must run first.
    --
    -- summary, notes and lingering_questions are drawn from the write-ups;
    -- image_link is each post's hero image and link the post itself. The
    -- /_astro/ image paths are content-hashed by the site build and will
    -- change when the site is rebuilt, as db/seeds/seed_stories.sql notes.
    --
    -- The story's last_played and hours_played follow its sessions, and the
    -- stories seed set them from the site before these episodes existed; the
    -- update below brings them in step rather than re-running that seed. It
    -- comes first so the row count reported at the end is the sessions'.
    UPDATE stories
    SET last_played  = '2026-09-12 18:00:00-07',
        hours_played = 20.5,
        updated_at   = NOW()
    WHERE id_story = -1;

    INSERT INTO story_sessions (id_story_session, id_story, status, title,
                                id_users,
                                open_at, suspended_at, resumed_at, done_at, paused_time,
                                link,
                                image_link,
                                summary,
                                notes,
                                lingering_questions,
                                created_at, updated_at, id_created_by_user, id_updated_by_user)
    VALUES
        (-1, -1, 'done', 'Wayfinding',
         ARRAY['00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000017']::uuid[],
         '2026-08-15 10:00:00-07', '2026-08-15 12:05:00-07', '2026-08-15 13:22:00-07', '2026-08-15 18:00:00-07', '77 minutes',
         'https://rpg.irun.games/blog/an-eastern-king-episode-1/',
         'https://rpg.irun.games/_astro/dun-acyl.BGOlVFjn_1MpSVf.webp',
         'The heroes slogged two days through the Storm Queen''s rant on the last eastern roads and walked the night out to reach Dun Acyl under a scattering sky. Expected there, they were fed and rested by House Daear, then drawn into tense talk when the Magebreaker Gabhain and his enslaved P''ntri pathfinder Soo arrived up from the Godswood. They left with the blessing of House Daear, two asses on loan and a token for Lord Balwen of Dun Dwym, and took the old highway straight across the bog rather than the southern road the Magebreaker warned them toward.',
         'Company: Dinl-Chi (free Vulfen), Padraig (the witch-boy), Siúlóir (weathered, watchful).
Ewen of House Daear, called Badger: young, wind-burnt, gold twisted into his hair, works the palisade himself. Delivered the House''s direct blessing to the company all unwitting.
Hwn, Speaker of Solas: haloed Siar of the Day House, pale stone on a cord at his throat. Gave Siúlóir a samite bag with cloth of gold carrying seeds of some kind.
Ewen loaned two asses and a token to hand over with one ass''s goods to Lord Balwen of Dun Dwym, rumoured stubborn and difficult.
Gabhain, Magebreaker in red and tan, broken-branches gold at the shoulder, with Soo, an enslaved P''ntri who speaks to him as an equal. Trailing one or more sorcerers from the High Kingdom; says something foul woke a Builder Structure near the Godswood, with the Night Lodge Gods implied in its waking.
Night on the Eastern Wet: camp on the oak, ash and buckthorn hill above a clean spring. Padraig drew Dolain''s protection down over the camp with powdered carnelian.
Ended with Siúlóir awake to a strange light in the trees, a beautiful voice over the bog, and a score of raptors gathered round the seed pouch lifted from his pockets, a massive eagle eating from it.',
         'Why was the company expected at Dun Acyl, and by whom?
What are the seeds Hwn gave Siúlóir, and why him?
Was the Magebreaker''s warning against the bog road advice or a lure?
What woke the Builder Structure near the Godswood, and what do the Night Lodge Gods want with it?
Who is singing in the trees, and what is the light?',
         '2026-08-15 10:00:00-07', '2026-08-15 18:00:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-2, -1, 'done', 'Bog and River',
         ARRAY['00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000017']::uuid[],
         '2026-08-29 10:00:00-07', '2026-08-29 11:50:00-07', '2026-08-29 12:38:00-07', '2026-08-29 18:00:00-07', '48 minutes',
         'https://rpg.irun.games/blog/an-eastern-king-episode-2/',
         'https://rpg.irun.games/_astro/dark-bog.BnOcZFfu_Z1vDcI6.webp',
         'Woken by the Morning Singer, a Bright One gathering the raptors of the bog to carry them to her summer groves before something comes, the company refused her shortcut and followed the old highway out of the Eastern Wet. They passed three farmers carrying wicker cages of things that were not ravens, and an old woman under a willow asking after her missing grandchildren. Mist met them on the greenway to the Godsflood; they found the ferryman drowned dry on his own boat and fought off a Mistling, which Dinl-Chi tore apart with the earth-fire of his roar. Across the river at Dun Dwym they were questioned by Queen Aia, smothered in courtesies by King Glenys, and feasted.',
         'The Morning Singer: a Bright One out of the oak, ash and thorn, pointed ears through leaves and feathers, gold at her throat, small birds on her shoulders. Conspiring with Gaer, queen of the heavens, to move the raptors to her summer groves before whatever is coming. Offered a shortcut beyond the wood; declined.
Three farmers on the old highway in undyed wool and dark kilts, each with a wicker cage held out at the chest; the birds inside did not look like ravens. The company told them only that the Singer was at the spring.
An old woman beneath a weeping willow in layers of loose-spun wool asked them to find her missing grandchildren. They declined, burdened with purpose. Nobody can now recall her clearly.
The Mist came up the river from Dun Dwym, against the current. Padraig''s footsteps, swirling faintly with light, held the way through it.
The ferryman lay drowned on the ferry with no sign of the river on him. The Mistling: a man-shape of water with river grass and wood floating in it, burbling like a drowning man. It went for Padraig first.
Dinl-Chi''s roar is the hot wind of the earth''s fire, serpentine in the body first. It dismantled the Mistling into the river.
Dun Dwym: stairs cut into the rock circle, guards, an empty old dun building for the company. Queen Aia interrogated them. King Glenys is all High Kingdom courtier politeness, nothing like the fearsome Balwen kings of rumour.',
         'What is coming to the bog that the birds must be carried away from, and what would the Singer''s shortcut have cost?
What was in the farmers'' cages, and where were they taking it?
Whose grandchildren went missing, and why can no one remember the woman under the willow?
Was the ferryman killed on purpose, and are there more Mistlings in the Godsflood?
Why does the King of Dun Dwym speak like a courtier of the Throne of Bone?',
         '2026-08-29 10:00:00-07', '2026-08-29 18:00:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-3, -1, 'done', 'Kildealg',
         ARRAY['00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000017']::uuid[],
         '2026-09-12 10:00:00-07', '2026-09-12 12:15:00-07', '2026-09-12 13:40:00-07', '2026-09-12 18:00:00-07', '85 minutes',
         'https://rpg.irun.games/blog/an-eastern-king-episode-3/',
         'https://rpg.irun.games/_astro/kildealg.oS5ci0KU_p2HGI.webp',
         'Morning at Dun Dwym brought strangers: the marked wizard Dirdenach and his man Chúl, there to trade pine for the Balwens'' white oak, and Dafydd the shell-and-pearl seller, whom the wizard simply called the spy. King Glenys had ridden out hunting before dawn with only his huntsman Llan, to the plain unease of Hugh, the Sword of Balwen. The company crossed the rope bridge into Kildealg, the Blackthorn Wood, followed a trail of two men and a pig that turned to blood, and were signalled clear of a nightmare in a grove of ancient oaks by the P''ntri Of the Eye. In a sunlit clearing they found the elder Of the Tree tending the maimed Llan beside an awakened Builder arch, and when Siúlóir stepped through it to bring the king back, both were flung out again, Glenys'' burning silver blade searing into a boulder and the king lying silent.',
         'Dirdenach, the marked wizard: dense black rule-work and sigils inked over brow, cheeks, throat and chest, a wheel between green eyes, under an embroidered hood. Chúl: bald, bare to the waist, wiry, long grey beard, a blue rune over his heart, felling axe across his shoulder. Their story is timber: pine off an estate on the north shore of the Mwrost for the stout white oak the Balwens nurture in Kildealg.
Dafydd: shell and pearl seller, grey-streaked hair, pale eyes in a dirty face, heaps of ragged sand-coloured wool; nowhere near the sea lately. Dirdenach called him the spy to their faces.
Hugh, the Sword of Balwen: scarred brow and cheek with some cuts still fresh, gold in one ear, dulled scale, hands folded on an upright blade. Uneasy about the hunt before any news came.
Dinl-Chi''s roar parted the mist on the rope bridge; one of Siúlóir''s travelling tricks got them across.
Trail: two men and a pig; two P''ntri following at a distance; trickles of blood after an hour; a poplar exploded at the base and fallen across the crushed pig; something dragged ferociously into a dark circle of ancient oaks.
The nightmare in the oak grove took Llan''s hand and the front half of the pig, and stopped there. Of the Eye broke cover to warn the company off it on account of their Vulfen companion, and not otherwise. The second P''ntri never showed himself.
Of the Tree, the elder, grey to white, rust-coloured moss clotted in his fur, sang over Llan and dressed him with unfamiliar herbs in the clearing beneath the arch.
The Builder arch stood open with flickers of blue awakened light and no passage. Something pounded on it from the far side like a beater on a bodhran. Siúlóir stepped in and vanished through a lens of blue light; long minutes later both came back thrown. The king''s blade burned its way into the brook-side boulder.',
         'Did King Glenys come back whole, and what did it cost Siúlóir to fetch him?
What was on the far side of the arch, and what was pounding to get through?
What is the nightmare in the oak grove, and why did it stop at Llan''s hand?
A second awakened Builder structure: how far does the disturbance reach?
What are Dirdenach and Chúl really cutting for, and whose eyes is Dafydd?
Why did the king ride out with only his huntsman, and what does Hugh already know?',
         '2026-09-12 10:00:00-07', '2026-09-12 18:00:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9');
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

