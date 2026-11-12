# ADR 0001: A scene element carries a copy of its element's stat blocks

Date: 2026-11-10. Status: accepted.

## Context

An element's stat blocks (`elements.stat_blocks`) were the only values a
story had, filled in on the prep form and changed at the table. Play
changed the element itself: an orc at half hit points in one scene was at
half hit points in every scene, and in the library.

At the same time the meaning of "stat block" moved. A system's definition
had been one block per system that every element carried whole; the
storyteller now picks which of its groups an element carries.

## Decision

- A system's `stat_block_definition` is the **template**; each of its groups
  is a **stat block** an element may carry or not. An element's or scene
  element's `stat_blocks` holds only the groups picked, keyed by system then
  group as before. `statBlockSchema` makes every group optional.
- `scene_elements.stat_blocks` holds the scene element's **own copy**, taken
  from the element when the link is made (`sa_linkSceneElement`), from
  nothing when the element is made at the table, and from the old link when
  a scene is copied. It is a copy, not a reference: later edits to the
  element's baseline do not flow into scenes, and play does not flow back.
- The run page's element panel works on the scene element's copy when it
  was opened from a pill, and on the element's own when opened from the
  library. The shared actions take a `StatBlockHolder` naming which.

## Consequences

- The element's values are the baseline the storyteller prepared, and each
  scene plays its own copy. A link already in the scene keeps its copy when
  the element is linked again; to start a scene element over, remove it from
  the scene and link it afresh.
- Two places can now disagree on an element's hit points, by design. The
  display table and the chat should say whose numbers they show if they
  ever show them.
- The glossary's "Stat block" entry was rewritten (see `GLOSSARY.md`).
