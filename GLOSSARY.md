# Glossary

The words this project uses for its own ideas, so code, issues and
conversation say the same thing. `docs/agents/domain.md` says how the
engineering skills consume this file.

## Stat blocks

- **Template**: a system's stat block definition, `systems.stat_block_definition`,
  edited by administrators under Systems. Its groups are the stat blocks on
  offer to the system's elements. Carries `updatedAt`, the moment it was last
  saved, stamped by the action that saved it (absent on one last saved before
  2026-11-14).
- **Story template**: a story's own copy of its system's template,
  `stories.stat_block_definition`, made by the storyteller with Copy to this
  story on the story's page and changed on `/stories/[id]/stat-blocks`. It is
  read in the template's place wherever the story's elements are
  (`statBlockSystems(idStory)`); every other story of the system keeps the
  template. NULL means the story reads its system's. Overwrite with the
  game's puts the template as it stands over it, after asking. Changing the
  story's system deletes it, but only once Edit story has warned and the
  storyteller saves with Save and delete stat block; `sa_updateStory` refuses
  the change otherwise. Not a Copy in the sense below.
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
  was prepared with. Every stat with an Initialized as is rolled afresh for
  the copy as the link is made (`rollStartingBlocks`), from the element's
  own dice for one rolled from a Dice stat, so each scene element of a
  creature, every copy among them, has its own hit points. The pill's panel draws the copy in its scene card and
  the element's own blocks folded under its rows, to read; a paste beside the
  copy's pencil writes the element's blocks over the link's
  (`sa_copyStatBlocksFromElement`), and the table's edit form offers the
  other way, a block back over the element's (`sa_copyStatBlocksToElement`),
  when play should become the new baseline. Each asks first when it would
  overwrite stats (the paste when the link carries any, the copy back when
  the element carries a block of that system) and is made at once otherwise.
  A link's first stat blocks, saved from the table's edit form, go to an
  element with none of its own as well (`sa_setStatBlocks`). ADR 0001.
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
- **Health indicator**: one stat the template names (`healthIndicator`,
  "group.stat", "" or absent for none), from the template editor's Health
  indicator select above the groups: a pool or a stack held to a number, in
  a group that does not repeat (`healthIndicatorOf`). A rename, retype or
  removal of the stat is refused on save, on the select. Read against a
  scene element's own copy of its stats, never the element's: its level is
  the value over the max as a whole percent, 0 at or below 0 and 100 at or
  above the max, whatever a pool's min (`healthLevel`), with nothing to show
  while the value is blank, there is no max above 0, or the link does not
  carry the group. One per template, so a pill has at most one drop.
- **Drop**: the blood drop just before a pill's name, on the storyteller's
  pills at the run and live pages and on the players' at the play page and a
  scene's preview, for a link whose health indicator has a level
  (`SceneItem.health`, `HealthDrop`): white when full, darkening to dark red
  (`run.healthEmpty`) at 0, outlined so it shows on a light theme. The
  players are given the level alone (`health` on the public scene element),
  never the stat's numbers; the storyboard gives none. Worked out on the
  server as the pills are read, and kept true in play by each stat change
  (`ElementStatBlock.health`), which the panel that made it hands to the
  pill (`patchLink`) and the players' table is sent with the link.
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
  the total, a stack at the total with it as its max, a display at it. The
  select beside the box offers, in place of dice typed there, a Dice stat to
  roll ("Roll Hit Dice", `initialFrom`), for dice that differ from element to
  element: any in a plain group for a stat in a plain group, its own row's
  for a stat in a group that repeats (`initialSource`). Its dice are rolled
  into the stat on the element's edit form when its box is left, while the
  stat is still empty (blank, or 0 to 0), and as the block is added when
  another block already holds them; the die after the stat's boxes rolls
  them in again whatever it holds.
- **Up/down**: a stat flag (`upDown`), offered on a stat held to a number: the
  table draws the up/down changer beside the number's box; without it the
  box alone is drawn. Off on templates written before the flag.
- **Left/right**: a stat flag (`leftRight`), offered on a rack: the table draws
  the buttons that move the rack to the entry before or after; without it,
  or on a static rack, the entry is only shown. On for a rack in a template
  written before the flag, which drew them always.
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

## Annotated pictures

- **Annotated**: a picture of the story's that the players are shown with
  the storyteller's drawing over it, fog of war and pen marks, rather than
  as it is (`attachment_annotations.is_active`), wherever an element shows
  it: as the element's own picture, in every scene, or as its picture in one
  scene (its link's cover). Turned on and off by Annotate for players
  (`sa_setAnnotated`), which sits on the picture's card in the story's
  Attachments and among an element's pictures on its edit page, beside the
  picture in the element panel, in a pill's picture preview on the run and
  live pages and on a scene's preview, and in the run page library's
  preview. Any change made in the annotator turns it on too: annotating a
  picture is annotating it for the players. The exception is a change to
  walls alone (drawing, erasing or taking back a wall), which the players
  never see: it neither turns the picture on nor asks for a new players'
  copy, and a copy that was current stays current. Only a picture the app uploaded
  can be, since the server must fetch it to render the players' copy.
  Turned off, the drawing is kept for the next time and the players are
  given the picture again; turned on again with the drawing changed since,
  the players are shown nothing until a fresh copy is rendered.
- **Drawing**: an annotated picture's ordered steps
  (`attachment_annotations.ops`, `lib/annotation-schemas.ts`), in the
  picture's own pixels as it stands upright: fog brush strokes and
  rectangles, each a Reveal or a Cover, floods, Cover all and Clear all, walls,
  the wall eraser's drags, pen marks, shapes, the eraser's drags, and Erase
  all annotations. A later step wins
  where two overlap, and a Cover all or Clear all (Erase all annotations for
  the annotations) makes every step before it moot, walls and the wall
  eraser's drags aside. Its fog has a color of
  its own (`fog_color`), the players' copy's as well as the annotator's. A drawing is the file's: it stays with the file whatever the
  elements show, and goes only when the file is deleted, once the
  storyteller has been told (`dropDrawing`).
- **Annotator**: the full-screen dialog the drawing is made in
  (`AnnotatorDialog`), opened from the brush beside Annotate for players,
  wherever that is, on any uploaded picture: one with no drawing is given
  one as it opens, fogged whole, which the players are not shown until a
  change is made in it. Its toolbar has two halves: the annotations on the left
  (Pen, Shape, Eraser, the pen's color and width, Erase all annotations),
  and from the middle the fog (Show fog, My fog and Players' fog as sliders
  with percentages to type, the fog's color, Cover all, Fog brush, Fog
  rectangle, Flood, Reveal or Cover, the brush's size, Clear all, Wall pen and
  Wall eraser, and Finish wall while a wall is being drawn). Undo (Ctrl+Z) and
  whether the drawing is saved sit beside its title. It opens with the Flood
  in hand when the drawing has walls, and with the Fog brush when it has none.
  Escape finishes a wall being drawn and leaves the annotator open; with no
  wall in progress it closes the annotator. Ctrl+Z, while a wall is being
  drawn, takes back its last corner. Each change is saved a moment after it is made
  (`sa_saveAnnotation`), as the steps kept and the steps added, from the
  revision it was drawn on; a save from a drawing changed elsewhere is
  refused and the drawing loaded again.
- **Fog**: what covers the parts of the picture the players have not
  reached. It starts over the whole picture; Reveal lifts it, Cover lays it
  down again, with the brush or a rectangle dragged corner to corner.
- **Annotation**: a mark drawn under the fog, so the players see it only
  where the fog is lifted: a pen mark, a freehand line, or a shape (circle,
  triangle, square, pentagon or hexagon, picked from the shape tool's
  dropdown) dragged out from its centre with a corner following the
  pointer, so it grows and turns with the drag, both in the pen's colors
  and widths.
  The Eraser takes away whole annotations it is dragged across, as one step
  that Undo puts back.
- **Wall**: a line the storyteller draws on the fog with the Wall pen,
  corner by corner, every side straight; a click near the picture's edge,
  another wall or its own first corner lands exactly on it. Closed when both
  its ends touch the edge, another wall or itself, and open otherwise; walls
  that touch are one shape, and a shape is closed only when every wall in it
  is. An open shape's walls are drawn pale, a closed shape's deep blue and
  thicker, with the storyteller's fog over a closed shape's enclosed areas
  drawn in that blue. The storyteller always sees walls, with Show fog on or
  off, and the players never do: not in their copy, nor in any preview. The
  Wall eraser takes away each whole wall it is dragged across, as one step
  that Undo puts back; the Eraser, Erase all annotations, Cover all and
  Clear all never touch walls.
- **Flood**: the fog tool that reveals or covers, as Reveal or Cover says,
  the area clicked, bounded by every wall and the picture's edges. It
  reaches under its walls, so two neighboring areas both revealed leave no
  strip of fog between them. It is saved as the area's outline, so walls
  drawn or erased later never change an area already flooded.
- **Show fog**: the switch between Hide and Show for whether the
  storyteller sees the fog in the annotator at all, to look at the picture
  plain; this sitting's only, and nothing to the players' copy.
- **My fog / Players' fog**: how thick the fog is drawn, as a percentage.
  My fog is the storyteller's own view in the annotator, light enough to
  draw through, and kept among their preferences; Players' fog is the
  drawing's (`fog_opacity_players`), what the players' copy is rendered
  with. My fog's slider runs from 1 to 100 and Players' fog's from 50 to
  100; a number typed in beside either takes 0 to 100.
- **Players' copy**: the picture with the drawing over it at the players'
  fog, rendered on the server with sharp after each save and uploaded to
  Blob (`lib/players-copy.ts`), one render at a time per drawing. While a
  picture is annotated it is all a player is given of it where an element
  shows it (`playerSceneElementImageUrl`): nothing until the first copy is
  ready, never the raw picture (ADR 0002). The storyteller's own pills,
  cards, previews and panels show it too once it is rendered, so they see
  what the players see; the annotator keeps the raw picture under My fog.
  At the start of a full-size preview's bottom bar, where the storyteller
  can annotate the picture, the fog switch is a pill: a filled cloud and
  FOG OF WAR ACTIVE while the picture is annotated, an outline cloud and
  FOG OF WAR OFF while it is not, pressed to turn it on or, after asking,
  off; the annotator's pencil follows it. A preview without those controls
  marks a copy with fog on it FOG OF WAR ACTIVE in the same place
  (`fogActive` in `db/attachment-url.ts`). Two ways the raw picture still
  reaches players: the same file used as a scene's, a session's or the
  story's cover, or among a scene's or a link's other pictures, is shown as
  it is there; and a player who loaded the picture before it was annotated
  may hold it in their browser's cache.
- **Element pictures**: an element's own pictures (its ELEMENT uses), as a
  scene has its: one of them its cover, the picture its pill shows in every
  scene where its link has no cover of its own, and the rest kept beside it.
  Managed on the element's edit page; the players are only ever shown the
  cover. On the Prep Work board each element's row shows, beside its
  status, a Cover pill that opens the cover full size and the count of its
  other pictures.
