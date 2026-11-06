"use client";

import { useMemo } from "react";
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
  Heading,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { Plus, Trash2, X } from "lucide-react";
import type { StatBlockSystems } from "@/app/(app)/(nav)/libraries/actions";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import type { ElementFormInput, ElementValues } from "@/lib/element-schemas";
import {
  emptyStatBlock,
  emptyStatRowFields,
  evaluateStatBlock,
  isRepeating,
  rowKeyText,
  statBlockFromFields,
  systemKey,
  toStatBlockFields,
  type EvaluatedGroup,
  type EvaluatedStat,
  type StatBlockSystem,
  type StatGroupDefinition,
  type StatRowFieldValues,
} from "@/lib/stat-blocks";

type Props = {
  systems: StatBlockSystems;
  control: Control<ElementFormInput, unknown, ElementValues>;
  register: UseFormRegister<ElementFormInput>;
  setValue: UseFormSetValue<ElementFormInput>;
  errors: FieldErrors<ElementFormInput>;
};

/**
 * The Stat blocks section of the element form: one card per system the
 * form's statBlocks value holds, each with the system's groups and a field
 * per stat as its type takes it, and under the cards a select that adds a
 * card for another system. The computed stats and the fed maxes are worked
 * out from the fields as they are typed, so the storyteller sees what the
 * table will show. The fields are the form's own (register), posted with
 * the rest of the element; taking a card off adds its system to
 * removedSystems, which is how the action tells a removed block from one
 * the form never showed.
 */
export function StatBlockFields({ systems, control, register, setValue, errors }: Props) {
  const blocks = useWatch({ control, name: "statBlocks" }) ?? {};
  const removed = useWatch({ control, name: "removedSystems" }) ?? [];
  const byKey = useMemo(
    () => new Map(systems.systems.map((system) => [systemKey(system.idSystem), system])),
    [systems],
  );
  const present = Object.keys(blocks).filter((key) => byKey.has(key));
  const addable = systems.systems.filter((system) => !(systemKey(system.idSystem) in blocks));

  function add(key: string) {
    const system = byKey.get(key);
    if (!system) return;
    setValue(
      `statBlocks.${key}`,
      toStatBlockFields(system.definition, emptyStatBlock(system.definition)),
      {
        shouldDirty: true,
      },
    );
    setValue(
      "removedSystems",
      removed.filter((idSystem) => idSystem !== system.idSystem),
    );
  }

  function remove(key: string) {
    const { [key]: _gone, ...rest } = blocks;
    setValue("statBlocks", rest, { shouldDirty: true });
    const idSystem = Number(key);
    if (!removed.includes(idSystem)) setValue("removedSystems", [...removed, idSystem]);
  }

  return (
    <Stack gap="3" data-testid="stat-block-fields">
      <Heading as="h3" size="sm">
        Stat blocks
      </Heading>
      {present.map((key) => (
        <SystemCard
          key={key}
          systemKey={key}
          system={byKey.get(key)!}
          fields={blocks[key]}
          control={control}
          register={register}
          errors={errors}
          onRemove={() => remove(key)}
        />
      ))}
      {addable.length > 0 && (
        <Field.Root>
          <Field.Label>
            {present.length > 0 ? "Add a stat block for another system" : "Add a stat block"}
          </Field.Label>
          <NativeSelect.Root size="sm" maxW="sm">
            <NativeSelect.Field value="" onChange={(event) => add(event.target.value)}>
              <option value="" disabled>
                Choose a system
              </option>
              {addable.map((system) => (
                <option key={system.idSystem} value={systemKey(system.idSystem)}>
                  {system.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
      )}
    </Stack>
  );
}

type PartErrors = Partial<Record<"value" | "min" | "max", { message?: string }>>;
type RowErrors = Record<string, PartErrors>;
/** A group's errors: by stat for a plain group, by row index then stat for one that repeats, plus the array's own message. */
type GroupErrors = RowErrors & RowErrors[] & { message?: string; root?: { message?: string } };

/** One system's card: its groups, each stat a field by its type, or a table of rows for a group that repeats. */
function SystemCard({
  systemKey: key,
  system,
  fields,
  control,
  register,
  errors,
  onRemove,
}: {
  systemKey: string;
  system: StatBlockSystem;
  fields: ElementFormInput["statBlocks"][string];
  control: Control<ElementFormInput, unknown, ElementValues>;
  register: UseFormRegister<ElementFormInput>;
  errors: FieldErrors<ElementFormInput>;
  onRemove: () => void;
}) {
  // Worked out from the fields as typed: the computed values, and the max a
  // connection feeds, which the pool's own field then does not ask for.
  const groups = evaluateStatBlock(system.definition, statBlockFromFields(fields));
  const errorsAt = errors.statBlocks?.[key] as Record<string, GroupErrors> | undefined;

  return (
    <Card.Root size="sm" data-testid={`stat-block-${key}`}>
      <Card.Header>
        <HStack justify="space-between" gap="2">
          <Heading as="h4" size="xs">
            {system.label}
          </Heading>
          <PrepIconButton label={`Remove the ${system.label} stat block`} onClick={onRemove}>
            <X />
          </PrepIconButton>
        </HStack>
      </Card.Header>
      <Card.Body>
        <Stack gap="4">
          {groups.map((group) => (
            <Stack key={group.name} gap="2">
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
                {group.label}
              </Text>
              {isRepeating(group) ? (
                <RepeatingGroupFields
                  systemKey={key}
                  definition={system.definition.groups.find((g) => g.name === group.name)!}
                  group={group}
                  control={control}
                  register={register}
                  errors={errorsAt?.[group.name]}
                />
              ) : (
                <SimpleGrid columns={{ base: 1, sm: 2 }} gap="3">
                  {group.stats.map((stat) => (
                    <StatField
                      key={stat.name}
                      stat={stat}
                      path={`statBlocks.${key}.${group.name}.${stat.name}`}
                      register={register}
                      errors={errorsAt?.[group.name]?.[stat.name]}
                    />
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          ))}
        </Stack>
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
  control: Control<ElementFormInput, unknown, ElementValues>;
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
  const labelOf = (statName: string) =>
    group.rows[0]?.stats.find((stat) => stat.name === statName)?.label ??
    definition.stats.find((stat) => stat.name === statName)?.label ??
    statName;
  const arrayError = errors?.root?.message ?? errors?.message;

  return (
    <Stack gap="2" data-testid={`stat-rows-${key}-${group.name}`}>
      {rows.fields.length > 0 && (
        <Table.Root size="sm" variant="line">
          <Table.Header>
            <Table.Row>
              {ordered.map((stat) => (
                <Table.ColumnHeader key={stat.name}>
                  {labelOf(stat.name) || stat.name}
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
                            path={`statBlocks.${key}.${group.name}.${i}.${stat.name}`}
                            register={register}
                            errors={errors?.[i]?.[stat.name]}
                            inline
                          />
                        )}
                      </Table.Cell>
                    );
                  })}
                  <Table.Cell verticalAlign="top">
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
          <Plus /> Add {group.label}
        </Button>
      </Box>
    </Stack>
  );
}

type StatPath =
  `statBlocks.${string}.${string}.${string}` | `statBlocks.${string}.${string}.${number}.${string}`;

/**
 * One stat's field or fields, by its type. Inline, in a table cell, the
 * stat's label is the column's header, so the inputs carry it as their
 * accessible name and draw none of their own.
 */
function StatField({
  stat,
  path,
  register,
  errors,
  inline = false,
}: {
  stat: EvaluatedStat;
  path: StatPath;
  register: UseFormRegister<ElementFormInput>;
  errors: PartErrors | undefined;
  inline?: boolean;
}) {
  const shown = (value: EvaluatedStat["value"]) => (value === null ? "—" : String(value));

  switch (stat.type) {
    case "display":
      if (stat.valueFrom !== undefined) {
        return (
          <ReadOnly
            label={stat.label}
            value={shown(stat.value)}
            note={`from ${stat.valueFrom}`}
            inline={inline}
          />
        );
      }
      return (
        <Field.Root invalid={!!errors?.value}>
          {!inline && <Field.Label>{stat.label}</Field.Label>}
          <Input
            size="sm"
            autoComplete="off"
            aria-label={inline ? stat.label : undefined}
            {...register(`${path}.value`)}
          />
          <Field.ErrorText>{errors?.value?.message}</Field.ErrorText>
        </Field.Root>
      );
    case "computed":
      return (
        <ReadOnly label={stat.label} value={shown(stat.value)} note="computed" inline={inline} />
      );
    case "rack":
      return (
        <Field.Root invalid={!!errors?.value}>
          {!inline && <Field.Label>{stat.label}</Field.Label>}
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              aria-label={inline ? stat.label : undefined}
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
    case "pool":
    case "stack": {
      const isPool = stat.type === "pool";
      return (
        <Box>
          {!inline && (
            <Text as="label" fontSize="sm" fontWeight="medium" display="block" mb="1">
              {stat.label}
            </Text>
          )}
          <HStack gap="2" align="flex-start">
            <Field.Root invalid={!!errors?.value}>
              <Input
                size="sm"
                autoComplete="off"
                aria-label={`${stat.label} value`}
                {...register(`${path}.value`)}
              />
              <Field.ErrorText>{errors?.value?.message}</Field.ErrorText>
            </Field.Root>
            {isPool && (
              <Field.Root invalid={!!errors?.min}>
                <Input
                  size="sm"
                  autoComplete="off"
                  placeholder="min 0"
                  aria-label={`${stat.label} min`}
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
                <Input
                  size="sm"
                  autoComplete="off"
                  placeholder={isPool ? "max" : "no max"}
                  aria-label={`${stat.label} max`}
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
  label,
  value,
  note,
  inline = false,
}: {
  label: string;
  value: string;
  note: string;
  inline?: boolean;
}) {
  return (
    <Box>
      {!inline && (
        <Text fontSize="sm" fontWeight="medium" mb="1">
          {label}
        </Text>
      )}
      <HStack gap="2" pt="1">
        <Text fontSize="sm" data-testid={`computed-${label}`}>
          {value}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {note}
        </Text>
      </HStack>
    </Box>
  );
}
