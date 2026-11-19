# Repeating Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a stat block group repeat, so an element carries any number of rows of that group's stats, each told apart by one designated key stat.

**Architecture:** A group definition gains `keyedBy`, the name of one of its stats; a non-empty value makes the group store an array of rows instead of one record. The lib layer (shapes, evaluation, zod) grows the array branch and every UI that draws a group gets a rows branch beside its record branch. The table addresses a row by its key value through the live action, which for a repeating group reads and rewrites the system's block inside a transaction.

**Tech Stack:** TypeScript, zod 4, react-hook-form (nested `useFieldArray`), Chakra UI v3, Drizzle over node-postgres, dbmate, node:test + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-05-repeating-groups-design.md`, which extends `docs/superpowers/specs/2026-11-05-stat-blocks-design.md`.

## Global Constraints

- Never commit or push: the work stays in the tree until the user asks (CLAUDE.md). The tasks below have no commit steps for that reason.
- Format every touched file with `npx prettier --write --print-width 100 <files>` from `apps/web`; there is no prettier config.
- Comments say why in prose, no analogies; every exported server action is `sa_…`; client components import their actions directly.
- Run one test file with, from `apps/web`: `node --import tsx --disable-warning=ExperimentalWarning --experimental-test-module-mocks --import ./src/test/setup.ts --test <file>`. Database tests skip without `DATABASE_URL`; the whole suite is `just test` from the repo root.
- A one-time migration is made with `just new <name>` from the repo root and written in `db/migrations`.
- Bounds from the spec: at most 50 rows in a repeating group; a key stat is a display or a rack that is not connected.
- Copy from the spec: duplicate key message "Another row has this <key label>."; missing key message "Every row needs one."; a change to a row that is gone is refused with "That <group label> is no longer there."; a reference into a repeating group from outside it is refused with "<group> repeats; only a stat in <group> can read <group>.<stat>."
- The Palladium rewrite is unconditional (user's decision).

## Review Focus

- A key typed as " Sword " or "sword" beside "Sword": the display value is trimmed before comparing, and the comparison is case-sensitive, so "sword" and "Sword" are two rows. Pinned in Task 3.
- A group switched to repeating while elements still hold an object under it: the table and the form show no rows and nothing throws; the old object is dropped on the next save. Pinned in Task 1.
- A + at the table arriving after the prep form removed that row: refused with the message, and no other row changes. Pinned in Task 6.
- A rack as the key, with two rows on the same entry, or one row storing 6 and another "6": refused as a duplicate. Pinned in Task 3.
- A computed stat in a row reading a plain group (`attack.strike.value + combat.strike.value`) evaluates per row, while a plain stat reading into the repeating group is refused in the editor. Pinned in Tasks 1 and 2.

---

### Task 1: Shapes, evaluation and form conversion

**Files:**
- Modify: `apps/web/src/lib/stat-blocks.ts`
- Test: `apps/web/src/lib/stat-blocks.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `StatGroupDefinition` gains `keyedBy: string` ("" for plain).
  - `type StatRow = Record<string, StatValue>`; `type StatBlock = Record<string, StatRow | StatRow[]>`.
  - `isRepeating(group: StatGroupDefinition): boolean` (`keyedBy !== ""`).
  - `rowKeyText(value: unknown): string | null` — a finite number or a non-empty trimmed string as text, else null.
  - `rowsOf(group: StatGroupDefinition, stored: StatRow | StatRow[] | undefined): StatRow[]` — the array when the group repeats and an array is stored, else `[]`.
  - `type EvaluatedRow = { key: number | string | null; stats: EvaluatedStat[] }`; `EvaluatedGroup` gains `keyedBy: string` and `rows: EvaluatedRow[]` (`stats` is `[]` when the group repeats, `rows` is `[]` when it is plain).
  - `evaluateStatBlock(definition, block)` unchanged in signature; positional rows.
  - `emptyStatBlock(definition)` gives `[]` for a repeating group.
  - `emptyStatRowFields(group: StatGroupDefinition): Record<string, StatFieldValues>` — every stat `{ value: "", min: "", max: "" }` except a rack, whose value is its first entry as text, so the row's select shows what it posts.
  - `tidyStatBlock(definition, block): StatBlock` — the lenient per-group read: an array under a plain group becomes nothing stored for that group; an object under a repeating group becomes `[]`; a row whose key does not fit the key stat (`fitStatValue` on the key stat gives null, or `rowKeyText` null) is dropped; of two rows with one key text the first is kept.
  - `StatBlockFormValues` becomes `Record<string, Record<string, Record<string, StatFieldValues> | Record<string, StatFieldValues>[]>>`; `toStatBlockFields` tidies first and gives an array of row fields for a repeating group; `statBlockFromFields` reads an array back into rows.

- [ ] **Step 1: Write the failing tests**

Add to the fixture definition in `stat-blocks.test.ts` a third group that repeats, and every group of the fixture gets `keyedBy` (`""` on the two that exist):

```ts
{
  name: "attack",
  label: "Attack",
  keyedBy: "weapon",
  stats: [
    stat({ name: "weapon", type: "display", label: "Weapon" }),
    stat({ name: "strike", type: "display", label: "Strike" }),
    stat({ name: "total", type: "computed", computedAs: "attack.strike.value + stats.str.value" }),
    stat({ name: "uses", type: "pool", connectedTo: "strike" }),
  ],
},
```

and to the block:

```ts
attack: [
  { weapon: { value: "Sword" }, strike: { value: 4 }, uses: { value: 2, min: 0 } },
  { weapon: { value: "Fist" }, strike: { value: 1 }, uses: { value: 0, min: 0 } },
],
```

Tests, in `describe("evaluateStatBlock")` and new describes:

```ts
it("draws a repeating group as rows in order, each worked out on its own", () => {
  const attack = groups.find((g) => g.name === "attack")!;
  expect(attack.keyedBy).toBe("weapon");
  expect(attack.stats).toEqual([]);
  expect(attack.rows.map((row) => row.key)).toEqual(["Sword", "Fist"]);
  const total = (i: number) => attack.rows[i].stats.find((s) => s.name === "total")!.value;
  expect(total(0)).toBe(18); // 4 + 14
  expect(total(1)).toBe(15);
  const uses = attack.rows[0].stats.find((s) => s.name === "uses")!;
  expect(uses.max).toBe(4);
  expect(uses.maxFrom).toBe("Strike");
});

it("keeps a row whose key is empty or wrong, with a null key, so a form can draw it", () => {
  const rows = evaluateStatBlock(definition, {
    ...block,
    attack: [{ strike: { value: 2 } }, { weapon: { value: "" }, strike: { value: 3 } }],
  }).find((g) => g.name === "attack")!.rows;
  expect(rows.map((row) => row.key)).toEqual([null, null]);
  expect(rows[1].stats.find((s) => s.name === "strike")!.value).toBe(3);
});

it("shows no rows for an object under a repeating group, and nothing for an array under a plain one", () => {
  const groups = evaluateStatBlock(definition, {
    ...block,
    attack: { strike: { value: 4 } } as never,
    stats: [{ str: { value: 1 } }] as never,
  });
  expect(groups.find((g) => g.name === "attack")!.rows).toEqual([]);
  expect(find(groups, "stats", "str").value).toBeNull();
});

describe("tidyStatBlock", () => {
  it("drops rows with no usable key and keeps the first of two with one key", () => {
    const tidy = tidyStatBlock(definition, {
      ...block,
      attack: [
        { weapon: { value: "Sword" }, strike: { value: 4 } },
        { strike: { value: 9 } },
        { weapon: { value: " Sword " }, strike: { value: 5 } },
        { weapon: { value: "Fist" }, strike: { value: 1 } },
      ],
    });
    expect(tidy.attack).toEqual([
      { weapon: { value: "Sword" }, strike: { value: 4 } },
      { weapon: { value: "Fist" }, strike: { value: 1 } },
    ]);
  });

  it("turns an object under a repeating group into no rows, and drops an array under a plain one", () => {
    const tidy = tidyStatBlock(definition, {
      attack: { strike: { value: 4 } } as never,
      stats: [{ str: { value: 1 } }] as never,
    });
    expect(tidy.attack).toEqual([]);
    expect(tidy.stats).toBeUndefined();
  });
});

describe("rowKeyText", () => {
  it("reads a number or a word as text, and nothing for the rest", () => {
    expect(rowKeyText(6)).toBe("6");
    expect(rowKeyText(" Sword ")).toBe("Sword");
    expect(rowKeyText("")).toBeNull();
    expect(rowKeyText("   ")).toBeNull();
    expect(rowKeyText(null)).toBeNull();
    expect(rowKeyText(NaN)).toBeNull();
  });
});
```

Extend the existing `emptyStatBlock` test to expect `attack: []`, and the `toStatBlockFields and statBlockFromFields` test to round-trip the two rows as an array of field records, with `emptyStatRowFields(attackGroup)` giving `{ weapon: {value:"",min:"",max:""}, strike: {...""}, total: {...""}, uses: {...""} }`, and, for a group with a rack, the rack's first entry as its value text.

- [ ] **Step 2: Run the file and see the new tests fail**

Run: `node --import tsx --disable-warning=ExperimentalWarning --experimental-test-module-mocks --import ./src/test/setup.ts --test src/lib/stat-blocks.test.ts`
Expected: FAIL, type errors on `keyedBy` and missing exports.

- [ ] **Step 3: Implement the shapes and helpers in `lib/stat-blocks.ts`**

Add `keyedBy` to `StatGroupDefinition`, the `StatRow` type, `isRepeating`, `rowKeyText`, `rowsOf`, `emptyStatRowFields`, `tidyStatBlock`, with the comments saying why rows are positional in the evaluation and tidied only on a read (spec, Evaluation section).

- [ ] **Step 4: Extend `evaluateStatBlock`**

Give the inner `evaluate` a row context: `evaluate(groupName, stat, row?: { index: number; stored: StatRow })`. The memo key is `${group}.${stat}` for a plain stat and `${group}[${index}].${stat}` for a row's. A reference or connection from a row to its own group reads the same row; a reference from anywhere to a *different* repeating group yields null (the definition schema refuses it, this just keeps the walk safe). A repeating group's result is `{ name, label, keyedBy, stats: [], rows }`, each row's `key` from `fitStatValue(keyStat, false, stored[keyedBy])` then `rowKeyText`, keeping the stored number or string when it fits, null otherwise. A plain group whose stored value is an array evaluates as nothing stored.

- [ ] **Step 5: Extend `emptyStatBlock`, `toStatBlockFields`, `statBlockFromFields`**

`toStatBlockFields(definition, tidyStatBlock(definition, block))`; for a repeating group map each evaluated row to its field record. `statBlockFromFields` reads an array as rows and an object as before.

- [ ] **Step 6: Run the file, and the whole unit pass**

Run the file; Expected: PASS. Then `npx tsc --noEmit -p . 2>&1 | grep -v '\.next/types'` from `apps/web` and fix every caller the `keyedBy` field and `StatBlock` union broke (the fixtures in `stat-block-schemas.test.ts`, `components/stat-blocks/*.test.ts*`, `app/(app)/(nav)/admin/systems/[id]/system-stat-block-editor.test.tsx`, `app/(app)/(nav)/admin/systems/actions.test.ts` all need `keyedBy: ""` on their groups; code that indexes `block[group][stat]` needs the row branch, which Tasks 3, 5, 6 and 7 write, so for now narrow with `rowsOf` or a `typeof` check only where the compiler stops).

---

### Task 2: Definition rules for the key

**Files:**
- Modify: `apps/web/src/lib/stat-block-schemas.ts` (`statGroupDefinitionSchema`, `checkDefinition`, `statBlockDefinitionFormSchema`, `readStatBlockDefinition`)
- Test: `apps/web/src/lib/stat-block-schemas.test.ts`

**Interfaces:**
- Consumes: `isRepeating`, `canConnect`, `findStat`, `resolveConnection` from Task 1.
- Produces: `statGroupDefinitionSchema` accepts `keyedBy` (trimmed, at most 40 characters); a group posted without `keyedBy` parses with `""` (a `z.preprocess` on the group that fills a missing `keyedBy`), so every stored definition still reads.

- [ ] **Step 1: Write the failing tests**

Give the fixture's groups `keyedBy: ""` and add a repeating `attack` group keyed by `weapon` (display) with `strike` (display), `die` (rack `["d4","d6"]`), `sides` (rack `[4, 6]`) and `uses` (pool connected to `strike`); the Task 3 tests read the same fixture. Tests in `describe("statBlockDefinitionSchema")`:

```ts
it("lets a group repeat by one of its displays or racks that is not connected", () => {
  expect(statBlockDefinitionSchema.safeParse(definition).success).toBe(true);
  const keyedByRack = withKey(definition, "attack", "die");
  expect(statBlockDefinitionSchema.safeParse(keyedByRack).success).toBe(true);
});

it("refuses a key that is not there, is a pool, stack or computed stat, or is fed", () => {
  expect(errorsOf(statBlockDefinitionSchema.safeParse(withKey(definition, "attack", "nope")))).toEqual({
    "groups.2.keyedBy": "There is no stat nope in this group.",
  });
  expect(errorsOf(statBlockDefinitionSchema.safeParse(withKey(definition, "combat", "mana")))).toEqual({
    "groups.1.keyedBy": "A key is a display or a rack; a pool, stack or computed stat cannot tell rows apart.",
  });
  expect(errorsOf(statBlockDefinitionSchema.safeParse(withKey(definition, "combat", "fed_label")))).toEqual({
    "groups.1.keyedBy": "A fed display is the same on every row; choose a stat the row holds itself.",
  });
});

it("refuses a reference or a connection into a repeating group from outside it", () => {
  const outside = withStat(definition, "stats", stat({ name: "best", type: "computed", computedAs: "attack.strike.value" }));
  expect(errorsOf(statBlockDefinitionSchema.safeParse(outside))).toEqual({
    "groups.0.stats.2.computedAs": "attack repeats; only a stat in attack can read attack.strike.",
  });
  const connected = withStat(definition, "stats", stat({ name: "shown", type: "display", connectedTo: "attack.strike" }));
  expect(errorsOf(statBlockDefinitionSchema.safeParse(connected))).toEqual({
    "groups.0.stats.2.connectedTo": "attack repeats; only a stat in attack can read attack.strike.",
  });
});

it("lets a stat in a repeating group read its own row and any plain group", () => {
  const inside = withStat(definition, "attack", stat({ name: "total", type: "computed", computedAs: "attack.strike.value + stats.str.value" }));
  expect(statBlockDefinitionSchema.safeParse(inside).success).toBe(true);
});

it("reads a stored group with no keyedBy as plain", () => {
  const stored = { groups: [{ name: "stats", label: "", stats: [] }] };
  expect(readStatBlockDefinition(stored)).toEqual({ groups: [{ name: "stats", label: "", keyedBy: "", stats: [] }] });
});
```

`withKey` and `withStat` are small fixture helpers in the test file; `fed_label` is a display in `combat` connected to `stats.str`, added to the fixture.

- [ ] **Step 2: Run the file and see the new tests fail**

Expected: FAIL on `keyedBy` unknown-key stripping and missing messages.

- [ ] **Step 3: Implement**

In `statGroupDefinitionSchema`, `keyedBy: z.string().trim().max(40, "Keep the key under 40 characters.")`, wrapped so a missing key reads as `""`. In `checkDefinition`, after the stats loop of a group: when `group.keyedBy !== ""`, find the stat; push the three messages above on `["groups", g, "keyedBy"]` as each case applies (missing; wrong type; `resolveConnection(definition, group.name, key.connectedTo) !== null`). In the per-stat checks, where a formula reference or a connection resolves to a target, add: if the target's group repeats and is not this group, push the "repeats; only a stat in" message on that field and do not record the dependency. Update `statBlockDefinitionFormSchema`'s group extension so `keyedBy` passes through.

- [ ] **Step 4: Run the file**

Expected: PASS, including every earlier test with `keyedBy: ""` on the fixture.

---

### Task 3: Block schema and loose read for rows

**Files:**
- Modify: `apps/web/src/lib/stat-block-schemas.ts` (`statBlockSchema`, `looseBlocksSchema`)
- Test: `apps/web/src/lib/stat-block-schemas.test.ts`

**Interfaces:**
- Consumes: `isRepeating`, `rowKeyText`, `statLabel` from Task 1.
- Produces: `statBlockSchema(definition)` accepts an array of at most 50 rows for a repeating group, errors keyed `[group, rowIndex, stat, part]`; `readStatBlocks` keeps an array of records under a group.

- [ ] **Step 1: Write the failing tests**

```ts
describe("statBlockSchema with a repeating group", () => {
  const schema = statBlockSchema(definition);
  const plain = { stats: { str: { value: "14" } }, combat: { hp: { value: "9" }, mana: { value: 3, min: 1, max: 5 }, rage: { value: "0" }, die: { value: "d4" }, fed_label: {} } };

  it("takes rows, each checked as the group's stats are, with the key filled and distinct", () => {
    const parsed = schema.safeParse({ ...plain, attack: [
      { weapon: { value: " Sword " }, strike: { value: "4" }, die: { value: "d6" } },
      { weapon: { value: "sword" }, strike: { value: "1" }, die: { value: "d4" } },
    ] });
    expect(parsed.success).toBe(true);
    expect((parsed.data as StatBlock).attack).toEqual([
      { weapon: { value: "Sword" }, strike: { value: 4 }, die: { value: "d6" } },
      { weapon: { value: "sword" }, strike: { value: 1 }, die: { value: "d4" } },
    ]);
  });

  it("refuses an empty key and a duplicate, on the later row's key field", () => {
    const result = schema.safeParse({ ...plain, attack: [
      { weapon: { value: "Sword" }, strike: { value: "4" }, die: { value: "d6" } },
      { weapon: { value: "" }, strike: { value: "1" }, die: { value: "d6" } },
      { weapon: { value: "Sword" }, strike: { value: "2" }, die: { value: "d6" } },
    ] });
    expect(errorsOf(result)).toEqual({
      "attack.1.weapon.value": "Every row needs one.",
      "attack.2.weapon.value": "Another row has this Weapon.",
    });
  });

  it("treats 6 and \"6\" as one key when the key is a rack", () => {
    // sides is a rack [4, 6] in the attack fixture, beside die
    const schema = statBlockSchema(withKey(definition, "attack", "sides"));
    const result = schema.safeParse({ ...plain, attack: [
      { weapon: { value: "a" }, strike: { value: 1 }, die: { value: "d4" }, sides: { value: 6 } },
      { weapon: { value: "b" }, strike: { value: 1 }, die: { value: "d4" }, sides: { value: "6" } },
    ] });
    expect(errorsOf(result)).toEqual({ "attack.1.sides.value": "Another row has this sides." });
  });

  it("refuses an object where rows are expected, rows where one record is, and more than 50 rows", () => {
    expect(errorsOf(schema.safeParse({ ...plain, attack: {} }))).toHaveProperty("attack");
    expect(errorsOf(schema.safeParse({ ...plain, stats: [] }))).toHaveProperty("stats");
    const many = Array.from({ length: 51 }, (_, i) => ({ weapon: { value: `w${i}` }, strike: { value: 1 }, die: { value: "d4" } }));
    expect(errorsOf(schema.safeParse({ ...plain, attack: many }))).toEqual({ attack: "Keep it under 50 rows." });
  });

  it("holds a row's pool to the max its own row feeds", () => {
    // uses is a pool in the attack fixture connected to strike
    const result = schema.safeParse({ ...plain, attack: [
      { weapon: { value: "Sword" }, strike: { value: "4" }, die: { value: "d4" }, sides: { value: 4 }, uses: { value: "5", min: "" } },
    ] });
    expect(errorsOf(result)).toEqual({ "attack.0.uses.value": "That is above the max of 4." });
  });
});
```

And in `describe("readStatBlocks")`: a block with an array of records under a group comes back as it is; an array holding a non-object is dropped to `{}` for the system as the loose schema fails.

- [ ] **Step 2: Run the file and see the new tests fail**

- [ ] **Step 3: Implement**

In `statBlockSchema`: `const row = z.object(stats)`; for a repeating group `z.array(row).max(50, "Keep it under 50 rows.").superRefine(...)` as the spec's sketch, comparing `rowKeyText(stored[keyedBy]?.value)` and using `statLabel(keyStat)` in the duplicate message. The outer `superRefine` walks `group.rows` as well as `group.stats` and reports on `[group.name, index, stat.name, "value"]`. In `looseBlocksSchema`, the group level becomes `z.union([recordOfRecords, z.array(recordOfRecords)])`.

- [ ] **Step 4: Run the file, then both lib test files**

Expected: PASS.

---

### Task 4: Administrators choose the key

**Files:**
- Modify: `apps/web/src/app/(app)/(nav)/admin/systems/[id]/system-stat-block-editor.tsx`
- Test: `apps/web/src/app/(app)/(nav)/admin/systems/[id]/system-stat-block-editor.test.tsx`

**Interfaces:**
- Consumes: `statBlockDefinitionFormSchema` with `keyedBy` (Task 2); `canConnect`.
- Produces: a `NativeSelect` labelled "Repeats by" on each group card with option "Does not repeat" (value `""`) and one option per stat of the group whose type is display or rack and whose `connectedTo` is `""`, registered at `groups.${g}.keyedBy`; `groups.append` passes `keyedBy: ""`.

- [ ] **Step 1: Write the failing tests**

```ts
it("lets a group repeat by one of its displays or racks that is not connected", async () => {
  // fixture: a group with ar (display), sdc (pool), die (rack), shown (display connected to ar)
  const select = screen.getByRole("combobox", { name: "Repeats by" });
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
    "Does not repeat", "ar", "die",
  ]);
  await user.selectOptions(select, "ar");
  await user.click(screen.getByRole("button", { name: "Save stat block" }));
  await waitFor(() => expect(sa_setSystemStatBlockDefinition.mock.calls.length).toBe(1));
  expect(sa_setSystemStatBlockDefinition.mock.calls[0].arguments[1].groups[0].keyedBy).toBe("ar");
});

it("says on the group when its key stat is gone", async () => {
  // start with keyedBy "ar", remove the ar stat, save
  expect(await screen.findByText("There is no stat ar in this group.")).toBeInTheDocument();
  expect(sa_setSystemStatBlockDefinition.mock.calls.length).toBe(0);
});
```

The option label is the stat's label when it has one, else its name; the fixture's stats have no labels so the names show.

- [ ] **Step 2: Run the file and see them fail**

- [ ] **Step 3: Implement**

In the group card header add the select, reading the group's stats with `useWatch({ control, name: \`groups.${g}.stats\` })` to build the options (the `StatRows` child already watches them; lift that watch to the card or watch twice, whichever keeps `StatRows` as it is). Show `errors.groups?.[g]?.keyedBy?.message` under it. Update the intro text to mention that a group that repeats by one of its stats holds a list of rows on each element.

- [ ] **Step 4: Run the editor test file and the admin systems actions test**

Expected: PASS (the actions test needs `keyedBy: ""` in its fixture from Task 1 step 6 and otherwise passes unchanged).

---

### Task 5: Rows on the prep form

**Files:**
- Modify: `apps/web/src/components/stat-blocks/stat-block-fields.tsx`
- Modify: `apps/web/src/lib/element-schemas.ts` (only if `ElementFormInput["statBlocks"]` needs the union spelled out beyond Task 1's `StatBlockFormValues`)
- Test: `apps/web/src/components/stat-blocks/stat-block-fields.test.tsx`

**Interfaces:**
- Consumes: `EvaluatedGroup.rows`, `isRepeating`, `emptyStatRowFields`, `StatBlockFormValues` (Task 1); `statBlockSchema` row errors (Task 3).
- Produces: `RepeatingGroupFields` (module-local) with `useFieldArray({ control, name: \`statBlocks.${key}.${group.name}\` })`, a table whose first column is the key stat, then the other stats in definition order, a trashcan per row labelled `Remove ${keyText || "row"}` and a button `Add ${group.label}` beneath; `SystemCard` takes `control`.

- [ ] **Step 1: Write the failing tests**

Give the Palladium fixture in the test an `attack` group labelled "Attack", keyed by `weapon` (display, label "Weapon"), with `strike` (display, "Strike") and `total` (computed, "Total", `attack.strike.value + defense.ar.value`), and `keyedBy: ""` on the others. Tests:

```ts
it("adds a row to a repeating group, keys it, works its computed stat out, and posts the rows", async () => {
  // new element; the attack group starts with no rows and an "Add Attack" button
  await user.click(screen.getByRole("button", { name: "Add Attack" }));
  const row = screen.getAllByRole("row")[1]; // header, then the one row
  await user.type(within(row).getByLabelText("Weapon"), "Sword");
  await user.type(within(row).getByLabelText("Strike"), "4");
  await user.type(screen.getByLabelText("AR"), "10");
  expect(within(row).getByTestId("computed-Total")).toHaveTextContent("14");
  await user.click(screen.getByRole("button", { name: "Create element" }));
  await waitFor(() => expect(sa_createElement.mock.calls.length).toBe(1));
  expect(sa_createElement.mock.calls[0].arguments[1].statBlocks["-90"].attack).toEqual([
    { weapon: { value: "Sword", min: "", max: "" }, strike: { value: "4", min: "", max: "" }, total: { value: "", min: "", max: "" } },
  ]);
});

it("refuses two rows with one key in the browser, on the later row, and removes a row by its trashcan", async () => {
  await user.click(screen.getByRole("button", { name: "Add Attack" }));
  await user.click(screen.getByRole("button", { name: "Add Attack" }));
  const rows = () => screen.getAllByRole("row").slice(1);
  await user.type(within(rows()[0]).getByLabelText("Weapon"), "Sword");
  await user.type(within(rows()[1]).getByLabelText("Weapon"), "Sword");
  await user.click(screen.getByRole("button", { name: "Create element" }));
  expect(await screen.findAllByText("Another row has this Weapon.")).toHaveLength(1);
  expect(within(rows()[1]).getByText("Another row has this Weapon.")).toBeInTheDocument();
  expect(sa_createElement.mock.calls.length).toBe(0);
  await user.click(screen.getAllByRole("button", { name: "Remove Sword" })[1]);
  expect(rows()).toHaveLength(1);
});

it("starts an edit from stored rows, dropping one whose key is gone", () => {
  renderWithProviders(
    <ElementForm
      idStory={-15}
      systems={systems}
      element={{
        ...storedElement,
        statBlocks: { "-90": { ...palladiumBlock, attack: [
          { weapon: { value: "Sword" }, strike: { value: 4 } },
          { strike: { value: 9 } },
        ] } },
      }}
    />,
  );
  expect(screen.getAllByRole("row")).toHaveLength(2); // the header and Sword
  expect(screen.getByDisplayValue("Sword")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("9")).toBeNull();
});
```

Keep the existing tests passing; the "Create element" button name, the `computed-` test ids, `storedElement` and `palladiumBlock` follow the current file's edit test (line 200).

- [ ] **Step 2: Run the file and see them fail**

- [ ] **Step 3: Implement**

In `SystemCard`, for `group.keyedBy !== ""` render `RepeatingGroupFields` instead of the `SimpleGrid`. Use Chakra `Table.Root size="sm"` with a header row of stat labels; each body row renders `StatField` per stat with `path` `statBlocks.${key}.${group.name}.${i}.${stat.name}` and errors from `errorsAt?.[group.name]?.[i]?.[stat.name]`; the key stat's cell first. Inputs inside a table cell need an `aria-label` of the stat label since `Field.Label` is in the header: pass `labelledInline` or similar so `StatField` uses `aria-label` and no visible label when drawn in a row. The group-level error (`errorsAt?.[group.name]?.root` or `.message` for the 50-row cap) shows under the table. `StatPath` widens to allow the row index segment.

- [ ] **Step 4: Run the file**

Expected: PASS.

---

### Task 6: The live action addresses a row

**Files:**
- Modify: `apps/web/src/components/stat-blocks/actions.ts`
- Test: `apps/web/src/components/stat-blocks/actions.test.ts`

**Interfaces:**
- Consumes: `rowsOf`, `rowKeyText`, `tidyStatBlock`, `isRepeating` (Task 1).
- Produces: `sa_setElementStat(idStory, idElement, idSystem, group, stat, patch, rowKey?: string)`; `rowKey` is the row's key as text (`rowKeyText`), required when the group repeats (refused with "That stat is not one that can be set." when missing or given for a plain group); `evaluated()` tidies the block before evaluating.

- [ ] **Step 1: Write the failing tests**

Extend the fixture definition with a repeating `attack` group (`weapon` display key, `strike` display, `uses` pool connected to `strike`), `keyedBy: ""` on the others. Store two rows on the fixture element through a direct update at the start of the first new test: Sword with strike 4 and uses `{ value: 2, min: 0 }`, Fist with strike 1 and uses `{ value: 0, min: 0 }`. Tests:

```ts
it("changes one row's stat by its key and leaves the other rows and groups alone", async () => {
  const result = await actions.sa_setElementStat(myStory, idElement, idSystem, "attack", "uses", { value: 9 }, "Sword");
  expect(result.ok).toBe(true);
  const attack = (result as { ok: true; block: ElementStatBlock }).block.groups.find((g) => g.name === "attack")!;
  expect(attack.rows.map((row) => row.key)).toEqual(["Sword", "Fist"]);
  expect(attack.rows[0].stats.find((s) => s.name === "uses")!.value).toBe(4); // clamped to the row's strike
  expect(attack.rows[1].stats.find((s) => s.name === "uses")!.value).toBe(0);
  const rows = ((await stored()) as StatBlocks)[String(idSystem)].attack as StatRow[];
  expect(rows[1]).toEqual({ weapon: { value: "Fist" }, strike: { value: 1 }, uses: { value: 0, min: 0 } });
});

it("refuses a change to a row that is no longer there, changing nothing", async () => {
  const result = await actions.sa_setElementStat(myStory, idElement, idSystem, "attack", "uses", { value: 1 }, "Axe");
  expect(result).toEqual({ ok: false, error: "That Attack is no longer there." });
});

it("refuses a change to the key stat, and a row key on a plain group", async () => {
  expect((await actions.sa_setElementStat(myStory, idElement, idSystem, "attack", "weapon", { value: "Axe" }, "Sword")).ok).toBe(false);
  expect((await actions.sa_setElementStat(myStory, idElement, idSystem, "stats", "str", { value: 1 }, "Sword")).ok).toBe(false);
});
```

- [ ] **Step 2: Run the file and see them fail**

Run with `DATABASE_URL` set (`just test` loads it; the direct command needs the env from `apps/web/.env*`, which `loadEnvConfig` in the test reads).

- [ ] **Step 3: Implement**

`clamped(system, groupName, statName, block, patch, rowKey?)`: for a repeating group find the row index whose `rowKeyText(row[keyedBy]?.value) === rowKey`, refuse the key stat itself, and evaluate against that row's `EvaluatedStat`. In `sa_setElementStat`, branch: plain group keeps the single merging UPDATE; repeating group runs `db.transaction(async (tx) => { SELECT stat_blocks FROM elements WHERE … FOR UPDATE; tidy; find the row (null → refuse with the group label); set the stat; UPDATE elements SET stat_blocks = stat_blocks || jsonb_build_object(key, <system block JSON>) })`. The comment says why the two paths differ (spec, Live changes). `evaluated()` calls `tidyStatBlock` first.

- [ ] **Step 4: Run the file**

Expected: PASS, the earlier tests unchanged.

---

### Task 7: Rows at the table

**Files:**
- Modify: `apps/web/src/components/stat-blocks/stat-block-view.tsx`
- Test: `apps/web/src/components/stat-blocks/stat-block-view.test.tsx`

**Interfaces:**
- Consumes: `EvaluatedGroup.rows`, `sa_setElementStat` with `rowKey` (Task 6).
- Produces: a repeating group drawn as a `DetailSection` per row titled with the row's key text (the group label once above, as a heading), each row's non-key stats as the section's rows with `StatCell`; `change(group, stat, patch, rowKey?)`.

- [ ] **Step 1: Write the failing tests**

Add a repeating `attack` group labelled "Attack" to the fixture (`weapon` display key, `uses` pool labelled "Uses", `strike` display) and two stored rows, Sword with uses `{ value: 2, min: 0, max: 3 }` and Fist with uses `{ value: 0, min: 0, max: 3 }`. The mocked `sa_setElementStat` takes `rowKey` as its seventh argument, finds the row whose weapon reads as that text, clamps uses between 0 and 3 and writes the row back. Tests:

```ts
it("draws each row of a repeating group under its key and moves a row's pool by its own controls", async () => {
  expect(await screen.findByText("Sword")).toBeInTheDocument();
  expect(screen.getByText("Fist")).toBeInTheDocument();
  const sword = screen.getByTestId("stat-row-Sword");
  await user.click(within(sword).getByRole("button", { name: "Uses +1" }));
  await waitFor(() => expect(within(sword).getByTestId("stat-uses")).toHaveTextContent("3 / 3"));
  expect(sa_setElementStat.mock.calls[0].arguments[6]).toBe("Sword");
  expect(within(screen.getByTestId("stat-row-Fist")).getByTestId("stat-uses")).toHaveTextContent("0 / 3");
});

it("draws a repeating group with no rows as one quiet line", async () => {
  stored = { ...stored, attack: [] };
  renderWithProviders(<ElementStatBlocks idStory={-1} idElement={-2} canEdit />);
  expect(await screen.findByText("No Attack yet")).toBeInTheDocument();
  expect(screen.queryByTestId(/^stat-row-/)).toBeNull();
});
```

- [ ] **Step 2: Run the file and see them fail**

- [ ] **Step 3: Implement**

In `StatBlockView`, for a group with `keyedBy !== ""`: a `Text` heading with the group label, then for each row a `Stack data-testid={\`stat-row-${key}\`}` with the key shown bold and the other stats as label / `StatCell` pairs, the `StatCell` calling `change(group.name, stat.name, patch, String(row.key))`. No rows: `Text color="fg.muted"` "No {group.label} yet". The key stat's cell is not drawn as a control; it is the heading.

- [ ] **Step 4: Run the file**

Expected: PASS.

---

### Task 8: Palladium migration, glossary, whole suite

**Files:**
- Create: `db/migrations/<timestamp>_make_palladium_attack_repeat_by_weapon.sql` (through `just new make_palladium_attack_repeat_by_weapon`)
- Modify: `GLOSSARY.md`
- Modify: `docs/superpowers/specs/2026-11-05-stat-blocks-design.md` (one line under Decisions pointing at the repeating groups spec)

- [ ] **Step 1: Write the migration**

`-- migrate:up`: one `UPDATE systems SET stat_block_definition = '<json>'::jsonb, updated_at = NOW() WHERE id_system = -90;` with no other condition, the comment saying the rewrite is unconditional by decision (spec, Database). The JSON: groups in order `defense` (as the first seeding wrote it, plus `"keyedBy": ""`), `combat` (`"keyedBy": ""`; `strike`, `parry`, `damage`, `initiative` as displays labelled Strike, Parry, Damage, Initiative), `attack` (`"keyedBy": "weapon"`; `weapon` display labelled Weapon, then `strike`, `parry`, `damage`, `initiative` displays), `saves` (`"keyedBy": ""`, no stats). Every stat carries all six fields as the first migration does.

Then:

```sql
UPDATE elements
SET stat_blocks = jsonb_set(
      stat_blocks,
      '{-90}',
      (stat_blocks -> '-90' - 'attack')
        || jsonb_build_object('combat', coalesce(stat_blocks -> '-90' -> 'combat', stat_blocks -> '-90' -> 'attack'))
    ),
    updated_at = NOW()
WHERE jsonb_typeof(stat_blocks -> '-90' -> 'attack') = 'object';
```

with the comment from the spec on why the values move. `-- migrate:down` empty, as the first seeding's is.

- [ ] **Step 2: Apply and check**

Run: `just migrate`, then `just psql -c "select jsonb_path_query(stat_block_definition, '$.groups[*].name') from systems where id_system = -90"` Expected: defense, combat, attack, saves. And `just psql -c "select count(*) from elements where jsonb_typeof(stat_blocks -> '-90' -> 'attack') = 'object'"` Expected: 0.

- [ ] **Step 3: Glossary and spec pointer**

Add to `GLOSSARY.md` under Stat blocks: **Repeating group** (a group whose definition names one of its stats as the key; an element carries any number of rows of it), **Key** (the stat whose value tells one row from another; filled and unique within the group), **Row** (one set of a repeating group's values on an element). In the first spec's Decisions, one line: groups may repeat, see the repeating groups design.

- [ ] **Step 4: Whole suite, types, lint, format**

From the repo root `just test`; Expected: 0 fail. From `apps/web`: `npx tsc --noEmit -p . 2>&1 | grep -v '\.next/types'` Expected: no output; `npx eslint <touched files>` Expected: clean; `npx prettier --write --print-width 100 <touched files>`.

- [ ] **Step 5: Hand check in the browser**

`just dev`; as an administrator open Palladium under Systems and see "Repeats by: weapon" on Attack; on a Palladium story's prep board create an element, add two attacks, save, reopen, see them; at the table open the element and see the two rows with their controls.
