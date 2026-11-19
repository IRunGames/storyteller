# Stat blocks on elements and scene elements

Status: approved 2026-11-10 (all five questions answered yes). Plan:
`docs/superpowers/plans/2026-11-10-stat-blocks-on-elements.md`.

## Intent

Today an element carries, per system, the whole stat block definition of
that system: every group, filled in on the prep form and changed at the
table. The system's definition is to become a **template** of stat blocks,
each of its groups one **stat block** an element may carry or not. A scene
element gets its own copy of the element's stat blocks when it is linked to
the scene, so what happens in play changes the scene's copy and leaves the
element's values as the baseline it was prepared with. Forms and displays are
generated from the template, honouring each stat's Visible, Sticky and
Format.

## Terms

The glossary's "Stat block" entry changes meaning and is rewritten:

- **Template**: a system's `stat_block_definition`, edited by administrators
  under Systems. Its groups are the stat blocks on offer.
- **Stat block**: one group of the template as carried by an element or a
  scene element, with its values. An element carries any number of them.
- **Scene element's stat blocks**: the copy a scene element holds of the
  element's stat blocks, made when it is linked and changed in play.

## Goals

1. A place to store stat blocks on scene elements, filled from the element
   at link time.
2. A picker on the element and on the scene element that previews the
   template's stat blocks and adds any or all of them.
3. An edit form generated from the template for the stat blocks carried.
4. A display block generated from the template, changeable in play.

## Non-goals

- The players' live table does not show stat blocks. (It does not today.)
- No change to the template editor under Systems.
- No stat blocks for systems other than the story's own, in the UI. See
  the decision below.

## Anti-goals

- A change made at the table must never write to the element's baseline
  when the table is on a scene element.
- Linking an element to a scene a second time, or copying a scene, must
  never lose values the scene already held.

## Data

### scene_elements.stat_blocks

One migration (`just new add_scene_element_stat_blocks`):

```sql
ALTER TABLE scene_elements
    ADD COLUMN IF NOT EXISTS stat_blocks jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN scene_elements.stat_blocks IS
    'This link''s copy of the element''s stat_blocks, taken when it was made and changed in play. Same shape as elements.stat_blocks.';
```

The shape is `elements.stat_blocks`'s: system id, then group name, then stat
name to `{value, min, max}`, a repeating group as an array of rows. Only the
groups the element picked are present. `v_scene_elements` is left as it is;
the blocks are loaded by their own action, as the element's are.

### Copying at link time

Three places make a `scene_elements` row; each copies:

| Where                                              | Copies from                                   |
| -------------------------------------------------- | --------------------------------------------- |
| `run/[id]/actions.ts` new element at the table      | the element's column, empty: that form posts none |
| `run/[id]/actions.ts` link an existing element      | `elements.stat_blocks` of that element        |
| `scenes/[id]/live/actions.ts` copy a scene          | the old link's `stat_blocks`, not the element |

Linking an element already in the scene (`onConflictDoNothing`) leaves the
link's blocks alone.

### Schema change: groups are optional

`statBlockSchema(definition)` requires every group today. It makes each
group optional, so a block holds only the stat blocks picked. A group that
is present is checked as now. `tidyStatBlock` already keeps only present,
known groups. `emptyStatBlock(definition)` gains a sibling
`emptyStatGroup(definition, group)` for picking one block.

## Decisions taken

- **Unit of picking is the group.** "Add any or all of them" reads as the
  template's groups. (Yours to confirm, question 1.)
- **Only the story's system.** The picker, form and display work against
  the story's own system's template. Blocks stored for other systems stay in
  the column untouched and are not drawn; the prep form's "Add a stat block
  for another system" select goes away. (Question 2.)
- **Copy, not reference.** A scene element's values are its own after
  linking; later edits to the element's baseline do not flow into scenes.
- **The glossary changes.** Stat block comes to mean one carried group.
  Recorded as an ADR, since it reverses the earlier meaning.

## Picker

Shown wherever an element or a scene element is edited, when the story's
system's template has at least one group:

- Lists the template's stat blocks not yet carried, each as a small preview
  card: name, label, "Repeats by X" when it does, and its stats as a
  read-only line each (name, type, format, hidden marked).
- An **Add** button per card and an **Add all** button above them.
- Adding puts the group's starting values in (a repeating group starts with
  no rows) and the card leaves the picker.
- A carried stat block has a trashcan; removing asks first through the
  shared delete popover, as every delete does.

## Edit form

Generated from the template for each carried stat block, on the element's
prep form (library edit page and the prep create dialog) and, for a scene
element, behind a pencil in the run page's element panel (see Display
block).

- One section per carried block: its label as the heading, its stats in
  template order.
- Each field is labelled with the stat's **name**; the stat's **label** is a
  tooltip on the field label. (As specified; question 4 notes it is the
  reverse of the usual.)
- **Sticky**: a stat marked Sticky shares a line with the stat that follows
  it. A run of sticky stats and the one after them form one line. The last
  stat of a block, if sticky, has nothing to stick to and stands alone. Lines
  wrap on a narrow screen; a line never breaks between a sticky stat and its
  follower while they fit.
- **Number formats** (`number`, `number +/-`): the text box accepts only
  digits, one leading minus and one decimal point, on typing and on paste,
  with `inputMode="numeric"`. The schema still refuses anything else.
- Hidden stats are on the edit form; Visible governs the display block only.
- Repeating blocks keep today's row table, with the key column first.
- A pool's min and max, a stack's max, keep their fields, as today.

## Display block

Replaces today's `StatBlockView` in the run page's element panel.

- Same sticky line logic as the form.
- A stat with Visible off is left out; a block whose every stat is hidden
  is left out whole.
- Every number is an entry box with an up/down clicker beside it. A click
  writes at once; typing writes when the box is left or Enter is pressed.
  The value comes back clamped, as today.
- A `number +/-` stat shows its sign beside the box at all times, as an
  adornment, "+" or "−", since the box itself holds the digits.
- Pools show value / max; stacks value / max when they have one; racks keep
  ◀ ▶; a display word and a computed stat are text, the computed one dimmer.
- Whose blocks: opened from a pill, the panel shows and changes the **scene
  element's** copy; opened from the library with no link, the **element's**
  own, as today. A pencil in the block heading turns the display block into
  the edit form with the picker, and back.

## Roll type on the template (added 2026-11-10)

A pool or a stack may name a roll: a die icon on the stat's row in the
template editor opens a small popover with 1d6, 2d6, 1d8, 1d10, 1d12, 1d20
and a custom entry taking what `/roll` takes in the chat ("2d6+1"). Stored
as `roll` on the stat definition, "" for none. The custom entry is checked
in the browser the way the chat's roller first checks it: it must contain a
dice group and be under 100 characters; the dice library itself stays on the
server. The display block shows the die beside such a stat with the notation
as its tooltip. What a click does at the table (roll into the chat, say) is
not decided and not built.

## Static stats and open groups (added 2026-11-10)

A stat has a **Static** flag beside Visible and Sticky: the display block
shows it as words, with no box or clicker, for a modifier set on the prep
form and not nudged in play. (A "static number +/-" format was tried first
and taken out in favour of the flag.) Saving the template keeps the groups
that were open open.

## Server actions

Beside the component, as today's are:

- `sa_getSceneElementStatBlocks(idStory, idSceneElement)` and
  `sa_setSceneElementStat(...)`, mirroring the element ones against
  `scene_elements`, publishing the scene change so other tables redraw.
- `sa_addStatBlock` / `sa_removeStatBlock` for element and scene element,
  taking the group name; the prep form keeps posting whole blocks.
- The element ones stay for the library and the prep form.

## Realtime

A change to a scene element's blocks publishes as a change to that element
in that scene, which the run page already listens for.

## Tests

Each piece as the standards say: lib helpers (line layout, number filter,
optional groups), actions (copy at link time for all three sites, scene
element set and clamp, add and remove), components (picker, form lines,
display block lines and clickers), with throwaway fixtures only.

## Left to the builder

- The exact widths and wrapping thresholds of a sticky line.
- Whether "Add all" needs confirmation (no, it is additive and reversible).
- The debounce, if any, on typed values in the display block.

## Questions for the owner

1. Is a "stat block" one group of the template, so an element picks groups?
2. Drop the other-systems select on the prep form, working only against the
   story's system? Stored blocks for other systems would stay but not show.
3. Run panel: display block by default, pencil to the edit form and picker.
   Element opened from the library gets the same against its own blocks. OK?
4. Field label is the stat's name with the label as tooltip, as written.
   Confirm, or the usual way round?
5. The "+/-" sign as an adornment beside the entry box. OK?
