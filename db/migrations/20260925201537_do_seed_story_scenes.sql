-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM story_scenes WHERE id_story_scene < 0;

    RAISE NOTICE '+++    [%] Seeding story_scenes', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `story_scenes`: the scenes of Something Wicked (id_story -1
    -- in db/seeds/seed_stories.sql) as the three recorded sittings actually
    -- played them out, drawn from the write-ups An Eastern King, episodes 1 to
    -- 3. db/seeds/seed_story_sessions.sql must run first; every scene here
    -- points at one of its sessions, -1 Wayfinding, -2 Bog and River and -3
    -- Kildealg.
    --
    -- id_story_scene counts down from -1 in narrative order across all three
    -- sessions rather than restarting per session, so reading the ids
    -- backwards reads the campaign forwards. Seven scenes to a session, which
    -- is how the sittings broke: road, hall, talk, camp, then the thing that
    -- ended the night.
    --
    -- Every scene is 'COMPLETE': all three sessions are done, and the scenes
    -- were on the board before play, so pending_at is the session's open_at
    -- rather than anything earlier. The seed runs with triggers off, so the
    -- workflow timestamps are written here as the status timestamp trigger
    -- would have left them: pending_at when the card went up, active_at when
    -- the scene came up at the table, complete_at when it was done. The slots
    -- run in order and do not overlap, and none of them runs across the lunch
    -- pause recorded in the session's suspended_at / resumed_at.
    --
    -- Following the sessions seed, created_at is pending_at, since the row
    -- came into being when the scene was prepped, and updated_at is
    -- complete_at, the last time it changed. activity_log keeps its empty
    -- default and search_text is generated, so neither is inserted.
    --
    -- scene_description is what the storyteller re-reads before running the
    -- scene again: what happened, then who was in it and what is worth
    -- carrying forward. Names, spellings and diacritics are the write-ups'.
    INSERT INTO story_scenes (id_story_scene, id_story, id_story_session, status,
                              scene_title,
                              scene_description,
                              pending_at, active_at, complete_at,
                              created_at, updated_at, id_created_by_user, id_updated_by_user)
    VALUES
        (-1, -1, -1, 'COMPLETE',
         'Under a scattering sky',
         'Two days of the Storm Queen''s rant on the last eastern roads, and then a night walked out under the tail of it. The heroes came up on Dun Acyl at morning with the cloud scattering away in a line from the west, so that pure sun fell on the easternmost Dun as they approached it. The scene is weather, weariness and a first sight of the place.
Company: Dinl-Chi, free Vulfen; Padraig, the witch-boy; Siúlóir, weathered and watchful.
Of note: they rode out Naur''s wrath to reach a Speaker of the Day House, which is the errand that put them on this road at all. The break in the cloud runs west to east, ahead of them.',
         '2026-08-15 10:00:00-07', '2026-08-15 10:05:00-07', '2026-08-15 11:00:00-07',
         '2026-08-15 10:00:00-07', '2026-08-15 11:00:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-2, -1, -1, 'COMPLETE',
         'Badger at the palisade',
         'At the palisades the company found a young man cleaning and preparing the path into the large dun, the entrance to the main defensive lodge. He gave his name as Badger, the animal of House Daear, and took them inside, where they were plainly expected: the Speaker of the Day House had already seen to food and a space by the fire for them. Wary of being awaited by people they had not sent word to, they completed the rites of hospitality anyway and took their refuge, fine food and rest for weary bodies.
Ewen of House Daear, called Badger: young, wind-burnt, gold twisted into his hair, a worn leather harness over a plain shirt, dressed like a man who works the palisade rather than one who holds it.
Of note: nobody has yet said who expected them, or how word ran ahead of a company walking through a storm.',
         '2026-08-15 10:00:00-07', '2026-08-15 11:00:00-07', '2026-08-15 12:00:00-07',
         '2026-08-15 10:00:00-07', '2026-08-15 12:00:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-3, -1, -1, 'COMPLETE',
         'The Magebreaker up from the Godswood',
         'The easy part of the road ended when a Magebreaker and his enslaved P''ntri pathfinder came in to Dun Acyl from the south and east, up out of the Godswood. Careful circling in the hall: everyone polite, nobody at ease, a Vulfen and a collared P''ntri in the same room as an officer of a Kingdom that counts the Gift a crime.
Gabhain, Magebreaker, in red and tan with the broken-branches gold of his office pinned at the shoulder. Soo, called T''su, an enslaved P''ntri, collared and browbanded in knotwork, who speaks with Gabhain as an equal or near enough, a close advisor rather than property.
Of note: the Breakers travel where the crime is expected, so the question under the whole conversation is what Gabhain expects to find here, and whose leash he is on.',
         '2026-08-15 10:00:00-07', '2026-08-15 13:25:00-07', '2026-08-15 14:20:00-07',
         '2026-08-15 10:00:00-07', '2026-08-15 14:20:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-4, -1, -1, 'COMPLETE',
         'The haloed Speaker in the hall',
         'Hwn arrived, and the tension in the hall went up rather than down. Eventually the humans all spoke, and Dinl-Chi and Soo spoke, and the talk came out somewhere nobody in the room had steered it: a surprised Lord Ewen delivered the direct blessing of House Daear to the whole company, all unwitting, and Hwn put a samite bag with cloth of gold into Siúlóir''s hands, carrying seeds of some kind.
Hwn, Speaker of Solas, a Siar of the Day House: grey-shot beard, a plain cord at his throat carrying a pale stone, the gold of Solas ringing his head like a sun behind cloud. This is the man they rode through the storm to consult.
Also present: Ewen of House Daear, Gabhain and Soo.
Of note: the seeds went to Siúlóir and not to the witch-boy or the Vulfen, and no reason was given for either the gift or the blessing. How much of what Hwn said was true is an open question.',
         '2026-08-15 10:00:00-07', '2026-08-15 14:20:00-07', '2026-08-15 15:25:00-07',
         '2026-08-15 10:00:00-07', '2026-08-15 15:25:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-5, -1, -1, 'COMPLETE',
         'Two asses and a token',
         'Business before the road. Ewen loaned the company two asses and gave them a token to hand over along with the goods of one of them to Lord Balwen of Dun Dwym, who is rumoured a stubborn and difficult man. Gabhain told them he and Soo had come up from the south on the trail of one or more sorcerers out of the High Kingdom, and that something foul had woken a Builder Structure near the Godswood, with the Night Lodge Gods implied in the waking. He warned them off the bog and toward the southern road. The company weighed it and chose the old highway straight across the Eastern Wet instead, and made excellent time through that quiet country.
Ewen of House Daear; Gabhain the Magebreaker; Soo.
Of note: a token and a load of goods now owed to Lord Balwen of Dun Dwym. A woken Builder Structure near the Godswood. A warning against a road, taken as a reason to take that road.',
         '2026-08-15 10:00:00-07', '2026-08-15 15:25:00-07', '2026-08-15 16:15:00-07',
         '2026-08-15 10:00:00-07', '2026-08-15 16:15:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-6, -1, -1, 'COMPLETE',
         'Oak, ash and buckthorn over clean water',
         'Out on the Wet they found an uprising of clean water in a deep pool and took the hill above it to camp, oak, ash and buckthorn on the slope. They made a fire. Perhaps in a dream, Padraig woke to Dolain, the moon that keeps last secrets safe, shining through a high layer of cloud; he drew his arm close to his body, closed his free eye, extended the red blush of powdered carnelian and brushed the backs of his fingers against the clouds until he felt Dolain''s power gather around him and around the group, protecting. Then they all dreamed the same thing: running in the dark, in the storm, fleeing from terror toward music, toward a lure of light.
Company only.
Of note: the carnelian and the protection Padraig drew down. The shared dream ran toward the music, not away from it, which is worth remembering given what was waiting outside the camp.',
         '2026-08-15 10:00:00-07', '2026-08-15 16:15:00-07', '2026-08-15 17:10:00-07',
         '2026-08-15 10:00:00-07', '2026-08-15 17:10:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-7, -1, -1, 'COMPLETE',
         'The seed pouch and the eagle',
         'Siúlóir woke. There was a strange light out of sight in the trees, and a beautiful voice floating out across the quiet bog. Around the camp sat a score of birds of every shape and size, mostly raptors: crows, ravens, peregrines, hawks, a few small seabirds. A massive eagle was perched over the Speaker eating seed out of the samite pouch, which had been lifted out of his pockets while he slept. The session ended there.
Company only, with the birds; the singer stayed out of sight.
Of note: something took the pouch off a watchful man without waking him. The light and the voice are the lure the whole camp had just dreamed of running toward.',
         '2026-08-15 10:00:00-07', '2026-08-15 17:10:00-07', '2026-08-15 18:00:00-07',
         '2026-08-15 10:00:00-07', '2026-08-15 18:00:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-8, -1, -2, 'COMPLETE',
         'Song over the black water',
         'The song in the wood of oak, ash and thorn rose with sadness and near delight. The samite bag of Hwn''s seeds was being enjoyed by one of the Dragon''s Spine''s golden eagles, and every other bird stood still and waiting, until the march of the music pulled them out over the still black water, round under the boughs of the oak, and then folded their hunter''s wings and dropped them into the ash forest, where the sound of the wings stopped all at once. The company faced the eagle, the song changed, and the seeds went to the birds.
Company only in the scene proper; the singer still behind the trees.
Of note: the seeds Hwn gave Siúlóir were what gathered the birds, which makes the gift look less like a kindness and more like an instruction. The wingbeats going silent in the ash forest was never explained.',
         '2026-08-29 10:00:00-07', '2026-08-29 10:00:00-07', '2026-08-29 10:55:00-07',
         '2026-08-29 10:00:00-07', '2026-08-29 10:55:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-9, -1, -2, 'COMPLETE',
         'The Morning Singer''s shortcut',
         'The singer came out through a rippling in the wood and treated with them. She told them of a conspiracy between herself and Gaer, queen of the heavens, to save the raptors of this country from what is coming to it, and that she was carrying them off to her summer groves. She offered to take the company to their destination by a shortcut beyond the wood. They did not accept, and went back to the old highway.
The Morning Singer, one of the Bright Ones, the spirits that live in the bright mists behind the world: laughing, sun on her face, of queer features, bedecked in flowers and vines, pointed ears through a mane of leaves and feathers, gold heaped at her throat, a green stone on her hand, and small birds sitting her shoulders as though she were a branch.
Of note: she never said what is coming, only that it is. The shortcut was declined without the price ever being named, so the price is still unknown.',
         '2026-08-29 10:00:00-07', '2026-08-29 10:55:00-07', '2026-08-29 11:50:00-07',
         '2026-08-29 10:00:00-07', '2026-08-29 11:50:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-10, -1, -2, 'COMPLETE',
         'Three cages on the old highway',
         'Three men met on the old highway, guarded and polite about it, each carrying a wicker cage held out in front of him at the chest. They said the birds were ravens. The birds did not sit the way a raven sits. Spare conversation was traded; the company told them they had seen the Morning Singer at the freshwater spring and nothing further, and moved past them quickly.
Three farmers, in heavy undyed wool and dark kilts.
Of note: whatever is in the cages, where the three are carrying it and for whom. The company handed them the Singer''s location, which is the only thing anyone gave away in that exchange.',
         '2026-08-29 10:00:00-07', '2026-08-29 12:40:00-07', '2026-08-29 13:30:00-07',
         '2026-08-29 10:00:00-07', '2026-08-29 13:30:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-11, -1, -2, 'COMPLETE',
         'The woman under the weeping willow',
         'An old woman came out from under a weeping willow to treat with them, asking after their road and their news. Her grandchildren had gone missing, she said, and she was out looking for them; would these young heroes find them for her? They were already burdened with purpose, and said so with regret, and went on. None of them can quite recall her now.
The woman beneath the willow, in layers of loose-spun wool.
Of note: the memory of her slides away from all three of them, which is the most alarming thing about the encounter. Whose grandchildren, and whether they went missing into the same country the Singer is emptying of birds.',
         '2026-08-29 10:00:00-07', '2026-08-29 13:30:00-07', '2026-08-29 14:20:00-07',
         '2026-08-29 10:00:00-07', '2026-08-29 14:20:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-12, -1, -2, 'COMPLETE',
         'Mist against the current',
         'They came at last to the greenway, the earth and stone and tree pushed back and up by the river''s floods each year, trodden flat by the feet of men and asses. As they went down it the Mist came at them, expanding upriver against the current and away from the ocean, out of an already-concealed Dun Dwym. They held the way through the fog on Padraig''s footsteps, which swirled faintly with light, and found the massive carved tree holding the great hawser that runs the ferry across the Godsflood''s current. Everything on that bank was soaked, more than it should have been. They went down to the ferry and loaded the asses quickly, and only then understood that the massive wet stain in the middle of the boat was the ferryman, drowned, with no sign of ever having been in the river.
The ferryman, dead on his own boat.
Of note: the mist moves against the current, which no mist does. The drowning happened on dry timber under a fog that came up specifically to cover Dun Dwym while it did.',
         '2026-08-29 10:00:00-07', '2026-08-29 14:20:00-07', '2026-08-29 15:40:00-07',
         '2026-08-29 10:00:00-07', '2026-08-29 15:40:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-13, -1, -2, 'COMPLETE',
         'The roar and the river',
         'Then it came for them for the first time. A man''s shape made of river water with bits of grass and wood turning through it, burbling as it came, making the drowning sounds men make when the water takes them, and it went straight for Padraig. Dinl-Chi put his wet fur body between the thing and the witch-boy without any apparent second thought, stamped his feet, moved in a way that was strange and serpentine, and roared. His breath was the hot wind venting from the earth, the humid exhalation of the fire under it. The roar caught the Mistling and took it apart: flecks of water first, the thing not even having the instinct to protect its almost-face, then stringers of fluid flung loose and streaming, then gouts, and then the whole body came apart on the wet earth and ran back into the river. They unhooked the ferry and hauled madly at the hawser while the boat jounced and teetered and rolled in the hard current of the great black river sometimes called the Godsflood.
The Mistling.
Of note: it picked the witch-boy out of three. Nothing says it was the only one, and nothing says whether the mist carried it down to the ferry or it brought the mist.',
         '2026-08-29 10:00:00-07', '2026-08-29 15:40:00-07', '2026-08-29 16:50:00-07',
         '2026-08-29 10:00:00-07', '2026-08-29 16:50:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-14, -1, -2, 'COMPLETE',
         'A queen who asks, a king who soothes',
         'They made the far shore and found the stairs cut into the edge of the great rock circle the Dun stands on, and guards at the top of them. In hushed voices in the mist they told the tale of the mistling and the ferryman, and the guards were not surprised enough. They were shown to a small, empty old dun building. Aia came down to them and interrogated them, questions and not hospitality. Glenys came after her to tell them all was well, with every meaningless politeness one would expect of a courtier at the Throne of Bone and not at all of a fearsome Balwen king. Then the feasting, the drink and the toasts.
Aia, Queen of Dun Dwym. Glenys, King of Dun Dwym.
Of note: a queen who interrogates and a king who reassures, in that order. Lord Balwen of Dun Dwym was reported stubborn and difficult; Glenys is wearing someone else''s manners. Ewen''s token and the ass-load of goods are still undelivered.',
         '2026-08-29 10:00:00-07', '2026-08-29 16:50:00-07', '2026-08-29 18:00:00-07',
         '2026-08-29 10:00:00-07', '2026-08-29 18:00:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-15, -1, -3, 'COMPLETE',
         'Strangers in the morning',
         'Come morning at Dun Dwym there were other strangers about the place. A marked wizard and his man were there to trade timber: pine off an estate the wizard is raising on the north shore of the Mwrost, to be swapped for the stout white oak the Balwens are known to nurture in Kildealg. There was also a shell and pearl seller working the dun, whom the wizard looked at once and called, simply, the spy.
Dirdenach, the marked wizard: dense black rule-work and sigils inked over brow, cheeks, throat and chest, a wheel set between green eyes, all of it looking out from under an embroidered hood. Chúl, his gaunt and emotionless man: bald, bare to the waist, wiry as rope, a long grey beard, a blue rune laid over his heart, a felling axe across his shoulder.
Dafydd: wild grey-streaked hair, a dark beard, pale eyes in a dirty face, bundled in heaps of ragged sand-coloured wool against weather he has plainly been out in a long while. Nobody dressed like that has been near the sea lately.
Of note: an axe and a fistful of sigils buying oak out of this particular wood, and a wizard who took the trouble to point the spy out to strangers.',
         '2026-09-12 10:00:00-07', '2026-09-12 10:00:00-07', '2026-09-12 11:05:00-07',
         '2026-09-12 10:00:00-07', '2026-09-12 11:05:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-16, -1, -3, 'COMPLETE',
         'The king rode out before dawn',
         'The news in the dun was that the King had gone hunting, before dawn, and that he had taken his huntsman and nobody else. The Sword of Balwen was not happy about it and did not trouble to hide that he was not happy about it, and he was uneasy before anyone brought him any news at all. The company decided to follow.
Hugh, the Sword of Balwen: grey-shot black hair swept back off a face that has been opened and closed again more than once, old scars through brow and cheek and a few of the cuts still fresh, gold in one ear, dulled scale across his shoulders, both hands folded on the grip of a long blade stood upright in front of him.
Named but absent: Llan, the king''s huntsman, out with Glenys.
Of note: a Balwen king rode into Kildealg at dawn without his Sword. What Hugh already knows about where Glenys goes is the question the whole session hangs off.',
         '2026-09-12 10:00:00-07', '2026-09-12 11:05:00-07', '2026-09-12 12:10:00-07',
         '2026-09-12 10:00:00-07', '2026-09-12 12:10:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-17, -1, -3, 'COMPLETE',
         'The rope bridge in the mist',
         'The crossing from Dun Dwym to the Blackthorn Wood is a rope bridge, and the mist was still sitting on the river. Dinl-Chi used his roar again and parted it, and Siúlóir used one of his travelling tricks to get them all safely across to the woodside.
Company only.
Of note: the roar works on the mist itself, not only on what comes out of it, which is worth knowing next time the Godsflood fogs over. The mist off the river has still not lifted since the ferryman.',
         '2026-09-12 10:00:00-07', '2026-09-12 13:40:00-07', '2026-09-12 14:30:00-07',
         '2026-09-12 10:00:00-07', '2026-09-12 14:30:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-18, -1, -3, 'COMPLETE',
         'The trail turns to blood',
         'They took up the tracks of two men and a pig going into Kildealg, and found quickly that they were themselves being followed at a distance by two P''ntri. They quickened the pace, still hours behind, and after a while began to see trickles of blood on the trail, which went on for over an hour of hard movement through the forest. At the end of it they found a poplar exploded near the base and fallen across the road, crushing the body of a pig, and beyond it the trail had something dragged ferociously across it, wiping out every further trace and leading into a dark, hulking grove of ancient, brooding oaks squatted down in a circle with their high wild branches laced together.
Two P''ntri following, neither of them named yet at this point in the trail.
Of note: the tracks are two men and a pig, and the blood starts long before the poplar. The poplar was blown apart at the base, not felled. Whatever did the dragging went into the oaks.',
         '2026-09-12 10:00:00-07', '2026-09-12 14:30:00-07', '2026-09-12 15:30:00-07',
         '2026-09-12 10:00:00-07', '2026-09-12 15:30:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-19, -1, -3, 'COMPLETE',
         'Of the Eye breaks cover',
         'One of the two who had been trailing them broke cover to signal the company clear of what he called, in the parlance of his people, a nightmare, squatting in the ring of old oaks. He did it on account of their Vulfen companion and not otherwise, and said as much. On the trail they found the hand of Llan the huntsman; the front half of the pig had been dragged into the circle. Parleying, they learned that the huntsman was with an elder of the P''ntri and that Glenys had gone on alone. Then he walked them through the wood, which was a challenge to keep up with and which they managed.
Of the Eye: a heavy dreadlocked mane, black markings running around gold eyes and down the muzzle, long white whiskers, one big fist closed and held forward.
The second P''ntri never showed himself at all.
Of note: the nightmare took Llan''s hand and the front half of a pig and stopped there, which is the strange part. Of the Eye chose to show; the other one chose not to, and where he went is unanswered.',
         '2026-09-12 10:00:00-07', '2026-09-12 15:30:00-07', '2026-09-12 16:25:00-07',
         '2026-09-12 10:00:00-07', '2026-09-12 16:25:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-20, -1, -3, 'COMPLETE',
         'Of the Tree in the sunlit clearing',
         'The wood opened into a clearing full of sunlight with a Builder stone arch standing in it, shining. A white elder of the P''ntri was already there, singing over the huntsman and working unfamiliar herbal medicine into what was left of the arm. Talking it through, the company established that Glenys had gone through the arch and that the arch was awake: flickers of blue light in the Builder stone, but no passage, and no Glenys.
Of the Tree, the elder: gone grey to white through a great mane and beard, pale tufted ears, yellow eyes set deep under a heavy brow, worn grey wool, a thin chain at the throat, and rust-coloured moss or something like it clotted through the fur of his head and shoulders.
Llan the huntsman, alive: long dark hair, a forked beard going grey, weather in every line of him, the king''s heavy gold still at his throat over river-brown leathers.
Of note: a second awakened Builder structure, this one across the river from Dun Dwym, after the one near the Godswood in episode 1. Of the Tree was tending a mauled man under an arch that had just swallowed a king and did not seem surprised by any of it.',
         '2026-09-12 10:00:00-07', '2026-09-12 16:25:00-07', '2026-09-12 17:15:00-07',
         '2026-09-12 10:00:00-07', '2026-09-12 17:15:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-21, -1, -3, 'COMPLETE',
         'Long minutes on the other side',
         'The light in the arch was perturbed, and with it came the sense of something pounding against the space inside it from the other side, steady, like a beater on the skin of a bodhran. Siúlóir flexed his powers and stepped into the archway; it burned to full life and he vanished through a lens of blue light. Long, tense, terrible minutes followed. Then the light rushed back into the arch and the Wayfinder and King Glenys tumbled violently out of it as though thrown, the king''s burning silver blade arcing loose through the air and striking the massive boulder by the little brook, searing its way into the stone, and a mighty flash of power set everyone back on their heels. The king lay silent. The siar groaned. The session ended there.
Siúlóir, King Glenys, with Of the Tree, Llan and Of the Eye in the clearing.
Of note: the blade is still lit and still burning into the boulder, and Balwen steel does not do that. Whatever was pounding did not get through this time. Nobody yet knows whether Glenys is alive, or whether all of him came back.',
         '2026-09-12 10:00:00-07', '2026-09-12 17:15:00-07', '2026-09-12 18:00:00-07',
         '2026-09-12 10:00:00-07', '2026-09-12 18:00:00-07', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9');
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

