# Repeating groups design

Date: 2026-11-05
Status: approved in conversation

Extends `2026-11-05-stat-blocks-design.md`. The words are in `GLOSSARY.md`.

## Goal

A character in Palladium has several attacks: a long sword with its own
Strike, Parry, Damage and Initiative, a fist with others. One set of values
per group cannot hold that. A **repeating group** is a group whose stats are
the columns of a row, where an element carries any number of rows, each told
apart by the value of one of the group's stats, its **key**.

## Decisions

- A group repeats when its definition names one of its own stats as the key
  (`keyedBy`). There is no separate flag, so the two cannot disagree.
- The key stat is a display or a rack that is not connected. A pool or stack
  is spent and refilled, a computed stat stores nothing, and a fed display is
  the same on every row, so none of them can tell rows apart.
- Every row has the key stat filled, and no two rows of a group share a key
  value. Two values are the same when they read the same as text, so 6 and
  "6" collide, as a rack already matches them.
- A group is plain or repeating, never both. Values that do not repeat sit in
  a plain group beside it: Palladium's hand-to-hand bonuses move from the
  attack group to a new combat group, and the attack group becomes the keyed
  list of weapons.
- Rows are added and removed on the prep form. The table changes a row's
  pools, stacks and racks and does not add, remove or rename rows.
- The table addresses a row by its key value rather than its position, so a
  change arriving after the prep form removed that row is refused rather
  than landing on another.
- A stat in a row may read or connect to a stat in the same row or in any
  plain group. Nothing outside a repeating group may read or connect into
  it, since there is no one value to read. Aggregates (a count of rows, the
  best Strike) are not in this slice.
- An empty block has no rows in a repeating group.

## Data shapes

### Definition

```ts
type StatGroupDefinition = {
  name: string;
  label: string;
  /** "" for a plain group; the name of one of this group's stats for a repeating one. */
  keyedBy: string;
  stats: StatDefinition[];
};
```

`statBlockDefinitionSchema` adds, each on `groups.<i>.keyedBy`:

- the named stat exists in this group;
- it is a display or a rack;
- it is not connected.

And on the referencing stat's field: a formula reference or a connection
from a stat outside a repeating group into it is refused ("attack repeats;
only a stat in attack can read attack.strike"). Inside a repeating group a
reference `attack.strike` means this row's Strike, which the existing
same-group resolution already gives.

The editor shows the key as a select on the group, "Repeats by", listing the
group's eligible stats with "Does not repeat" as the empty choice. Deleting
the key stat leaves `keyedBy` pointing at nothing, which the schema reports
on the group.

### Block

```ts
type StatRow = Record<string /* stat */, StatValue>;
type StatBlock = Record<string /* group */, StatRow | StatRow[]>;
```

A plain group stores one `StatRow` as today; a repeating group stores an
array of them. A row carries nothing but its stats; the key is one of them.

`statBlockSchema(definition)` checks a repeating group as an array of at most
50 rows, each row against the group's stats as a plain group is checked
today, then requires the key on every row to be filled and unique. A
duplicate is reported on the later row's key field, so the form's error
lands on the row the storyteller just typed. Field errors come back keyed
`statBlocks.<idSystem>.<group>.<rowIndex>.<stat>.<part>`: the form's field
array is addressed by position while the rows are being edited, and the
key only identifies a row once it is saved.

Lenient reads, in `readStatBlocks` on the server, per group now as well as
per stat: an object stored where an array is expected (the group was
switched to repeating) reads as no rows; an array where an object is
expected reads as nothing stored; a row whose key does not fit the key stat
is dropped; of two rows with one key the first is kept. The evaluation and
the forms then only ever see rows with distinct, fitting keys, or rows the
storyteller is typing.

### Evaluation

```ts
type EvaluatedRow = { key: number | string | null; stats: EvaluatedStat[] };
type EvaluatedGroup = {
  name: string;
  label: string;
  keyedBy: string;
  stats: EvaluatedStat[]; // a plain group; [] when it repeats
  rows: EvaluatedRow[]; // a repeating group; [] when it is plain
};
```

Each row is evaluated as a plain group is, with the memo key carrying the
row's position so two rows' computed stats do not share one result. A
reference from a row into a plain group evaluates the plain stat once.

`rows` is positional: one entry per row given, in order, with `key` null
when the row's key is empty or does not fit. The prep form draws its rows
from the evaluation of what is being typed, and a row just added has no key
yet while one mid-rename may collide with another, so dropping rows here
would leave the form unable to draw them and would put the field errors,
keyed by position, on the wrong rows. The lenient dropping below happens
once, when a stored block is read on the server.

### Live changes

`sa_setElementStat` gains an optional row key. For a repeating group the
action reads the element's block for that system `FOR UPDATE` inside a
transaction, finds the row by key, applies the clamped patch to that stat
and writes the system's block back; a missing row is refused ("That attack
is no longer there."). A plain group keeps today's single merging statement.
The two paths differ because jsonb has no operator that replaces one element
of an array by the value of one of its fields.

### Forms

The prep form draws a repeating group as a small table: the key column
first, whatever its order in the group, then the other stats, a trashcan on each
row and an "Add <group label>" button beneath. A new row has every field
empty, and the key's required message shows on save until it is typed.
`StatBlockFormValues` gains the array branch, `toStatBlockFields` and
`statBlockFromFields` with it, so computed stats and fed maxes in a row keep
following the typing.

The table's panel draws a repeating group as rows headed by the key value,
each with the same controls a plain group's stats have. The key itself is
not changed at the table.

## Database

No schema change: both columns are jsonb. One migration, by `just new`,
rewrites Palladium's (system -90) definition: defense as it was; a new
`combat` group with `strike`, `parry`, `damage` and `initiative` as displays
(the hand-to-hand bonuses); `attack` keyed by a new `weapon` display ahead
of `strike`, `parry`, `damage` and `initiative`; `saves` as it was. Groups
in that order. Unconditionally, by decision: Palladium's definition is
owned by this seeding until the saves are named, so whatever the Systems
editor holds for -90 is overwritten, unlike the first migration's guarded
write.

The same migration moves what elements already hold: for every element whose
block for system -90 has an object under `attack`, that object becomes
`combat` (when there is no `combat` yet) and `attack` is removed, so
hand-to-hand values typed before this change keep their place rather than
hiding behind the lenient read until the next save drops them. One UPDATE
over `elements` with a `WHERE jsonb_typeof(stat_blocks -> '-90' -> 'attack')
= 'object'`, idempotent by that same test.

Every existing definition's groups gain `keyedBy: ""` on their next save;
until then `readStatBlockDefinition` defaults a missing `keyedBy` to "", so
nothing stored today fails to parse.

## Out of scope

Aggregates over rows, adding or removing rows at the table, renaming a row's
key at the table, moving a row between groups, and carrying definitions in
`db/seeds/seed_systems.sql` (the risk the first design names stands).
