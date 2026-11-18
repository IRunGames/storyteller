"use client";

import {
  useWatch,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { Accordion, Field, HStack, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { isRepeating, statLabel } from "@/lib/stat-blocks";
import type { EditorControl, FormInput } from "./stat-block-definition-form";
import { FlagCheckbox, StatRows } from "./stat-block-definition-rows";

export function GroupItem({
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
          <IconButtonWithTooltip
            label="Move group up"
            size="2xs"
            disabled={g === 0}
            onClick={() => moveGroup(g, g - 1)}
          >
            <ArrowUp />
          </IconButtonWithTooltip>
          <IconButtonWithTooltip
            label="Move group down"
            size="2xs"
            disabled={g === count - 1}
            onClick={() => moveGroup(g, g + 1)}
          >
            <ArrowDown />
          </IconButtonWithTooltip>
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
        <IconButtonWithTooltip label="Remove group" onClick={() => removeGroup(g)}>
          <Trash2 />
        </IconButtonWithTooltip>
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
 * on a stat with a die, Up/down on one held to a number, Left/right on a
 * rack, Initialized as with its dice box or the Dice stat it rolls on a
 * pool, a stack or a display held to a number, and Clone and the trashcan
 * at the end. A child
 * component rather than a loop in the
 * editor, since a field array must be hooked per group: useFieldArray takes
 * one name, and hooks cannot run in a loop.
 */
