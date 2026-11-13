"use client";

import { useId, useState } from "react";
import NextLink from "next/link";
import {
  Controller,
  useForm,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Accordion,
  Alert,
  Box,
  Button,
  Checkbox,
  Code,
  Field,
  Heading,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Popover,
  Portal,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Dices, Plus, Trash2 } from "lucide-react";
import {
  sa_setSystemStatBlockDefinition,
  type AdminSystemDetail,
} from "@/app/(app)/(nav)/admin/systems/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { DiceInput } from "@/components/stat-blocks/dice-input";
import {
  joinRack,
  splitRack,
  statBlockDefinitionFormSchema,
  type StatBlockDefinitionFormInput,
} from "@/lib/stat-block-schemas";
import {
  canRoll,
  hasDie,
  hasFormat,
  defaultFormat,
  isNumberFormat,
  isRepeating,
  ROLL_PRESETS,
  STAT_FORMAT_LABELS,
  STAT_FORMATS,
  STAT_TYPE_LABELS,
  STAT_TYPES,
  statLabel,
  type StatBlockDefinition,
  type StatFormat,
  type StatType,
} from "@/lib/stat-blocks";

type FormInput = StatBlockDefinitionFormInput;
type EditorControl = Control<FormInput, unknown, StatBlockDefinition>;

/** The definition as the form holds it: each rack as the text of its field. */
function toForm(definition: StatBlockDefinition): FormInput {
  return {
    groups: definition.groups.map((group) => ({
      ...group,
      stats: group.stats.map((stat) => ({ ...stat, rack: joinRack(stat.rack) })),
    })),
  };
}

/** The form's values as a definition, for the JSON tab; the schema does the same on save. */
function toDefinition(values: FormInput): StatBlockDefinition {
  return {
    groups: values.groups.map((group) => ({
      ...group,
      stats: group.stats.map((stat) => ({ ...stat, rack: splitRack(stat.rack) })),
    })),
  };
}

const EMPTY_STAT = {
  name: "",
  label: "",
  description: "",
  type: "display" as StatType,
  rack: "",
  computedAs: "",
  visible: true,
  format: "" as StatFormat,
  sticky: false,
  static: false,
  roll: "",
  global: false,
  upDown: false,
  initialRoll: "",
};

/**
 * Stands in the open list for the group added last, whose field id is not
 * known until the field array has re-rendered: Add group puts this in, and
 * it is read as the last group's id when the accordion is drawn, so a new
 * group opens for its name to be typed. It is pinned to that id before
 * anything moves, removes or adds a group, so it does not follow the last
 * place to another group; the accordion itself reports real ids. A save
 * resets the form, which gives every group a new id, so the groups open at
 * the save are kept by place (atIndex) and read back to ids once the reset
 * has drawn.
 */
const NEWEST = "newest";
/** Stands in the open list for the group at a place, across a save's reset; see NEWEST. */
const atIndex = (g: number) => `#${g}`;

/**
 * The editor of one system's stat block definition: its groups as an
 * accordion, each closed to a line of its name, label and whether it
 * repeats until it is opened for its fields and its stats as rows, and a
 * JSON tab that shows what the form would save. Every group starts closed.
 * Saving posts the whole definition; the rules the schema keeps (names,
 * references, cycles) come back on the field they name, in the browser
 * first and from the action again, and a group with an error on it is
 * opened so the message can be seen.
 */
export function SystemStatBlockEditor({ system }: { system: AdminSystemDetail }) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, StatBlockDefinition>({
    resolver: zodResolver(statBlockDefinitionFormSchema),
    defaultValues: toForm(system.definition),
  });
  const groups = useFieldArray({ control, name: "groups" });
  // The live values for the JSON tab: useWatch rather than watch(), which
  // the React Compiler cannot memoise safely.
  const live = useWatch({ control });
  // The open groups by field id, which travels with a group as it is moved.
  const [open, setOpen] = useState<string[]>([]);
  const lastId = groups.fields[groups.fields.length - 1]?.id;
  /** The open list with NEWEST read as the id it stands for right now. */
  const pinned = (current: string[]) =>
    current
      .map((id) =>
        id === NEWEST ? lastId : id.startsWith("#") ? groups.fields[Number(id.slice(1))]?.id : id,
      )
      .filter((id): id is string => id !== undefined);
  const openIds = pinned(open);

  function addGroup() {
    setOpen((current) => [...pinned(current), NEWEST]);
    groups.append({
      name: "",
      label: "",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [],
    });
  }
  function moveGroup(from: number, to: number) {
    setOpen(pinned);
    groups.move(from, to);
  }
  function removeGroup(g: number) {
    setOpen(pinned);
    groups.remove(g);
  }

  function openGroupsWithErrors(found: FieldErrors<FormInput>) {
    const ids = groups.fields.filter((_, g) => found.groups?.[g] !== undefined).map((f) => f.id);
    if (ids.length > 0) setOpen((current) => [...new Set([...current, ...ids])]);
  }

  async function onSubmit(definition: StatBlockDefinition) {
    let result: Awaited<ReturnType<typeof sa_setSystemStatBlockDefinition>>;
    try {
      result = await sa_setSystemStatBlockDefinition(system.idSystem, definition);
    } catch {
      setError("root", { message: "The definition could not be saved. Please try again." });
      return;
    }
    if (result.ok) {
      // What was saved is what the form now starts from, so the rack texts
      // read as they were split and nothing shows as changed. The groups
      // that were open stay open, found again by their place.
      const openAt = groups.fields.flatMap((field, g) =>
        openIds.includes(field.id) ? [atIndex(g)] : [],
      );
      reset(toForm(definition));
      setOpen(openAt);
      toaster.create({ title: "Stat block saved.", type: "success" });
      return;
    }
    const withErrors: FieldErrors<FormInput> = { groups: [] };
    for (const [path, message] of Object.entries(result.errors)) {
      setError(path === "root" ? "root" : (path as `groups.${number}.name`), { message });
      const g = /^groups\.(\d+)\./.exec(path)?.[1];
      if (g !== undefined) (withErrors.groups as unknown[])[Number(g)] = { message };
    }
    openGroupsWithErrors(withErrors);
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="lg">Stat Block Definitions</Heading>
        <Text color="fg.muted">
          The stat block every element run in this system can carry: its groups, and the stats in
          each. Formulas name a stat as <Code>stat</Code> within its group or{" "}
          <Code>group.stat</Code>. A group that repeats by one of its stats holds a list of rows on
          each element, told apart by that stat. A stat that is not visible is filled in on the prep
          form and feeds formulas as any other, but the table does not show it. A number format
          holds a display to a number, as a pool and a stack always are, and number +/- writes the
          value with its sign at the table.
        </Text>
      </Stack>

      <form onSubmit={handleSubmit(onSubmit, openGroupsWithErrors)} noValidate>
        <Stack gap="4">
          {errors.root && (
            <Alert.Root role="alert" status="error">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errors.root.message}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
          {/* The groups array's own message: too many, or too long in all. */}
          {errors.groups?.root && (
            <Alert.Root role="alert" status="error" size="sm">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errors.groups.root.message}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}

          <Tabs.Root defaultValue="groups" variant="line" lazyMount>
            <Tabs.List>
              <Tabs.Trigger value="groups">Groups</Tabs.Trigger>
              {/* On the Groups tab's heading, for every group at once: the one
                  way to see the whole definition, or to fold it back up. Beside
                  the trigger rather than in it, since a button cannot hold
                  buttons. */}
              <HStack gap="0" mr="2" alignSelf="center">
                <PrepIconButton
                  label="Open all groups"
                  onClick={() => setOpen(groups.fields.map((group) => group.id))}
                >
                  <ChevronsDown />
                </PrepIconButton>
                <PrepIconButton label="Close all groups" onClick={() => setOpen([])}>
                  <ChevronsUp />
                </PrepIconButton>
              </HStack>
              <Tabs.Trigger value="json">JSON</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="groups">
              <Stack gap="4">
                {/* Plain, so each item draws its own boundary: a line, or a
                    double line for a group that repeats. Any number may be
                    open at once; closing the last one is allowed. */}
                <Accordion.Root
                  multiple
                  collapsible
                  variant="plain"
                  value={openIds}
                  onValueChange={(details) => setOpen(details.value)}
                >
                  <Stack gap="4">
                    {groups.fields.map((group, g) => (
                      <GroupItem
                        key={group.id}
                        id={group.id}
                        g={g}
                        count={groups.fields.length}
                        moveGroup={moveGroup}
                        removeGroup={removeGroup}
                        control={control}
                        register={register}
                        setValue={setValue}
                        errors={errors}
                      />
                    ))}
                  </Stack>
                </Accordion.Root>
                <Box>
                  <Button type="button" size="sm" variant="outline" onClick={addGroup}>
                    <Plus /> Add group
                  </Button>
                </Box>
              </Stack>
            </Tabs.Content>
            <Tabs.Content value="json">
              {/* What the form would save, as the column will hold it. Read
                  from the live values, so it follows every keystroke. */}
              <Box as="pre" fontSize="sm" p="3" borderWidth="1px" rounded="md" overflowX="auto">
                {JSON.stringify(toDefinition(live as FormInput), null, 2)}
              </Box>
            </Tabs.Content>
          </Tabs.Root>

          <HStack gap="3">
            <Button type="submit" loading={isSubmitting}>
              Save stat block
            </Button>
            <Button asChild variant="ghost">
              <NextLink href="/admin/systems">Back to systems</NextLink>
            </Button>
          </HStack>
        </Stack>
      </form>
    </Stack>
  );
}

/**
 * One group of the accordion. Closed, its trigger reads the group's name
 * with how many stats it holds, its label, and what it repeats by when it
 * does, set apart in italics, as they are being typed, with the move
 * arrows to its left and the trashcan to its right rather than in it, since
 * a button cannot hold buttons and a closed group is still moved and
 * removed. Open, the fields for those three, then the group's stats. A group
 * that repeats is drawn with a double boundary in the colour of its Repeats
 * by line, so the groups whose elements carry rows stand out from those that
 * carry one record. A child component, since the group's values are watched
 * per group.
 */
function GroupItem({
  id,
  g,
  count,
  moveGroup,
  removeGroup,
  control,
  register,
  setValue,
  errors,
}: {
  id: string;
  g: number;
  count: number;
  moveGroup: (from: number, to: number) => void;
  removeGroup: (g: number) => void;
  control: EditorControl;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  errors: FieldErrors<FormInput>;
}) {
  const group = useWatch({ control, name: `groups.${g}` });
  const repeating = group !== undefined && isRepeating(group);
  const keyStat = group?.stats.find((stat) => stat.name === group.keyedBy);
  return (
    <Accordion.Item
      value={id}
      borderWidth={repeating ? "4px" : "1px"}
      borderStyle={repeating ? "double" : "solid"}
      borderColor={repeating ? "blue.fg" : undefined}
      rounded="md"
      data-repeating={repeating || undefined}
    >
      <HStack gap="1" pl="1" pr="2">
        {/* The arrows lead the row, packed tight at the smallest size, so a
            closed group is reordered from its left edge; the trashcan keeps
            to the right, away from them. */}
        <HStack gap="0">
          <PrepIconButton
            label="Move group up"
            size="2xs"
            disabled={g === 0}
            onClick={() => moveGroup(g, g - 1)}
          >
            <ArrowUp />
          </PrepIconButton>
          <PrepIconButton
            label="Move group down"
            size="2xs"
            disabled={g === count - 1}
            onClick={() => moveGroup(g, g + 1)}
          >
            <ArrowDown />
          </PrepIconButton>
        </HStack>
        <Accordion.ItemTrigger flex="1" px="2" cursor="pointer">
          <HStack gap="3" flex="1" wrap="wrap">
            <Text fontWeight="semibold" color={group?.name ? undefined : "fg.muted"}>
              {group?.name || "New group"} ({group?.stats.length ?? 0})
            </Text>
            {group?.label && <Text color="fg.muted">{group.label}</Text>}
            {repeating && (
              <Text fontSize="sm" fontStyle="italic" color="blue.fg">
                Repeats by {keyStat ? statLabel(keyStat) : group.keyedBy}
              </Text>
            )}
          </HStack>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>
        {/* A repeating group's boxes sit on the line, beside the trigger
            rather than in it, so ticking one does not open or close the group. */}
        {repeating && (
          <FlagCheckbox
            control={control}
            name={`groups.${g}.canHaveMultiples`}
            tooltip="Let an element say how many of this group it has; Roll all rolls it that many times"
          >
            Can Have Multiples
          </FlagCheckbox>
        )}
        {repeating && (
          <FlagCheckbox
            control={control}
            name={`groups.${g}.rollAll`}
            tooltip="Offer a die on the group that rolls the first die of every row"
          >
            Roll all
          </FlagCheckbox>
        )}
        <PrepIconButton label="Remove group" onClick={() => removeGroup(g)}>
          <Trash2 />
        </PrepIconButton>
      </HStack>
      <Accordion.ItemContent>
        <Accordion.ItemBody>
          <Stack gap="4">
            <HStack gap="3" align="flex-start" wrap="wrap">
              <Field.Root invalid={!!errors.groups?.[g]?.name} flex="1" minW="40">
                <Field.Label>Group name</Field.Label>
                <Input size="sm" autoComplete="off" {...register(`groups.${g}.name`)} />
                <Field.ErrorText>{errors.groups?.[g]?.name?.message}</Field.ErrorText>
              </Field.Root>
              <Field.Root invalid={!!errors.groups?.[g]?.label} flex="1" minW="40">
                <Field.Label>Group label (optional)</Field.Label>
                <Input size="sm" autoComplete="off" {...register(`groups.${g}.label`)} />
                <Field.ErrorText>{errors.groups?.[g]?.label?.message}</Field.ErrorText>
              </Field.Root>
              <KeyedBySelect
                control={control}
                register={register}
                setValue={setValue}
                errors={errors}
                g={g}
              />
            </HStack>
            <StatRows
              control={control}
              register={register}
              setValue={setValue}
              errors={errors}
              g={g}
            />
          </Stack>
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  );
}

/**
 * The group's key: the stat whose value tells one row from another, which
 * is what makes the group repeat. Only a display or a rack is offered, since
 * a pool or stack is spent and refilled and a computed stat stores nothing.
 * Watches the group's stats itself so the options follow a type as it is
 * changed. A group made plain again gives up Roll all
 * and Can Have Multiples, which only a repeating group has.
 */
function KeyedBySelect({
  control,
  register,
  setValue,
  errors,
  g,
}: {
  control: EditorControl;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  errors: FieldErrors<FormInput>;
  g: number;
}) {
  const keyedBy = register(`groups.${g}.keyedBy`);
  const stats = useWatch({ control, name: `groups.${g}.stats` }) ?? [];
  const eligible = stats.filter(
    (stat) => (stat.type === "display" || stat.type === "rack") && stat.name.trim() !== "",
  );
  return (
    <Field.Root invalid={!!errors.groups?.[g]?.keyedBy} w="48">
      <Field.Label>Repeats by</Field.Label>
      <NativeSelect.Root size="sm">
        <NativeSelect.Field
          {...keyedBy}
          onChange={(event) => {
            keyedBy.onChange(event);
            if (event.target.value === "") {
              setValue(`groups.${g}.rollAll`, false);
              setValue(`groups.${g}.canHaveMultiples`, false);
            }
          }}
        >
          <option value="">Does not repeat</option>
          {eligible.map((stat) => (
            <option key={stat.name} value={stat.name}>
              {statLabel(stat)}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <Field.ErrorText>{errors.groups?.[g]?.keyedBy?.message}</Field.ErrorText>
    </Field.Root>
  );
}

/**
 * One group's stats, each a row led by the arrows that move it up or down,
 * since the order here is the order the block is drawn in, then the fields
 * its type uses, a Format for a display, a pool or a stack, a die for a pool
 * or a stack's roll, the Visible, With next (sticky) and Static boxes, Global
 * on a stat with a die, Up/down on one held to a number, Initialized as with
 * its dice box on a pool, a stack or a display held to a number, and the
 * trashcan at the end. A child component rather than a loop in the
 * editor, since a field array must be hooked per group: useFieldArray takes
 * one name, and hooks cannot run in a loop.
 */
function StatRows({
  control,
  register,
  setValue,
  errors,
  g,
}: {
  control: EditorControl;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  errors: FieldErrors<FormInput>;
  g: number;
}) {
  const stats = useFieldArray({ control, name: `groups.${g}.stats` });
  const types = useWatch({ control, name: `groups.${g}.stats` });

  return (
    <Stack gap="4">
      {stats.fields.map((stat, s) => {
        const type = types?.[s]?.type ?? "display";
        const format = types?.[s]?.format ?? "";
        const typeField = register(`groups.${g}.stats.${s}.type`);
        const formatField = register(`groups.${g}.stats.${s}.format`);
        const at = errors.groups?.[g]?.stats?.[s];
        return (
          <HStack
            key={stat.id}
            gap="2"
            align="flex-start"
            pb="3"
            borderBottomWidth="1px"
            borderColor="border.muted"
          >
            <HStack pt="6" gap="0">
              <PrepIconButton
                label="Move up"
                size="2xs"
                disabled={s === 0}
                onClick={() => stats.move(s, s - 1)}
              >
                <ArrowUp />
              </PrepIconButton>
              <PrepIconButton
                label="Move down"
                size="2xs"
                disabled={s === stats.fields.length - 1}
                onClick={() => stats.move(s, s + 1)}
              >
                <ArrowDown />
              </PrepIconButton>
            </HStack>
            <Stack flex="1" gap="2">
              <HStack gap="2" align="flex-start" wrap="wrap">
                <Field.Root invalid={!!at?.name} w="40">
                  <Field.Label>Name</Field.Label>
                  <Input
                    size="sm"
                    autoComplete="off"
                    {...register(`groups.${g}.stats.${s}.name`)}
                  />
                  <Field.ErrorText>{at?.name?.message}</Field.ErrorText>
                </Field.Root>
                <Field.Root invalid={!!at?.label} w="40">
                  <Field.Label>Label (optional)</Field.Label>
                  <Input
                    size="sm"
                    autoComplete="off"
                    {...register(`groups.${g}.stats.${s}.label`)}
                  />
                  <Field.ErrorText>{at?.label?.message}</Field.ErrorText>
                </Field.Root>
                <Field.Root invalid={!!at?.description} flex="1" minW="48">
                  <Field.Label>Description (optional)</Field.Label>
                  <Input
                    size="sm"
                    autoComplete="off"
                    {...register(`groups.${g}.stats.${s}.description`)}
                  />
                  <Field.ErrorText>{at?.description?.message}</Field.ErrorText>
                </Field.Root>
              </HStack>
              <HStack gap="2" align="flex-start" wrap="wrap">
                <Field.Root invalid={!!at?.type} w="32">
                  <Field.Label>Type</Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      {...typeField}
                      onChange={(event) => {
                        typeField.onChange(event);
                        // A pool or a stack starts as a number; a format already
                        // chosen is kept, so only "<none>" is replaced.
                        const next = event.target.value as StatType;
                        const nextFormat = !hasFormat(next)
                          ? ""
                          : isNumberFormat(defaultFormat(next)) && !isNumberFormat(format)
                            ? defaultFormat(next)
                            : format;
                        if (nextFormat !== format) {
                          setValue(`groups.${g}.stats.${s}.format`, nextFormat);
                        }
                        if (!canRoll({ type: next, format: nextFormat })) {
                          setValue(`groups.${g}.stats.${s}.roll`, "");
                          setValue(`groups.${g}.stats.${s}.initialRoll`, "");
                        }
                        if (!hasDie({ type: next, format: nextFormat })) {
                          setValue(`groups.${g}.stats.${s}.global`, false);
                        }
                        if (!isNumberFormat(nextFormat)) {
                          setValue(`groups.${g}.stats.${s}.upDown`, false);
                        }
                      }}
                    >
                      {STAT_TYPES.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {STAT_TYPE_LABELS[candidate]}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                  <Field.ErrorText>{at?.type?.message}</Field.ErrorText>
                </Field.Root>
                {type === "rack" && (
                  <Field.Root invalid={!!at?.rack} flex="1" minW="48">
                    <Field.Label>Rack entries</Field.Label>
                    <Input
                      size="sm"
                      autoComplete="off"
                      placeholder="d4, d6, d8"
                      {...register(`groups.${g}.stats.${s}.rack`)}
                    />
                    <Field.ErrorText>{at?.rack?.message}</Field.ErrorText>
                  </Field.Root>
                )}
                {type === "computed" && (
                  <Field.Root invalid={!!at?.computedAs} flex="1" minW="64">
                    <Field.Label>Formula</Field.Label>
                    <Input
                      size="sm"
                      autoComplete="off"
                      placeholder="floor((stats.str.value - 10) / 2)"
                      {...register(`groups.${g}.stats.${s}.computedAs`)}
                    />
                    <Field.ErrorText>{at?.computedAs?.message}</Field.ErrorText>
                  </Field.Root>
                )}
                {hasFormat(type) && (
                  <Field.Root invalid={!!at?.format} w="36">
                    <Field.Label>Format</Field.Label>
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field
                        {...formatField}
                        onChange={(event) => {
                          formatField.onChange(event);
                          // A display let go of its number loses its roll with it.
                          const next = event.target.value as StatFormat;
                          if (!canRoll({ type, format: next })) {
                            setValue(`groups.${g}.stats.${s}.roll`, "");
                            setValue(`groups.${g}.stats.${s}.initialRoll`, "");
                            setValue(`groups.${g}.stats.${s}.global`, false);
                          }
                          if (!isNumberFormat(next)) {
                            setValue(`groups.${g}.stats.${s}.upDown`, false);
                          }
                        }}
                      >
                        {STAT_FORMATS.map((format) => (
                          <option key={format} value={format}>
                            {STAT_FORMAT_LABELS[format]}
                          </option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                    <Field.ErrorText>{at?.format?.message}</Field.ErrorText>
                  </Field.Root>
                )}
                {canRoll({ type, format }) && (
                  <Box pt="6">
                    <RollPopover
                      g={g}
                      s={s}
                      label={statLabel(types?.[s] ?? { name: "", label: "" })}
                      roll={types?.[s]?.roll ?? ""}
                      error={at?.roll?.message}
                      setValue={setValue}
                    />
                  </Box>
                )}
                <HStack pt="7" gap="3" wrap="wrap">
                  <FlagCheckbox control={control} name={`groups.${g}.stats.${s}.visible`}>
                    Visible
                  </FlagCheckbox>
                  <FlagCheckbox
                    control={control}
                    name={`groups.${g}.stats.${s}.sticky`}
                    tooltip="Share a line with the stat after it"
                  >
                    With next
                  </FlagCheckbox>
                  <FlagCheckbox control={control} name={`groups.${g}.stats.${s}.static`}>
                    Static
                  </FlagCheckbox>
                  {hasDie({ type, format }) && (
                    <FlagCheckbox
                      control={control}
                      name={`groups.${g}.stats.${s}.global`}
                      tooltip="Offer to roll this for all participants from the run page"
                    >
                      Global
                    </FlagCheckbox>
                  )}
                  {isNumberFormat(format) && (
                    <FlagCheckbox
                      control={control}
                      name={`groups.${g}.stats.${s}.upDown`}
                      tooltip="Show up/down changer on editable number values"
                    >
                      Up/down
                    </FlagCheckbox>
                  )}
                  {canRoll({ type, format }) && (
                    <InitialRollField
                      control={control}
                      g={g}
                      s={s}
                      label={statLabel(types?.[s] ?? { name: "", label: "" })}
                      error={at?.initialRoll?.message}
                    />
                  )}
                </HStack>
                <Box pt="6" ml="auto">
                  <PrepIconButton label="Remove stat" onClick={() => stats.remove(s)}>
                    <Trash2 />
                  </PrepIconButton>
                </Box>
              </HStack>
            </Stack>
          </HStack>
        );
      })}
      <Box>
        <Button type="button" size="xs" variant="outline" onClick={() => stats.append(EMPTY_STAT)}>
          <Plus /> Add stat
        </Button>
      </Box>
    </Stack>
  );
}

/**
 * Initialized as: a box that, ticked, opens a dice box (DiceInput) holding
 * the roll made once when the stat's block is added to an element, for its
 * starting value and max; unticked, the roll is cleared and the stat starts
 * at 0. Whether it is ticked is held here, starting from whether a roll is
 * set, so a box cleared to be retyped stays open; a blank left in it saves
 * as no roll. Controller for the reason FlagCheckbox gives.
 */
function InitialRollField({
  control,
  g,
  s,
  label,
  error,
}: {
  control: EditorControl;
  g: number;
  s: number;
  label: string;
  error?: string;
}) {
  const value = useWatch({ control, name: `groups.${g}.stats.${s}.initialRoll` });
  const [ticked, setTicked] = useState(value !== "");
  return (
    <Controller
      control={control}
      name={`groups.${g}.stats.${s}.initialRoll`}
      render={({ field }) => (
        <HStack gap="2" align="flex-start">
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              <Checkbox.Root
                name={field.name}
                checked={ticked}
                onCheckedChange={(details) => {
                  const next = details.checked === true;
                  setTicked(next);
                  if (!next) field.onChange("");
                }}
                size="sm"
              >
                <Checkbox.HiddenInput onBlur={field.onBlur} ref={field.ref} />
                <Checkbox.Control />
                <Checkbox.Label>Initialized as</Checkbox.Label>
              </Checkbox.Root>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>
                  Roll this once when the block is added to an element, for its starting value and
                  max
                </Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
          {ticked && (
            <Field.Root invalid={!!error} w="56" mt="-1">
              <DiceInput
                label={`${label} initialized as`}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
              <Field.ErrorText>{error}</Field.ErrorText>
            </Field.Root>
          )}
        </HStack>
      )}
    />
  );
}

/**
 * One of a stat's flags as a checkbox. Controller rather than register(),
 * as story-form.tsx says: Chakra's hidden input carries value="on", which
 * register() would hand the schema in place of the checked flag. A tooltip,
 * when given, says what the flag does on hover.
 */
function FlagCheckbox({
  control,
  name,
  tooltip,
  children,
}: {
  control: EditorControl;
  name:
    | `groups.${number}.stats.${number}.${"visible" | "sticky" | "static" | "global" | "upDown"}`
    | `groups.${number}.${"rollAll" | "canHaveMultiples"}`;
  tooltip?: string;
  children: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const box = (
          <Checkbox.Root
            name={field.name}
            checked={field.value}
            onCheckedChange={(details) => field.onChange(details.checked === true)}
            size="sm"
          >
            <Checkbox.HiddenInput onBlur={field.onBlur} ref={field.ref} />
            <Checkbox.Control />
            <Checkbox.Label>{children}</Checkbox.Label>
          </Checkbox.Root>
        );
        if (tooltip === undefined) return box;
        return (
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>{box}</Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>{tooltip}</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
        );
      }}
    />
  );
}

/**
 * The die on a pool or a stack: a popover choosing the roll that goes with
 * the stat, one of ROLL_PRESETS or a custom one written as the chat's /roll
 * takes it. The die is solid and in the accent while a roll is set, so a
 * closed row still shows which stats roll. The select's Custom choice is
 * remembered here, since a custom roll just started is "" and would
 * otherwise read as none and hide its own box. The roll's error shows in
 * the popover and, so it is not missed while closed, as the die's colour.
 */
function RollPopover({
  g,
  s,
  label,
  roll,
  error,
  setValue,
}: {
  g: number;
  s: number;
  label: string;
  roll: string;
  error: string | undefined;
  setValue: UseFormSetValue<FormInput>;
}) {
  const triggerId = useId();
  const [custom, setCustom] = useState(false);
  const isPreset = (ROLL_PRESETS as readonly string[]).includes(roll);
  const mode = custom || (roll !== "" && !isPreset) ? "custom" : roll;
  const set = (value: string) =>
    setValue(`groups.${g}.stats.${s}.roll`, value, { shouldDirty: true });

  return (
    // Not lazyMount, as tags-popover.tsx says: zag names the dialog by its
    // title only when the title is in the page as the machine starts.
    <Popover.Root ids={{ trigger: triggerId }} positioning={{ placement: "bottom-start" }}>
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label={`Roll for ${label}`}
              size="xs"
              rounded="full"
              variant={roll !== "" ? "solid" : "ghost"}
              colorPalette={error ? "red" : roll !== "" ? "blue" : undefined}
              data-roll={roll || undefined}
            >
              <Dices />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{roll !== "" ? `Rolls ${roll}` : `Roll for ${label}`}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Roll for {label}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="3">
                <Field.Root invalid={!!error}>
                  <Field.Label>Roll</Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      value={mode}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (next === "custom") {
                          setCustom(true);
                          if (isPreset) set("");
                        } else {
                          setCustom(false);
                          set(next);
                        }
                      }}
                    >
                      <option value="">{"<none>"}</option>
                      {ROLL_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                      <option value="custom">Custom</option>
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                  {mode !== "custom" && <Field.ErrorText>{error}</Field.ErrorText>}
                </Field.Root>
                {mode === "custom" && (
                  <Field.Root invalid={!!error}>
                    <Field.Label>Custom roll</Field.Label>
                    <DiceInput
                      label="Custom roll"
                      value={roll}
                      onChange={set}
                      placeholder="2d6+1"
                    />
                    <Field.HelperText>As the chat&apos;s /roll takes it.</Field.HelperText>
                    <Field.ErrorText>{error}</Field.ErrorText>
                  </Field.Root>
                )}
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
