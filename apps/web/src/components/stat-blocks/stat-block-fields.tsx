"use client";

import { useMemo } from "react";
import {
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import {
  Box,
  Card,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { X } from "lucide-react";
import type { StatBlockSystems } from "@/app/(app)/(nav)/libraries/actions";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import type { ElementFormInput, ElementValues } from "@/lib/element-schemas";
import {
  emptyStatBlock,
  evaluateStatBlock,
  statBlockFromFields,
  systemKey,
  toStatBlockFields,
  type EvaluatedStat,
  type StatBlockSystem,
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

/** One system's card: its groups, each stat a field by its type. */
function SystemCard({
  systemKey: key,
  system,
  fields,
  register,
  errors,
  onRemove,
}: {
  systemKey: string;
  system: StatBlockSystem;
  fields: ElementFormInput["statBlocks"][string];
  register: UseFormRegister<ElementFormInput>;
  errors: FieldErrors<ElementFormInput>;
  onRemove: () => void;
}) {
  // Worked out from the fields as typed: the computed values, and the max a
  // connection feeds, which the pool's own field then does not ask for.
  const groups = evaluateStatBlock(system.definition, statBlockFromFields(fields));
  const errorsAt = errors.statBlocks?.[key] as
    | Record<string, Record<string, Partial<Record<"value" | "min" | "max", { message?: string }>>>>
    | undefined;

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
            </Stack>
          ))}
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

type StatPath = `statBlocks.${string}.${string}.${string}`;

/** One stat's field or fields, by its type. */
function StatField({
  stat,
  path,
  register,
  errors,
}: {
  stat: EvaluatedStat;
  path: StatPath;
  register: UseFormRegister<ElementFormInput>;
  errors: Partial<Record<"value" | "min" | "max", { message?: string }>> | undefined;
}) {
  const shown = (value: EvaluatedStat["value"]) => (value === null ? "—" : String(value));

  switch (stat.type) {
    case "display":
      if (stat.valueFrom !== undefined) {
        return (
          <ReadOnly label={stat.label} value={shown(stat.value)} note={`from ${stat.valueFrom}`} />
        );
      }
      return (
        <Field.Root invalid={!!errors?.value}>
          <Field.Label>{stat.label}</Field.Label>
          <Input size="sm" autoComplete="off" {...register(`${path}.value`)} />
          <Field.ErrorText>{errors?.value?.message}</Field.ErrorText>
        </Field.Root>
      );
    case "computed":
      return <ReadOnly label={stat.label} value={shown(stat.value)} note="computed" />;
    case "rack":
      return (
        <Field.Root invalid={!!errors?.value}>
          <Field.Label>{stat.label}</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field {...register(`${path}.value`)}>
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
          <Text as="label" fontSize="sm" fontWeight="medium" display="block" mb="1">
            {stat.label}
          </Text>
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
function ReadOnly({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" mb="1">
        {label}
      </Text>
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
