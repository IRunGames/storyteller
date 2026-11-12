# Stat Blocks on Elements and Scene Elements Implementation Plan

Status: done 2026-11-10, in the working tree, not committed. The Format select
has three options and a separate Static flag (added mid-plan at the owner's
ask); the number box's clicker is a ChevronUp/ChevronDown pair rather than
Chakra's NumberInput, so a click and a typed value commit on their own terms.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elements and scene elements carry stat blocks picked from the story's system's template, edited through a generated form and changed in play through a generated display block.

**Architecture:** The template stays `systems.stat_block_definition`; a block stays jsonb keyed by system then group, now holding only the groups picked. Scene elements get the same column, filled from the element when linked. All layout rules (sticky lines, number-only entry, hidden stats, signed numbers) live in `lib/stat-blocks.ts` helpers that both the form and the display block use; the scene element's actions mirror the element's over a shared holder abstraction.

**Tech Stack:** Next.js server actions, Drizzle, dbmate, Chakra UI v3 (NumberInput, Popover, Tooltip), react-hook-form + zod, node:test with testing-library.

**Spec:** `docs/superpowers/specs/2026-11-10-stat-blocks-on-elements-design.md`

## Global Constraints

- Never commit or push; work stays in the tree. No commit steps below.
- Prettier always with `--print-width 100`; run `npx eslint` and `npx tsc --noEmit -p .` on touched files; `just test` at the end of every task.
- Every exported action is `sa_…`; client components import their action directly, never as a prop.
- Every delete or removal asks first through `components/confirm/delete-button.tsx`.
- Tests never sign in as a real account; fixtures are throwaway, removed in `after`.
- Non-obvious decisions carry a prose comment saying why. No analogies.
- Standards: `apps/web/docs/standards.md`. Glossary vocabulary: `GLOSSARY.md`.
- Paths below are under `apps/web/` unless they start with `db/` or `docs/`.

## Review Focus

1. A scene element linked to a scene before this change has `stat_blocks = '{}'`; the panel must show the picker, not crash, and must not fall back to the element's values. Test in Task 4 (`sa_getSceneElementStatBlocks` on an old link).
2. A stored block holding a group the template has since removed, or a stat the group no longer has: the form and display block draw what the template has and ignore the rest, as `tidyStatBlock` does today. Test in Task 3 (optional groups schema keeps only known groups).
3. Sticky on the last stat of a block, and a chain of sticky stats longer than a line: no stat is lost, order is kept. Test in Task 3 (`statLines`).
4. A `number +/-` display whose stored value is a word from before the format was set: the display block shows "—" and the form's box starts empty rather than refusing to render. Test in Task 7.
5. Typing "-" alone, "1.", or pasting "12abc" into a number-only box: the box keeps only what can become a number and the schema still gives "Enter a number." on save. Test in Task 3 (`numberOnly`) and Task 6 (form).

---

### Task 1: Roll type on the template

**Files:**
- Modify: `src/lib/stat-blocks.ts` (StatDefinition, EvaluatedStat)
- Modify: `src/lib/roll.ts` (browser-safe notation check)
- Modify: `src/lib/stat-block-schemas.ts` (schema, read default)
- Modify: `src/app/(app)/(nav)/admin/systems/[id]/system-stat-block-editor.tsx`
- Test: `src/lib/roll.test.ts` (create if absent), `src/lib/stat-block-schemas.test.ts`, `src/app/(app)/(nav)/admin/systems/[id]/system-stat-block-editor.test.tsx`
- Fixtures: every test literal of a stat gains `roll: ""` (the node script pattern used for `sticky`).

**Interfaces:**
- Produces: `StatDefinition.roll: string` ("" none); `EvaluatedStat.roll: string`; `ROLL_PRESETS = ["1d6","2d6","1d8","1d10","1d12","1d20"] as const` in `lib/stat-blocks.ts`; `isRollNotation(text: string): boolean` in `lib/roll.ts`, true when the text is under 100 characters and matches `/(\d*)d(\d+|%|F)/i`.

- [x] **Step 1: Failing tests.** `roll.test.ts`: `isRollNotation("2d6+1")` true, `"1d20"` true, `"12"` false, `"d%"` true, 101 characters false. Schema test: a stat with `roll: "nonsense"` is refused on `groups.0.stats.0.roll` with "That is not a roll I can read. Try 2d6+1."; `roll` on a display is refused with "Only a pool or a stack has a roll."; a stored stat without `roll` reads as `""`. Editor test: a die button "Roll for SDC" exists on the pool row and not on the display row; choosing 1d8 in its popover and saving posts `roll: "1d8"`; choosing Custom and typing "2d6+1" posts that.
- [x] **Step 2: Run them, see them fail.** `npm test -- src/lib/roll.test.ts` and the two others.
- [x] **Step 3: Implement.** Field and docs in the type; `roll: z.string().trim().max(100)` plus the two rules in `checkDefinition`; `withDefaults` fills `roll: ""`; `EMPTY_STAT.roll = ""`. Editor: a `RollPopover` child component (Chakra `Popover` with a `PrepIconButton` trigger using lucide `Dices`, label `Roll for ${statLabel}`), a `NativeSelect` of `<none>`, the presets and `Custom`, and an `Input` shown for Custom; writes `groups.${g}.stats.${s}.roll` through `setValue`. Shown for pool and stack rows only. The trigger is solid (expanded style) while a roll is set, so a set roll is visible closed.
- [x] **Step 4: Run the suite, lint, typecheck; all green.**

### Task 2: scene_elements.stat_blocks and copying at link time

**Files:**
- Create: `db/migrations/<stamp>_add_scene_element_stat_blocks.sql` via `just new add_scene_element_stat_blocks` (SQL as in the spec; `-- migrate:down` drops the column)
- Modify: `src/db/schema.ts:722-760` (add `statBlocks: jsonb("stat_blocks").notNull().default(sql\`'{}'::jsonb\`)` with a comment)
- Modify: `src/app/(app)/run/[id]/actions.ts:988` (new element at the table) and `:1207` (link existing)
- Modify: `src/app/(app)/scenes/[id]/live/actions.ts:215-250` (copy scene)
- Test: `src/app/(app)/run/[id]/actions.stat-blocks.test.ts` (create; db integration in the style of `src/components/stat-blocks/actions.test.ts`), `src/app/(app)/scenes/[id]/live/actions.test.ts`

- [x] **Step 1: Failing tests.** Linking an element whose `stat_blocks` is `{"<sys>":{"stats":{"str":{"value":14}}}}` gives a `scene_elements` row with the same jsonb; linking it again leaves a changed link jsonb alone; copying a scene gives the new link the old link's jsonb, not the element's.
- [x] **Step 2: Run, see them fail (column missing).**
- [x] **Step 3: Migration and `just migrate`; schema column; the three copies.** Link existing: select `elements.statBlocks` in the existing element query and pass it in `.values({...})`. New element at the table: `statBlocks: {}` explicitly (that form posts none). Copy scene: add `statBlocks: sceneElements.statBlocks` to the links select so the spread carries it.
- [x] **Step 4: Run the suite; green.** Also `just test` reports the database guard still passing.

### Task 3: Library helpers

**Files:**
- Modify: `src/lib/stat-blocks.ts`, `src/lib/stat-block-schemas.ts`
- Test: `src/lib/stat-blocks.test.ts`, `src/lib/stat-block-schemas.test.ts`

**Interfaces (produces):**
- `statBlockSchema(definition)`: every group optional; a present group checked as today.
- `emptyStatGroup(definition: StatBlockDefinition, group: StatGroupDefinition): StatRow | StatRow[]` — the group's starting values; `emptyStatBlock` becomes a map over it.
- `carriedGroups(definition, block: StatBlock | undefined): StatGroupDefinition[]` — the template's groups present in the block, template order.
- `statLines<T extends { sticky: boolean }>(stats: T[]): T[][]` — consecutive sticky stats and the stat after them form one line; a trailing sticky stat is its own line.
- `numberOnly(text: string): string` — keeps digits, one leading "-", one "."; `"12abc"` → `"12"`, `"--3"` → `"-3"`, `"1.2.3"` → `"1.23"`, `"-"` → `"-"`.
- `signOf(value: number): "+" | "−"` — "−" (U+2212) below zero, "+" otherwise.

- [x] **Step 1: Failing tests** for each, with the values above; schema: a block with only `combat` parses, `tidyStatBlock` keeps only known groups.
- [x] **Step 2: Run, fail.**
- [x] **Step 3: Implement** with the signatures above; `evaluateStatBlock` is unchanged (it still walks every template group; callers draw `carriedGroups`).
- [x] **Step 4: Suite green.** Existing tests that posted every group still pass.

### Task 4: Scene element actions and shared holder

**Files:**
- Modify: `src/components/stat-blocks/actions.ts`
- Test: `src/components/stat-blocks/actions.test.ts`

**Interfaces (produces):**
- `export type StatBlockHolder = { idStory: number; idElement: number } | { idStory: number; idSceneElement: number }`.
- `sa_getStatBlocks(holder): Promise<ElementStatBlock[] | null>` (replaces `sa_getElementStatBlocks`; the old name stays as a one-line wrapper until Task 8 removes it).
- `sa_setStat(holder, idSystem, group, stat, patch, rowKey?)` (replaces `sa_setElementStat`, same wrapper rule).
- `sa_addStatBlock(holder, idSystem, group: string): Promise<SetElementStatResult>` — writes `emptyStatGroup` under the group key when absent.
- `sa_removeStatBlock(holder, idSystem, group: string): Promise<SetElementStatResult>` — deletes the group key with `#-`.
- `sa_setStatBlocks(holder, blocks: unknown): Promise<{ ok: true } | { ok: false; errors: Record<string,string> }>` — the whole posted block checked by `statBlocksSchema`, for the run panel's edit form.
- Internally: `loadHolder(holder)` returns `{ table, idColumn, id, blocks, storySystem }`; the jsonb UPDATEs take the table from it. A scene element must belong to a scene of the story (join `story_scenes`).
- Publishing: a scene element change calls `publishSceneElement(idStory, idStoryScene, idElement)`; an element change keeps `publishElementChanged`.

- [x] **Step 1: Failing tests:** old link (`{}`) reads as no blocks; set on a scene element changes the link and not the element; add then remove a group on both holders; `sa_setStatBlocks` refuses a word in a number display with `statBlocks.<sys>.<group>.<stat>.value`; another user's story refused.
- [x] **Step 2: Run, fail.**
- [x] **Step 3: Implement.** Factor the two existing jsonb writes over `table`/`idColumn`.
- [x] **Step 4: Suite green.**

### Task 5: Picker

**Files:**
- Create: `src/components/stat-blocks/stat-block-picker.tsx`
- Test: `src/components/stat-blocks/stat-block-picker.test.tsx`

**Interfaces:**
- `StatBlockPicker({ definition, carried, onAdd, onAddAll }: { definition: StatBlockDefinition; carried: string[]; onAdd: (group: string) => void; onAddAll: () => void })`. Draws nothing when every group is carried. Each card: name, label, "Repeats by X" in the editor's style, a line per stat `name · type · format · hidden`, and an "Add <label>" button. "Add all" above the cards when two or more remain.

- [x] **Step 1: Failing test:** two of three groups uncarried → two cards, "Add all" present; one uncarried → no "Add all"; clicking "Add Attack" calls `onAdd("attack")`; a hidden stat's line says "hidden".
- [x] **Step 2–4: fail, implement, green.**

### Task 6: Generated edit form

**Files:**
- Modify: `src/components/stat-blocks/stat-block-fields.tsx` (and split: `stat-field.tsx` for one stat's inputs if the file passes ~400 lines)
- Create: `src/components/stat-blocks/number-only-input.tsx` — `NumberOnlyInput` wrapping Chakra `Input` with `inputMode="numeric"` and `numberOnly` applied on change and paste, taking `register`'s props.
- Modify: `src/components/prep/element-form.tsx` (story system only; `initialBlocks` keeps stored blocks for other systems out of the form and the post)
- Test: `src/components/stat-blocks/stat-block-fields.test.tsx`

- [x] **Step 1: Failing tests:** the section draws one card per carried group of the story's system only and no "another system" select; the picker adds `attack` as an empty repeating group; a field's label text is the stat name and its tooltip the stat label; `statLines` order: a sticky `str` and `mod` render inside one `[data-stat-line]`; typing "12abc" in a `number` display leaves "12"; removing a block asks (DeleteButton with verb "Remove") and then the group is gone from the posted blocks.
- [x] **Step 2: Run, fail.**
- [x] **Step 3: Implement.** Labels: `Field.Label` shows `stat.name`; wrap in `Tooltip` with `stat.label` when the label is non-empty. Lines: `<Flex wrap="wrap" gap="3" data-stat-line>` per `statLines` line, each field `flex="1 1 10rem"`. Remove: `DeleteButton` with `verb="Remove"` and `thing={group label}`; `onDelete` unsets the group in the form (`setValue`) and resolves `{ ok: true }`.
- [x] **Step 4: Suite green.** Element form tests updated for the single-system section.

### Task 7: Display block

**Files:**
- Modify: `src/components/stat-blocks/stat-block-view.tsx`
- Create: `src/components/stat-blocks/stat-number.tsx` — `StatNumber({ value, min, max, sign, onCommit, disabled })` over Chakra `NumberInput.Root` with `NumberInput.Input` and `NumberInput.Control` (increment/decrement); `sign` draws "+"/"−" as a start adornment when given; commits on step, blur and Enter.
- Test: `src/components/stat-blocks/stat-block-view.test.tsx`, `src/components/stat-blocks/stat-number.test.tsx`

- [x] **Step 1: Failing tests:** hidden stat absent; a block whose stats are all hidden absent; sticky pair in one `[data-stat-line]`; HP stepper "+" calls the action with `{ value: 14 }`; typing 10 and Enter sends `{ value: 10 }`; a `number +/-` display shows "+" beside 12 and "−" beside -2; a word in a `number +/-` display shows "—" and no sign; a pool with `roll: "1d8"` shows a die with tooltip "1d8"; the pencil swaps to the form (`StatBlockFields` with the picker) and back.
- [x] **Step 2: Run, fail.**
- [x] **Step 3: Implement.** `StatBlockView` takes `holder: StatBlockHolder` and calls `sa_setStat`; computed and fed values stay text; racks keep ◀ ▶. The edit form inside the panel posts through `sa_setStatBlocks(holder, blocks)` and returns to the display on success.
- [x] **Step 4: Suite green.**

### Task 8: Run panel wiring

**Files:**
- Modify: `src/components/run/run-element-detail.tsx:173` (pass `holder`), `src/components/run/run-element-panel.tsx:307-320`
- Modify: `src/components/stat-blocks/actions.ts` (remove the two wrappers from Task 4)
- Test: `src/components/run/run-element-panel.test.tsx` (existing file; extend)

- [x] **Step 1: Failing tests:** opened from a pill, `ElementStatBlocks` is given `{ idStory, idSceneElement }`; opened from the library (no link), `{ idStory, idElement }`.
- [x] **Step 2–4: fail, implement, green.** Grep for `sa_getElementStatBlocks` and `sa_setElementStat` returns nothing.

### Task 9: Docs

**Files:**
- Modify: `GLOSSARY.md` (Template; Stat block redefined; Scene element's stat blocks; Roll)
- Create: `docs/adr/0001-scene-element-carries-a-copy-of-stat-blocks.md` (context, decision, consequences: copy not reference; baseline untouched by play)
- Modify: `apps/web/docs/standards.md` only if a new pattern needs a named example (NumberOnlyInput, StatBlockHolder); one bullet each.

- [x] **Step 1: Write them.** No tests.
