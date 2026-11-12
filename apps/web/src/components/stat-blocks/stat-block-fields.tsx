"use client";

import {
  useFieldArray,
  useWatch,
  type ArrayPath,
  type Control,
  type FieldErrors,
  type UseFieldArrayReturn,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import {
  Box,
  Button,
  Card,
  Field,
  Flex,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Portal,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Plus, Star, Trash2, X } from "lucide-react";
import type { StatBlockSystems } from "@/app/(app)/(nav)/libraries/actions";
import { DeleteButton } from "@/components/confirm/delete-button";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import type { ElementFormInput, ElementValues } from "@/lib/element-schemas";
import {
  carriedGroups,
  emptyStatGroup,
  emptyStatRowFields,
  type EvaluatedGroup,
  type EvaluatedStat,
  evaluateStatBlock,
  isNumberFormat,
  isRepeating,
  MULTIPLES,
  rowKeyText,
  statBlockFromFields,
  type StatDefinition,
  type StatGroupDefinition,
  statLabel,
  statLines,
  type StatRowFieldValues,
  systemKey,
  toStatBlockFields,
} from "@/lib/stat-blocks";
import { NumberOnlyInput } from "./number-only-input";
import { StatBlockPicker } from "./stat-block-picker";

type Props = {
  systems: StatBlockSystems;
  control: Control<ElementFormInput, unknown, ElementValues>;
  register: UseFormRegister<ElementFormInput>;
  setValue: UseFormSetValue<ElementFormInput>;
  errors: FieldErrors<ElementFormInput>;
};

type FormControl = Control<ElementFormInput, unknown, ElementValues>;

/**
 * The Stat blocks section of the element form, against the story's own
 * system's template: one card per stat block the element carries, its
 * fields generated from the template, and under the cards the picker
 * offering the template's other blocks. The computed stats and the fed
 * maxes are worked out from the fields as they are typed, so the
 * storyteller sees what the table will show. The fields are the form's own
 * (register), posted with the rest of the element; a block taken off is
 * simply not posted, and the action replaces the system's block with what
 * is. A story with no system, or one whose template is empty, gets no
 * section. Blocks stored for any other system are neither drawn nor
 * posted, which leaves them as they are.
 */
export function StatBlockFields({ systems, control, register, setValue, errors }: Props) {
  const blocks = useWatch({ control, name: "statBlocks" }) ?? {};
  const own = systems.systems.find((system) => system.idSystem === systems.storySystem);
  if (!own) return null;
  const key = systemKey(own.idSystem);
  const fields = blocks[key] ?? {};
  const definition = own.definition;
  const carried = carriedGroups(definition, statBlockFromFields(fields));

  function add(groupName: string) {
    const group = definition.groups.find((candidate) => candidate.name === groupName);
    if (!group) return;
    const starting = toStatBlockFields(definition, {
      [group.name]: emptyStatGroup(definition, group),
    });
    setValue(`statBlocks.${key}.${group.name}`, starting[group.name], { shouldDirty: true });
    // A group that can have multiples starts with one.
    const multiples = starting[MULTIPLES];
    if (multiples && !Array.isArray(multiples)) {
      setValue(`statBlocks.${key}.${MULTIPLES}.${group.name}`, multiples[group.name], {
        shouldDirty: true,
      });
    }
  }

  function addAll() {
    const names = new Set(carried.map((group) => group.name));
    for (const group of definition.groups) if (!names.has(group.name)) add(group.name);
  }

  function remove(groupName: string) {
    const { [groupName]: _gone, ...rest } = fields;
    // Its multiple goes with it.
    const multiples = rest[MULTIPLES];
    if (multiples && !Array.isArray(multiples) && groupName in multiples) {
      const { [groupName]: _multiple, ...others } = multiples;
      rest[MULTIPLES] = others;
    }
    setValue(`statBlocks.${key}`, rest, { shouldDirty: true });
  }

  // Worked out from the fields as typed: the computed values, and the max a
  // connection feeds, which the pool's own field then does not ask for.
  const evaluated = evaluateStatBlock(definition, statBlockFromFields(fields));
  const errorsAt = errors.statBlocks?.[key] as Record<string, GroupErrors> | undefined;

  return (
    <Stack gap="3" data-testid="stat-block-fields">
      <Heading as="h3" size="sm">
        Stat blocks
      </Heading>
      {carried.map((group) => (
        <BlockCard
          key={group.name}
          systemKey={key}
          group={group}
          evaluated={evaluated.find((candidate) => candidate.name === group.name)!}
          control={control}
          register={register}
          errors={errorsAt?.[group.name]}
          multipleError={
            (errorsAt?.[MULTIPLES] as RowErrors | undefined)?.[group.name]?.value?.message
          }
          onRemove={() => remove(group.name)}
        />
      ))}
      <StatBlockPicker
        definition={definition}
        carried={carried.map((group) => group.name)}
        onAdd={add}
        onAddAll={addAll}
      />
    </Stack>
  );
}

type PartErrors = Partial<Record<"value" | "min" | "max", { message?: string }>>;
type RowErrors = Record<string, PartErrors>;
/** A group's errors: by stat for a plain group, by row index then stat for one that repeats, plus the array's own message. */
type GroupErrors = RowErrors & RowErrors[] & { message?: string; root?: { message?: string } };

/**
 * One carried stat block: a card headed by its label, a Multiple box where
 * the group can have multiples (how many of it the element has, 1 to start),
 * and a Remove that asks first, then its stats on the lines statLines lays
 * out, or, for a block that repeats, its table of rows.
 */
function BlockCard({
  systemKey: key,
  group,
  evaluated,
  control,
  register,
  errors,
  multipleError,
  onRemove,
}: {
  systemKey: string;
  group: StatGroupDefinition;
  evaluated: EvaluatedGroup;
  control: FormControl;
  register: UseFormRegister<ElementFormInput>;
  errors: GroupErrors | undefined;
  /** What the schema said of the Multiple box, when it refused it. */
  multipleError?: string;
  onRemove: () => void;
}) {
  const title = group.label || group.name;
  const byName = new Map(group.stats.map((stat) => [stat.name, stat]));
  return (
    <Card.Root size="sm" data-testid={`stat-block-${key}-${group.name}`}>
      <Card.Header>
        <HStack justify="space-between" gap="2">
          <HStack gap="3">
            <Heading as="h4" size="xs">
              {title}
            </Heading>
            {group.canHaveMultiples && (
              <Field.Root invalid={!!multipleError} w="auto">
                <HStack gap="2">
                  <Field.Label m="0" fontSize="xs" color="fg.muted">
                    Multiple
                  </Field.Label>
                  <Input
                    size="xs"
                    w="12"
                    inputMode="numeric"
                    textAlign="right"
                    {...register(`statBlocks.${key}.${MULTIPLES}.${group.name}.value`)}
                  />
                </HStack>
                <Field.ErrorText>{multipleError}</Field.ErrorText>
              </Field.Root>
            )}
          </HStack>
          {/* Removed from the form only, so no toast: the element keeps the
              block until the form is saved without it. */}
          <DeleteButton
            thing={title}
            label={`Remove ${title}`}
            verb="Remove"
            icon={<X />}
            done={null}
            onDelete={() => {
              onRemove();
              return { ok: true };
            }}
          >
            Its values go with it when the element is saved.
          </DeleteButton>
        </HStack>
      </Card.Header>
      <Card.Body>
        {isRepeating(group) ? (
          <RepeatingGroupFields
            systemKey={key}
            definition={group}
            group={evaluated}
            control={control}
            register={register}
            errors={errors}
          />
        ) : (
          <Stack gap="3">
            {statLines(evaluated.stats).map((line) => (
              <Flex key={line[0].name} wrap="wrap" gap="3" data-stat-line>
                {line.map((stat) => (
                  <Box key={stat.name} flex="1 1 10rem">
                    <StatField
                      stat={stat}
                      definition={byName.get(stat.name)!}
                      path={`statBlocks.${key}.${group.name}.${stat.name}`}
                      register={register}
                      errors={errors?.[stat.name]}
                    />
                  </Box>
                ))}
              </Flex>
            ))}
          </Stack>
        )}
      </Card.Body>
    </Card.Root>
  );
}

/**
 * A repeating group on the form: a table with the key stat's column first,
 * whatever its order in the group, then the other stats, a trashcan on each row
 * and a button beneath that adds one. The rows are a field array on the
 * group's path, so the block posts them as an array; the evaluation of the
 * typed fields is positional, so row i's computed stats are read from it by
 * the same index. A new row starts empty but for its racks, and the key's
 * required message shows on save until it is typed.
 */
function RepeatingGroupFields({
  systemKey: key,
  definition,
  group,
  control,
  register,
  errors,
}: {
  systemKey: string;
  definition: StatGroupDefinition;
  group: EvaluatedGroup;
  control: FormControl;
  register: UseFormRegister<ElementFormInput>;
  errors: GroupErrors | undefined;
}) {
  // The path's type is a record of records or arrays, so react-hook-form
  // cannot see an array path here; the definition says this group is one,
  // and the return is typed as the array of rows it holds.
  const name = `statBlocks.${key}.${group.name}` as ArrayPath<ElementFormInput>;
  const rows = useFieldArray({ control, name }) as unknown as UseFieldArrayReturn<
    { rows: StatRowFieldValues[] },
    "rows"
  >;
  const typed = (useWatch({ control, name: name as `statBlocks.${string}.${string}` }) ??
    []) as StatRowFieldValues[];
  const ordered = [
    ...definition.stats.filter((stat) => stat.name === group.keyedBy),
    ...definition.stats.filter((stat) => stat.name !== group.keyedBy),
  ];
  const title = definition.label || definition.name;
  const arrayError = errors?.root?.message ?? errors?.message;

  return (
    <Stack gap="2" data-testid={`stat-rows-${key}-${group.name}`}>
      {rows.fields.length > 0 && (
        <Table.Root size="sm" variant="line">
          <Table.Header>
            <Table.Row>
              {ordered.map((stat) => (
                <Table.ColumnHeader key={stat.name}>
                  <StatName stat={stat} />
                </Table.ColumnHeader>
              ))}
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.fields.map((field, i) => {
              const evaluated = group.rows[i];
              const keyText = rowKeyText(typed[i]?.[group.keyedBy]?.value) ?? "row";
              return (
                <Table.Row key={field.id}>
                  {ordered.map((stat) => {
                    const shown = evaluated?.stats.find((s) => s.name === stat.name);
                    return (
                      <Table.Cell key={stat.name} verticalAlign="top">
                        {shown && (
                          <StatField
                            stat={shown}
                            definition={stat}
                            path={`statBlocks.${key}.${group.name}.${i}.${stat.name}`}
                            register={register}
                            errors={errors?.[i]?.[stat.name]}
                            inline
                          />
                        )}
                      </Table.Cell>
                    );
                  })}
                  <Table.Cell verticalAlign="top" whiteSpace="nowrap">
                    {/* The first row is the group's default, the one Roll
                        for all rolls; a star on any other moves it up. */}
                    {i === 0 ? (
                      <Box
                        as="span"
                        role="img"
                        aria-label={`${keyText} is the default`}
                        display="inline-flex"
                        boxSize="6"
                        alignItems="center"
                        justifyContent="center"
                        color="fg.muted"
                      >
                        <Star size={14} fill="currentColor" />
                      </Box>
                    ) : (
                      <PrepIconButton
                        label={`Make ${keyText} the default`}
                        onClick={() => rows.move(i, 0)}
                      >
                        <Star />
                      </PrepIconButton>
                    )}
                    <PrepIconButton label={`Remove ${keyText}`} onClick={() => rows.remove(i)}>
                      <Trash2 />
                    </PrepIconButton>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}
      {arrayError && (
        <Text fontSize="sm" color="fg.error">
          {arrayError}
        </Text>
      )}
      <Box>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => rows.append(emptyStatRowFields(definition))}
        >
          <Plus /> Add {title} row
        </Button>
      </Box>
    </Stack>
  );
}

/**
 * A stat's title as the field's label: its label, or its name when the
 * template gives no label, as the table shows it (statLabel). The
 * description, when there is one, is a tooltip over it.
 */
function StatName({ stat }: { stat: Pick<StatDefinition, "name" | "label" | "description"> }) {
  if (stat.description === "") return <>{statLabel(stat)}</>;
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <Text as="span" textDecoration="underline dotted" cursor="help">
          {statLabel(stat)}
        </Text>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{stat.description}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

type StatPath =
  `statBlocks.${string}.${string}.${string}` | `statBlocks.${string}.${string}.${number}.${string}`;

/**
 * One stat's field or fields, by its type. Inline, in a table cell, the
 * stat's name is the column's header, so the inputs carry it as their
 * accessible name and draw none of their own. A stat held to a number
 * (isNumberFormat) gets a number-only box.
 */
function StatField({
  stat,
  definition,
  path,
  register,
  errors,
  inline = false,
}: {
  stat: EvaluatedStat;
  definition: StatDefinition;
  path: StatPath;
  register: UseFormRegister<ElementFormInput>;
  errors: PartErrors | undefined;
  inline?: boolean;
}) {
  const shown = (value: EvaluatedStat["value"]) => (value === null ? "—" : String(value));
  const Box_ = isNumberFormat(definition.format) ? NumberOnlyInput : Input;
  // What the boxes are called to a screen reader, the same as the title.
  const name = statLabel(definition);

  switch (stat.type) {
    case "computed":
      return (
        <ReadOnly stat={definition} value={shown(stat.value)} note="computed" inline={inline} />
      );
    case "display":
      if (stat.valueFrom !== undefined) {
        return (
          <ReadOnly
            stat={definition}
            value={shown(stat.value)}
            note={`from ${stat.valueFrom}`}
            inline={inline}
          />
        );
      }
      return (
        <Field.Root invalid={!!errors?.value}>
          {!inline && (
            <Field.Label>
              <StatName stat={definition} />
            </Field.Label>
          )}
          <Box_
            size="sm"
            autoComplete="off"
            aria-label={inline ? name : undefined}
            {...register(`${path}.value`)}
          />
          <Field.ErrorText>{errors?.value?.message}</Field.ErrorText>
        </Field.Root>
      );
    case "rack":
      return (
        <Field.Root invalid={!!errors?.value}>
          {!inline && (
            <Field.Label>
              <StatName stat={definition} />
            </Field.Label>
          )}
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              aria-label={inline ? name : undefined}
              {...register(`${path}.value`)}
            >
              {(stat.rack ?? []).map((entry) => (
                <option key={String(entry)} value={String(entry)}>
                  {String(entry)}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Field.ErrorText>{errors?.value?.message}</Field.ErrorText>
        </Field.Root>
      );
    case "dice":
      return (
        <Field.Root invalid={!!errors?.value}>
          {!inline && (
            <Field.Label>
              <StatName stat={definition} />
            </Field.Label>
          )}
          <Input
            size="sm"
            autoComplete="off"
            placeholder="2d6"
            aria-label={inline ? name : undefined}
            {...register(`${path}.value`)}
          />
          <Field.ErrorText>{errors?.value?.message}</Field.ErrorText>
        </Field.Root>
      );
    case "pool":
    case "stack": {
      const isPool = stat.type === "pool";
      return (
        <Box>
          {!inline && (
            <Text as="label" fontSize="sm" fontWeight="medium" display="block" mb="1">
              <StatName stat={definition} />
            </Text>
          )}
          <HStack gap="2" align="flex-start">
            <Field.Root invalid={!!errors?.value}>
              <Box_
                size="sm"
                autoComplete="off"
                placeholder={isPool ? "current" : "count"}
                aria-label={`${name} value`}
                {...register(`${path}.value`)}
              />
              <Field.ErrorText>{errors?.value?.message}</Field.ErrorText>
            </Field.Root>
            {isPool && (
              <Field.Root invalid={!!errors?.min}>
                <Box_
                  size="sm"
                  autoComplete="off"
                  placeholder="min 0"
                  aria-label={`${name} min`}
                  {...register(`${path}.min`)}
                />
                <Field.ErrorText>{errors?.min?.message}</Field.ErrorText>
              </Field.Root>
            )}
            {stat.maxFrom !== undefined ? (
              <Text fontSize="sm" color="fg.muted" pt="1.5" whiteSpace="nowrap">
                max {shown(stat.max ?? null)} from {stat.maxFrom}
              </Text>
            ) : (
              <Field.Root invalid={!!errors?.max}>
                <Box_
                  size="sm"
                  autoComplete="off"
                  placeholder={isPool ? "max" : "no max"}
                  aria-label={`${name} max`}
                  {...register(`${path}.max`)}
                />
                <Field.ErrorText>{errors?.max?.message}</Field.ErrorText>
              </Field.Root>
            )}
          </HStack>
        </Box>
      );
    }
  }
}

/** A stat the storyteller does not type: a computed value, or one fed by a connection. */
function ReadOnly({
  stat,
  value,
  note,
  inline = false,
}: {
  stat: StatDefinition;
  value: string;
  note: string;
  inline?: boolean;
}) {
  return (
    <Box>
      {!inline && (
        <Text fontSize="sm" fontWeight="medium" mb="1">
          <StatName stat={stat} />
        </Text>
      )}
      <HStack gap="2" pt="1">
        <Text fontSize="sm" data-testid={`computed-${stat.name}`}>
          {value}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {note}
        </Text>
      </HStack>
    </Box>
  );
}
