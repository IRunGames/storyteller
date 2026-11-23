# Health indicator: a blood drop on the pill

Status: approved 2026-11-23, built.

## Intent

At the table, the storyteller and the players want to see at a glance how
hurt a creature is, without reading its numbers. A stat block template names
one stat as its **health indicator**, and every pill whose scene element
carries it shows a **blood drop** just before its name: white when the stat
is full, darkening to dark red as it falls to 0.

The drop shows on the storyteller's pills on the run and live pages, and on
the players' pills on the play page (and a scene's preview, which is the
players' table). The players learn the drop's level, never the stat's numbers.

## Decided by the user

- One health indicator per template, not per group: a pill shows at most one
  drop.
- It must be a pool or a stack held to a number.
- Full is white, 0 is dark red.
- Shown on the run, live and play pills.

## Approaches

1. **One per template** (chosen by the user): a single Health indicator
   select above the groups, listing every eligible stat as
   "Stat (Group)". Simplest to read at the table: one drop per pill.
2. **One per group**, beside Repeats by: a pill carrying two such groups
   shows two drops. Rejected as noisier at the table.

## Design

- **Template** (`lib/stat-blocks.ts`, `lib/stat-block-schemas.ts`):
  `healthIndicator?: string`, "group.stat" or "" / absent for none. Checked on
  save, on the select: the group and stat exist, the stat is a pool or stack,
  held to a number, in a group that does not repeat. A rename or retype of
  the chosen stat is refused the same way, not followed.
- **Level** (`healthLevel`): value ÷ max as a whole percent, clamped to
  0–100; 0 is the red end whatever a pool's min. Nothing to show (no drop)
  for a blank value, no max above 0, or a link that does not carry the group.
  Read from the **scene element's copy** of the stats against the **story's
  own system's** template (its story template where there is one,
  `storyTemplate`).
- **Storyteller's pills**: `SceneItem.health` is worked out on the server as
  the pills are read (`db/scene-space.ts`, the scene element actions). In
  play, every stat change on a scene element returns the new level
  (`ElementStatBlock.health`), and the panel that made it (`StatBlockView`:
  the pill's stats, the scene card, the stats pane) hands it to the pill
  through `patchLink`.
- **Players' pills**: the public scene element carries `health` (0–100 or
  null) and nothing else of the stats; it goes out with every upsert the stat
  actions already publish, and with `sa_getPlayScene`. The storyboard gives
  none.
- **The drop** (`components/table-shell/health-drop.tsx`): lucide `Droplet`,
  filled `color-mix(in oklab, white <level>%, run.healthEmpty)`, outlined in
  `fg.muted` so a full white drop shows on the light themes, named
  "Health <level>%" for a screen reader. In the pill's row just before the
  name, outside the name's dropdown.

## Left to the builder

- The exact dark red (`run.healthEmpty`, `#6b0f0f`), and the drop's size.
