# Stat blocks design

Date: 2026-11-05
Status: approved in conversation, implemented in the same sitting

## Goal

Give an element values in the terms of the game system its story is run in:
an orc's hit points, a rogue's stealth, a ship's hull. A **stat block** is
that: a set of named values laid out the way the system lays them out. Each
game system decides what the stats are (the **definition**, on
`systems.stat_block_definition`); each element then carries its own numbers
(the **block**, on `elements.stat_blocks`, keyed by system id so an element
can carry one per system). `GLOSSARY.md` has the words.

## Decisions

- Definitions live on the `systems` table as jsonb, in groups ("defense",
  "attack", "saves"). "Games" in the request meant the `systems` table.
- Five stat types: **display** holds one fixed value; **pool** a value between
  a min and a max that is spent and refilled; **stack** a count that starts at
  0 and may have a max; **rack** one of an ordered list of values; **computed**
  stores nothing and is evaluated from a formula.
- Every stored stat has one current `value`; a pool adds `min` and `max`, a
  stack an optional `max`.
- **Connected to** feeds a value: the connected stat's value becomes this
  stat's base (a pool's or stack's max, a display's value), and the element
  stores nothing for that part.
- Administrators edit definitions under `/admin/systems`, through a structured
  form with a tab that previews the JSON.
- The prep element form (create and edit) carries the blocks; the run page's
  element panel shows them and changes pools, stacks and racks live.
- An element with no block yet shows the story's system's empty block at the
  table, and the first change creates it.
- Reads are lenient per stat when a definition changes shape; nothing stale
  blocks a save of the element's other fields.
- The prep form writes per system and leaves systems it never showed alone;
  within a system, last write wins against the table.

Out of scope: the players' table, dice rolls off a stat, stat history, moving
a block between systems, and the seeds carrying definitions (see Risks).

## Data shapes

Types in `apps/web/src/lib/stat-blocks.ts`; zod in
`apps/web/src/lib/stat-block-schemas.ts`.

### Definition

```ts
type StatType = "display" | "pool" | "stack" | "rack" | "computed";
type StatDefinition = {
  name: string; // /^[a-z][a-z0-9_]*$/, unique within its group
  label: string; // "" means show the name
  type: StatType;
  rack: (string | number)[]; // rack only; [] otherwise
  connectedTo: string; // "" or "stat" (same group) or "group.stat"; display, pool, stack only
  computedAs: string; // computed only; "" otherwise
};
type StatGroupDefinition = { name: string; label: string; stats: StatDefinition[] };
type StatBlockDefinition = { groups: StatGroupDefinition[] };
```

Arrays, not objects keyed by name: order is the order the block is drawn in.
Every field is present so the editor's field arrays and the jsonb are one
shape. A group may have no stats yet.

`statBlockDefinitionSchema` refines, with the issue on the offending path:
names are identifiers and unique; a rack stat has entries and no other type
does; a computed stat has a formula that parses and no other type does;
`connectedTo` resolves to an existing stat that is not itself, on a display,
pool or stack only; every formula reference resolves, and `.min`/`.max` only
on a pool or stack; no stat ends up depending on itself (only the stats in
the loop are reported). Bounds: 20 groups, 50 stats per group, 50 rack
entries, labels under 60 characters, a formula under 500, the whole
definition under 50 000.

### Block

```ts
type StatValue = {
  value: number | string; // the current value; a rack stores the entry itself
  min?: number; // pool only; 0 when absent
  max?: number; // pool and stack; absent when fed, or on an unbounded stack
};
type StatBlock = Record<string /* group */, Record<string /* stat */, StatValue>>;
type StatBlocks = Record<string /* id_system */, StatBlock>;
```

A rack stores the entry rather than its index, so a rack that grows in the
middle does not shift every element's reading. Reads are lenient per stat
(`fitStatValue`): a stored value that no longer fits its stat is treated as
absent. `statBlockSchema(definition)` checks one system's block strictly for
the forms and actions; `statBlocksSchema(systems)` keys the errors by system.

### Formulas

`stat-formula.ts` is a hand-written recursive-descent parser and evaluator:
numbers, `+ - * /`, unary minus, parentheses, the comparisons `< <= > >= ==
!=` (1 or 0), `floor`, `ceil`, `round`, `abs`, `min`, `max` and
`if(condition, then, else)`, over references `group.stat` or
`group.stat.part` with `part` one of `value`, `min`, `max`. A reference that
is not a number makes the formula `NaN`, which the block shows as "—".

Palladium's Current AR is the first use:
`if(defense.sdc.value < defense.sdc.max / 2, defense.ar.value - 2, defense.ar.value)`.

### Evaluation

`evaluateStatBlock(definition, block)` returns every group and stat in the
definition's order with the value to show and, by type, its min, max, rack
and where a fed part came from, memoised per stat. `emptyStatBlock` gives
the starting values of a block being added.

## Database

`db/migrations/20261105212634_add_stat_blocks.sql` adds both columns, not
null with the empty shape as default;
`20261105212651_set_palladium_stat_block_definition.sql` seeds system -90's
defense, attack and saves. Drizzle mirrors both columns untyped, read through
the schema as `chats.roll` is. `v_scene_elements` is not rebuilt.

## Risks

- `db/seeds/seed_systems.sql` deletes and reinserts every seeded system when
  it is next regenerated, which would drop definitions edited on seeded rows.
  The follow-up is to carry `stat_block_definition` in the seed, or to keep
  definitions on their own rows.
- `stories.id_system` is nullable: a story with no system starts a new
  element with no block.
