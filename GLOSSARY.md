# Glossary

The words this project uses for its own ideas, so code, issues and
conversation say the same thing. `docs/agents/domain.md` says how the
engineering skills consume this file.

## Stat blocks

- **Template**: a system's stat block definition, `systems.stat_block_definition`,
  edited by administrators under Systems. Its groups are the stat blocks on
  offer to the system's elements.
- **Stat block**: one group of the template as carried by an element or a
  scene element, with its values. An element carries any number of them,
  picked from the template on the prep form or at the table; stored on
  `elements.stat_blocks`, keyed by system id then group name, so only the
  groups picked are present. (Before 2026-11-10 a stat block meant the
  whole of a system's values on an element; see ADR 0001.)
- **Copy**: a second link of one element to one scene (`scene_elements` no
  longer holds an element to one link per scene). Each link has its own
  status, stack, pictures, label and stat blocks, and its own pill; the
  table warns the storyteller as a copy is added. Links are named by
  `id_scene_element` throughout the link actions and the realtime events,
  and a pill's key is `KIND:idElement:idSceneElement` (`playItemKey`).
- **Label**: a link's own words for its pill (`scene_elements.label`), the
  fourth field `element_showing` may name beside the element's initial
  name, name and title. A copy is given one of the element's name and a
  counter as it is made ("Goblin 1", "Goblin 2") and shows it; the pill's
  edit form changes it ("Label in this scene").
- **Scene element's stat blocks**: the copy a scene element holds of its
  element's stat blocks (`scene_elements.stat_blocks`), taken when the link
  is made and changed in play, so the element's values stay the baseline it
  was prepared with. The pill's panel draws the copy in its scene card and
  the element's own blocks folded under its rows, to read; a paste beside the
  copy's pencil writes the element's blocks over the link's
  (`sa_copyStatBlocksFromElement`), and the table's edit form offers the
  other way, a block back over the element's (`sa_copyStatBlocksToElement`),
  when play should become the new baseline. ADR 0001.
- **Holder**: whose stat blocks an action reads or changes: an element's own,
  or a scene element's copy (`StatBlockHolder` in
  `apps/web/src/components/stat-blocks/actions.ts`).
- **Picker**: the cards offering the template's stat blocks a holder does
  not carry yet, each previewed, with Add and Add all.
- **Group**: a named run of stats in a definition ("defense", "attack",
  "saves"), drawn as a heading with its stats under it.
- **Stat**: one named entry in a group. A stored stat has one current
  `value`, or none yet when its box was left blank.
- **Display**: a stat type holding one fixed value, a number or a word.
- **Pool**: a stat type whose value is spent and refilled between a `min`
  and a `max` (hit points, spell slots).
- **Stack**: a stat type whose value counts up from 0 and may have a `max`
  (exhaustion levels, rage uses).
- **Rack**: a stat type whose value is one entry of an ordered list set by
  the definition ("d4", "d6", "d8"); the stored value is the entry itself.
- **Dice**: a stat type holding dice as "xdy", x dice of y sides, with "+z"
  or "-z" added on when there is one ("2d6", "2d6+2"); a count left off reads
  as 1, so "d8" is stored as "1d8". Left blank, nothing is stored and the
  table shows nothing.
- **Computed**: a stat type that stores nothing and is worked out from a
  formula over other stats.
- **Description**: what a stat is for (`description` on its definition, "" for
  none), shown as a tooltip over the stat's title on the prep form and at the
  table, with what the stat is initialized as after a colon ("Hit Points:
  8d8+3", `statTooltip`), and under it in the picker. The title is the label, or the name when
  there is no label (`statLabel`).
- **Visible**: whether the table draws a stat (`visible` on its definition,
  on by default). A hidden stat is still filled in on the prep form and still
  feeds formulas; it is only left out of the element panel.
- **Format**: how a stat's value is held and written (`format` on its
  definition): `""` as it is, a number or a word; `"number"` a number only,
  which the prep form holds it to; `"number +/-"` a number only, written with
  its sign at the table ("+3", "−2") for a bonus or a penalty. Offered on a
  display, a pool and a stack; a pool and a stack start as `"number"`.
- **Static**: a stat flag (`static`): the table shows the stat as words, with
  no box or clicker, for a modifier set on the prep form and not nudged in
  play.
- **Roll**: the dice a pool, a stack or a display held to a number rolls
  (`roll` on its definition), as the chat's `/roll` takes it: one of 1d6, 2d6, 1d8, 1d10, 1d12, 1d20 or a
  custom notation. Shown as a die beside the stat at the table; pressing it
  rolls the die with the stat's value added ("1d20+3", or the die alone with
  no value), a dice stat rolling the dice it holds, and the roll is said in
  the table chat as "9 for <what the pill shows>: <stat>". An invisible
  element's roll, or one made with no session at the table, is toasted to the
  storyteller instead (`sa_rollStat`). A pill whose link carries a stat block
  has a die beside its chevron that opens the blocks alone, and each block's
  heading at the table folds its lines away and back.
- **Global**: a stat flag (`global`): the storyteller's stats pane offers to
  roll the stat for every element in the scene at once, as an initiative is
  rolled. Only a stat with a die may be global: a pool, a stack, a display
  held to a number or a dice stat. `sa_rollStatForAll` makes the rolls, one per
  element (one per row of a repeating group, titled "<element> (<key>)"), each
  said in the chat as a pill's roll is, an invisible element's and every one
  made with no session at the table kept back and toasted to the storyteller
  together.
- **Stats pane**: the storyteller's table pane beside the library (`Stats` in
  the header, `run.showStats`) listing every element in the scene that
  carries a stat block, invisible ones too, each under a pill the pane's width
  with what its play pill shows it as, its scene status, live, and the pencil
  that opens its blocks' edit forms, with its blocks drawn and changed as the
  element panel draws them, less the system's name, and a die beside the
  heading per global stat the blocks carry, rolling it for
  all (`sa_getSceneStatBlocks`); each total then stands after its element's
  title and a sort button orders the elements by them, high to low and back.
  Wider than the library, and widened to half the page from its heading's
  button, the page's own state. Read again when the scene changes, an element
  joins or leaves it, or the scene is reloaded.
- **With next**: a stat flag (`sticky`, the template editor's With next box): the stat shares a line with the stat
  after it, on the edit form and in the display block, so a run of sticky
  stats and the one that follows them read as one line (`statLines`).
- **Formula**: the arithmetic a computed stat is worked out with, written
  over references such as `defense.sdc.value`; see
  `apps/web/src/lib/stat-formula.ts`.
- **Repeating group**: a group whose definition names one of its stats as
  the key (`keyedBy`); an element carries any number of rows of it, added and
  removed on the prep form. Palladium's attack group, one row per weapon.
- **Roll all**: a group flag (`rollAll`), offered on a group that repeats: the
  table draws a die on the group's heading, in the element panel and the
  stats pane, that rolls the first die of every row at once
  (`sa_rollGroupRows`), each roll under the element's title and the row's
  key, and each row as many times as the row's multiple.
- **Can have multiples**: a group flag (`canHaveMultiples`), offered on a
  group that repeats: each row says how many of it the element has in a
  Multiple column of the block's table, 1 to start, stored in the row under
  `$multiple` (`MULTIPLE`) beside its stats; the table marks the row "Sword
  ×4" and Roll all rolls it that many times. Palladium's attacks per melee
  with each weapon.
- **Initialized as**: a stat's starting roll (`initialRoll`, "" for none),
  offered on a pool, a stack or a display held to a number from the template
  editor's Initialized as box, a dice box with an eye that rolls an example.
  Rolled once when the stat's block is added to an element, on the prep form
  or at the table (`sa_addStatBlock`), or a row of it: a pool starts full at
  the total, a stack at the total with it as its max, a display at it.
- **Up/down**: a stat flag (`upDown`), offered on a stat held to a number: the
  table draws the up/down changer beside the number's box; without it the
  box alone is drawn. Off on templates written before the flag.
- **Stories view**: the Stories page's toggle in its upper right between Icon
  view, the story cards, and List view, a table of the stories (on TanStack
  Table) with columns for status, favorite, players, sessions and play time
  (the finished sessions' lengths summed), every one sortable. Kept as the
  user's `stories.view` preference. The page's list is My Stories: every
  story the user runs, plays in or has favorited (`sa_listMyStoryPage`); a
  search box over `stories.search_text` (title, summary and standard tags)
  and the story's system (name, version and variant, matched in the query)
  and the column sorts are answered by the database, so More continues in
  the same order. Icon view also puts the favorites first, in a Favorites
  section of their own (`sa_listFavoriteStories`), left out while there are
  none and not filtered by the search or Show inactive.
- **Story title menu**: the story's title with a caret after it
  (`StoryTitleMenu`), on the story page, the library, the run page and the
  live page, which opens the story's doors as links: Overview (the story's
  page) first for anyone, Edit, Library, Build scenes and Play for the
  storyteller, the Storyboard for anyone. Play is the
  Play button by another door: it opens the Play popover by the title, asking
  which session, and the table opens from there. The page the menu is
  on is marked current and is no link. Build scenes is a plain link to
  `/stories/<id>/scenes`, left unprefetched because that page can write: it
  opens the scene touched last, and while the story has none it makes a "New
  scene" and opens that (`sa_getOrCreateSceneToBuild`). Any scene's live page
  counts as it.
- **Default row**: the first row of a repeating group, marked with a filled
  star on the prep form and at the table; a star on any other row moves it to
  the front (`sa_setDefaultRow`). Roll for all rolls a repeating group's stat
  for the default row alone, so an initiative goes with the weapon in hand.
- **Key**: the stat whose value tells one row of a repeating group from
  another; a display or a rack that is not connected, filled on every row
  and unique within the group. The table addresses a row by it.
- **Row**: one set of a repeating group's values on an element, stored as
  one entry of the group's array.
