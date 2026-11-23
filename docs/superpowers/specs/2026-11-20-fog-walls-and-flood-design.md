# Fog walls, the flood, and a straight pen

Status: draft 2026-11-20, awaiting approval.

## Intent

The storyteller fogs a map in the annotator and lifts the fog bit by bit as
the players explore. Today, lifting a room means painting it with the fog
brush or dragging fog rectangles at the table, which is slow and imprecise
while the players wait. This change lets them do the precise work in prep:
draw **walls** on the fog around each room, then during play click a room
with the **flood** to reveal it (or cover it again) in one go.

Walls are the storyteller's alone. They are never drawn into the players'
copy, and they are always shown in the annotator, in colors chosen to stand
out against any picture, which change once a wall's shape is closed and
ready to flood.

Separately, holding Shift while drawing with the pen draws a straight line.

## Terms

- **Wall**: a line the storyteller draws on the fog with the **wall pen**,
  corner by corner, every side straight. A step of the drawing
  (`{ t: "wall", points }`). Never in the players' copy.
- **Closed wall**: one whose two ends each touch the map's edge, another
  wall, or an earlier side of itself.
- **Shape**: walls that touch one another, taken together. A shape is
  **closed** when every wall in it is closed.
- **Area**: a part of the picture bounded by walls, the map's edges, or both.
- **Enclosed area**: an area bounded by closed shapes, other than the
  outside (defined under Colors).
- **Flood**: the tool that reveals or covers the area clicked in. A step of
  the drawing holding the area's outline (`{ t: "flood", mode, rings }`).
- **Wall eraser**: the fog half's own eraser, which takes away walls and
  nothing else (`{ t: "wallErase", targets }`). Walls are not annotations:
  the annotations' eraser and Erase all annotations never touch them, and
  the wall eraser never touches a pen mark or shape.

## Goals

1. A wall pen in the annotator's fog half that draws walls by clicking
   corners, and a wall eraser beside it that takes walls away; neither has
   anything to do with the annotations or their eraser.
2. Walls shown to the storyteller in fixed colors that read against any
   picture: pale and thin while open, thick and darker once closed, with the
   storyteller's fog over an enclosed area drawn in that darker color.
3. A flood tool that reveals or covers, as the Reveal/Cover choice says, the
   area clicked in, and is saved as a fog step the players' copy draws.
4. Shift held while drawing with the pen makes the line straight.

## Non-goals

- Walls in any picture preview outside the annotator (a pill's preview, the
  Attachments card). Those show the players' copy, as today.
- A color picker for walls. The storyteller chose one fixed scheme.
- Shift straightening for the fog brush or anything but the pen.
- Wall editing beyond drawing, Undo and the wall eraser (no moving
  corners, no "Delete all walls").
- A separate play-mode UI. The annotator is the same dialog in prep and in
  play; the new tools live in it.

## Anti-goals

- **A wall or anything derived from it reaching a player.** The players'
  copy is rendered on the server from the drawing; walls and the enclosed
  areas' color must be left out of that render entirely, not hidden by
  opacity.
- **A flood that leaks** into a neighboring area through a gap a storyteller
  cannot see. Wall ends snap onto what they touch so there is no gap.
- **A thin strip of fog left along a wall** between two neighboring areas
  that have both been revealed.
- **A reveal that changes after it was made.** Erasing or adding a wall
  later never changes an area already flooded.

## Constraints

- The drawing is an ordered list of steps in `attachment_annotations.ops`,
  validated by `annotationOpSchema` (`lib/annotation-schemas.ts`); new steps
  need no migration, only new schema members. The table's comment in
  `db/custom/create_attachment_annotations_table.sql` lists the step kinds
  and should be brought up to date (a comment only; nothing to run).
- The storyteller's view and the players' copy draw from one tree,
  `annotationTree` (`lib/annotation-drawing.ts`), so the flood must be drawn
  there; walls and the enclosed areas' color are storyteller-only and must
  not appear when the server renders the players' copy.
- One save carries at most `MAX_APPENDED_OPS` steps and about
  `MAX_SAVE_COORDINATES` coordinates (`use-annotation-session.ts`); a flood
  step must fit in one save, so its outline has a cap on points that the
  server enforces too.
- Escape currently closes the annotator (Chakra's dialog).
- The annotator works with touch and a stylus as well as a mouse, so
  nothing needed to finish a step may depend on a keyboard alone. Shift for
  a straight pen line is a shortcut on top of the pen, not something a step
  needs, and has no touch equivalent (my call).
- Today any change saved from the annotator turns the picture on for the
  players and asks for a new players' copy (`sa_saveAnnotation`, the
  glossary's Annotated entry). Walls are not seen by players, so this rule
  changes for them (see What the players see).

## Approaches considered

1. **Fill in the browser and save the outline (chosen).** On a click, the
   annotator draws the walls onto a hidden grid, fills from the clicked cell
   to the walls and the edges, traces the filled cells' outline, and saves
   that outline as the step. The server draws it into the mask like a fog
   rectangle. Holds up with walls that cross, nearly touch, or sit inside
   other areas; the fill is fixed once made.
2. **Work the areas out exactly from the wall lines.** Exact straight
   outlines, but much more geometry code, and its failure cases (walls that
   cross or nearly touch) are leaks.
3. **Save only "flood at this point" and work the area out on every
   render.** Rejected: a reveal would follow later wall edits, so erasing a
   wall mid-session could show the players the next room.

The storyteller picked 1.

## The design

### The wall pen

Decided by the storyteller:

- A click places a corner; each click adds the next. Drawing continues
  until the wall closes or the storyteller presses Escape.
- A click that closes the wall ends it: one on its own first corner, or on
  another wall or the map's edge when the first corner also touches a wall
  or the edge (both ends then touch something).
- Escape on a wall that is not closed closes it with a straight line from
  the last corner toward the first.

My calls:

- **Snapping.** A click within a few screen pixels of the map's edge,
  another wall, or the wall's own first corner lands exactly on it, corners
  before lines. The first corner snaps the same way. The reach is fixed in
  screen pixels whatever the zoom, as the eraser's is (`ERASER_REACH_PX`).
  Snapping is what makes "touches" exact, so the flood cannot leak at a wall's
  end.
- **The closing line on Escape** runs from the last corner toward the first
  and stops at the first wall or edge it meets on the way, when the first
  corner itself touches a wall or the edge. When the first corner is in open
  space, it runs all the way back to it, making a loop. Either way the wall
  ends closed.
- **Too little to close.** Escape on a wall of one corner, or of one side
  whose closing line would only retrace that side, drops the wall in
  progress; nothing is saved.
- **While drawing,** a pale line runs from the last corner to the pointer
  (on a mouse or stylus that hovers), with a small ring where it would snap.
- **Escape and the dialog.** While a wall is being drawn, Escape finishes
  the wall and the annotator stays open; with no wall in progress, Escape
  closes the annotator as today.
- **Touch.** While a wall is being drawn, a Finish wall button shows in the
  toolbar and does what Escape does.
- **Undo while drawing.** Ctrl+Z (and the Undo button) takes back the last
  corner of the wall in progress, and with one corner left drops the wall.
  With no wall in progress, Undo works as today.
- **A wall is one step**, saved when it is finished.
- **Changing tool mid-wall** finishes the wall as Escape would.

### Closed, open, and the colors

- A wall's ends are checked against the map's edge, every other wall, and
  its own sides except the ones meeting at that end. Because ends are
  snapped, the check is to within a fraction of a picture pixel.
- **Shapes, as the storyteller defined them.** Walls that touch anywhere
  (an end on another wall, or two walls crossing) are one shape, and a shape
  is closed only when every wall in it is closed. One open wall therefore
  turns its whole shape pale and takes the enclosed areas' color off the
  areas that shape bounds. Every wall the wall pen finishes is closed, so an
  open wall arises only while one is being drawn, or when a wall another
  one ended on is erased; the pale shape is then the storyteller's sign that
  something needs closing again.
- **The wall in progress** is drawn pale but belongs to no shape until it
  is finished, so starting a new room off a dungeon does not turn the whole
  dungeon pale while it is drawn (my call).
- Walls drawn in an open shape: a pale, bright cyan (around `#a5f3fc`),
  thin. Walls in a closed shape: a deep blue (around `#1d4ed8`), thick.
  Each with a thin contrasting outline (dark under the pale, light under the
  dark) so they read on light and dark pictures alike. Widths are fixed in
  screen pixels, not picture pixels: they are interface, not part of the map.
- Walls are drawn above the fog in the storyteller's view and shown whether
  Show fog is on or off: the storyteller always sees them.
- **The enclosed areas' color.** The storyteller's own fog over an enclosed
  area is drawn in the closed walls' deep blue rather than the fog's color,
  at My fog's opacity. An area that has been revealed has no fog left and so
  no color. With Show fog off, there is no fog and no color, only the walls.
- **The outside.** Areas for the color are worked out from the walls of
  closed shapes only. Every area that touches no edge of the map is
  enclosed. When exactly one area touches an edge, the walls divide nothing
  there: that area is the outside and gets no color. When two or more touch
  an edge, the walls divide the map, so there is no outside and every area is
  enclosed: a wall from edge to edge colors both sides. (Changed at the
  user's request after trying it on a real map, where walls running out to
  the edges left a whole room uncolored under the earlier rule that the
  largest edge-touching area is the outside.)

### The flood

- One more fog tool, beside the brush and the rectangle, under the same
  Reveal/Cover choice.
- A click in an area reveals or covers that area. The area is bounded by
  every wall, open or closed, and by the map's edges. A click with no walls
  at all fills the whole picture, as Clear all or Cover all would, but as a
  flood step.
- A click on a wall itself does nothing.
- The fill reaches under its bounding walls as far as their middle line and
  a little past, so two neighboring areas both revealed leave no fog between
  them, and does not reach the next area's side visibly.
- A room inside a room: a click between them fills the ring between them
  (the outline is an outer ring with holes).
- The step stores the outline: `{ t: "flood", mode, rings }`, each ring a
  flat list of points like a stroke's, drawn as one path with the even-odd
  fill rule, black in the mask for Reveal and white for Cover, exactly as the
  rectangle is. Cover all and Clear all make earlier floods moot, as they do
  every fog step.
- The outline is simplified before it is saved, so a straight wall gives a
  straight edge rather than a staircase.

### The wall eraser, and the other buttons

Decided by the storyteller: walls are entirely separate from annotations,
with an eraser of their own.

- The **wall eraser** is a fog tool beside the wall pen. Dragged over
  walls, it takes each one it passes away whole, as the annotations' eraser
  does marks, with the same reach and the same ring in place of the cursor.
  One drag is one step, `{ t: "wallErase", targets }`, naming the walls by
  their places in the drawing; a drag that touched no wall is no step.
- The **annotations' eraser** stays as it is: it takes away pen marks and
  shapes only, never a wall. `erase` and `wallErase` are separate step
  kinds so the two can never mix; the server refuses a `wallErase` naming
  anything but a wall drawn before it, as `eraseRefusal` does an `erase`
  naming anything but a mark.
- Erase all annotations, Cover all and Clear all leave walls alone.
- Undo takes the last step, a wall, a wall eraser's drag or a flood like
  any other.

### What the players see

Decided by the storyteller: walls are never visible to the players, and
the only change a player sees from the fog tools is fog added or removed.

- A save whose every added step is a wall or a wall eraser's drag, and
  whose every step taken off (by Undo) is one of those, is a **walls-only
  save**. It does not turn the picture on for the
  players, and it does not ask for a new players' copy. A storyteller can
  draw walls on a map the players are looking at unfogged without the fog
  suddenly appearing for them.
- A walls-only save must not leave the players' copy looking behind the
  drawing: where the copy was current before the save, it stays counted as
  current after it (today `behind` compares `player_revision` with
  `revision`), so no refresh loop renders an identical copy.
- A save that mixes walls with anything else is an ordinary save, as today.
- The glossary's Annotated entry says that changes to walls alone are the
  exception to "any change made in the annotator turns it on".

### Opening the annotator

- It opens with the flood in hand when the drawing has walls, and with the
  brush as today when it has none: at the table, a picture with walls is
  usually opened to flood it.

### The straight pen

- While Shift is held during a pen stroke, the stroke runs straight from the
  point where Shift went down (the press point, if Shift was down from the
  start) to the pointer. Letting go of Shift carries on freehand from there;
  pressing it again starts a new straight run.
- The straight run is drawn straight in both the storyteller's view and the
  players' copy (the stroke smoothing in `strokePath` must not curve it).
- The pointer events' own `shiftKey` is read on each move, so no key
  listener is needed.

### Where things go

- `lib/annotation-schemas.ts`: the `wall`, `wallErase` and `flood` steps,
  their limits, and the refusal of a `wallErase` naming anything but a wall.
- A new `lib/fog-walls.ts` (no React): snapping, whether a wall and a shape
  are closed, the closing line, the hidden grid, the fill, the outline
  tracing and simplifying, and the enclosed areas. Tested on its own.
- `lib/annotation-drawing.ts`: the flood in the mask; an optional
  storyteller-only part of the tree (walls and the enclosed areas' color)
  that the server never asks for.
- `lib/annotations.ts`: the two wall colors.
- `components/annotations/annotator-stage.tsx`, `annotator-toolbar.tsx`,
  `annotator-dialog.tsx`, `use-annotation-session.ts`: the tools, Finish
  wall, Escape and Undo while drawing, the tool the annotator opens with, and
  the size of a flood step in a save.
- `GLOSSARY.md`: Wall, Flood, and the annotator's toolbar list.

## Left to the builder

- The hidden grid's size (a long side around 1024 cells is a starting
  point), and how the fill is grown under its walls.
- The outline tracing and simplifying method, and the tolerance.
- The caps on a flood's rings and points, kept inside one save.
- The exact snap reach, wall widths, outline colors, and the icons (Lucide
  has `BrickWall` and `PaintBucket`).
- Labels and tooltips, in the house's words.
- When the enclosed areas are worked out again (on a change of walls, not
  on every pointer move).
