# Glossary

The words this project uses for its own ideas, so code, issues and
conversation say the same thing. `docs/agents/domain.md` says how the
engineering skills consume this file.

## Stat blocks

- **Stat block**: an element's values in the terms of a game system, laid out
  the way the system lays them out. Stored on `elements.stat_blocks`, keyed
  by system id, so an element can carry one per system.
- **Stat block definition**: what stats a system has, in which groups, and
  how each behaves. Stored on `systems.stat_block_definition`; edited by
  administrators under Systems.
- **Group**: a named run of stats in a definition ("defense", "attack",
  "saves"), drawn as a heading with its stats under it.
- **Stat**: one named entry in a group. Every stored stat has one current
  `value`.
- **Display**: a stat type holding one fixed value, a number or a word.
- **Pool**: a stat type whose value is spent and refilled between a `min`
  and a `max` (hit points, spell slots).
- **Stack**: a stat type whose value counts up from 0 and may have a `max`
  (exhaustion levels, rage uses).
- **Rack**: a stat type whose value is one entry of an ordered list set by
  the definition ("d4", "d6", "d8"); the stored value is the entry itself.
- **Computed**: a stat type that stores nothing and is worked out from a
  formula over other stats.
- **Connected to**: a stat definition naming another stat whose value feeds
  this one: a display's value, a pool's or stack's max. The element stores
  nothing for the part that is fed.
- **Formula**: the arithmetic a computed stat is worked out with, written
  over references such as `defense.sdc.value`; see
  `apps/web/src/lib/stat-formula.ts`.
- **Repeating group**: a group whose definition names one of its stats as
  the key (`keyedBy`); an element carries any number of rows of it, added and
  removed on the prep form. Palladium's attack group, one row per weapon.
- **Key**: the stat whose value tells one row of a repeating group from
  another; a display or a rack that is not connected, filled on every row
  and unique within the group. The table addresses a row by it.
- **Row**: one set of a repeating group's values on an element, stored as
  one entry of the group's array.
