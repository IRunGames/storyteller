"use client";

import { useId, useState } from "react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import {
  Box,
  Button,
  Checkbox,
  Field,
  HStack,
  Input,
  NativeSelect,
  Popover,
  Portal,
  Stack,
  Tooltip,
} from "@chakra-ui/react";
import { ArrowDown, ArrowUp, Copy, Dices, Plus, Trash2 } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { DiceInput } from "@/components/stat-blocks/dice-input";
import {
  canRoll,
  hasDie,
  hasFormat,
  defaultFormat,
  isNumberFormat,
  ROLL_PRESETS,
  STAT_FORMAT_LABELS,
  STAT_FORMATS,
  STAT_TYPE_LABELS,
  STAT_TYPES,
  statLabel,
  type StatFormat,
  type StatType,
} from "@/lib/stat-blocks";
import {
  cloneName,
  EMPTY_STAT,
  type EditorControl,
  type FormInput,
} from "./stat-block-definition-form";

export function StatRows({
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

  /**
   * A copy of the stat as it stands, flags, roll and all, in the row after
   * it, where it can be told apart from its source while it is renamed.
   * insert() puts the cursor in the copy's Name for that.
   */
  function cloneStat(s: number) {
    const source = types?.[s];
    if (source === undefined) return;
    const taken = types.map((stat) => stat.name.trim());
    stats.insert(s + 1, { ...source, name: cloneName(source.name, taken) });
  }

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
              <IconButtonWithTooltip
                label="Move up"
                size="2xs"
                disabled={s === 0}
                onClick={() => stats.move(s, s - 1)}
              >
                <ArrowUp />
              </IconButtonWithTooltip>
              <IconButtonWithTooltip
                label="Move down"
                size="2xs"
                disabled={s === stats.fields.length - 1}
                onClick={() => stats.move(s, s + 1)}
              >
                <ArrowDown />
              </IconButtonWithTooltip>
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
                          setValue(`groups.${g}.stats.${s}.initialFrom`, "");
                        }
                        if (!hasDie({ type: next, format: nextFormat })) {
                          setValue(`groups.${g}.stats.${s}.global`, false);
                        }
                        if (!isNumberFormat(nextFormat)) {
                          setValue(`groups.${g}.stats.${s}.upDown`, false);
                        }
                        if (next !== "rack") {
                          setValue(`groups.${g}.stats.${s}.leftRight`, false);
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
                            setValue(`groups.${g}.stats.${s}.initialFrom`, "");
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
                  {type === "rack" && (
                    <FlagCheckbox
                      control={control}
                      name={`groups.${g}.stats.${s}.leftRight`}
                      tooltip="Show left/right buttons that move the rack at the table"
                    >
                      Left/right
                    </FlagCheckbox>
                  )}
                  {canRoll({ type, format }) && (
                    <InitialRollField
                      control={control}
                      setValue={setValue}
                      g={g}
                      s={s}
                      label={statLabel(types?.[s] ?? { name: "", label: "" })}
                      error={at?.initialRoll?.message}
                      fromError={at?.initialFrom?.message}
                    />
                  )}
                </HStack>
                <HStack pt="6" ml="auto" gap="0">
                  <IconButtonWithTooltip label="Clone stat" onClick={() => cloneStat(s)}>
                    <Copy />
                  </IconButtonWithTooltip>
                  <IconButtonWithTooltip label="Remove stat" onClick={() => stats.remove(s)}>
                    <Trash2 />
                  </IconButtonWithTooltip>
                </HStack>
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
 * Initialized as: a box that, ticked, opens a choice of what is rolled for
 * the stat's starting value and max: dice typed here, in a dice box
 * (DiceInput), rolled once when the stat's block is added to an element and
 * the same for every element (initialRoll), or a Dice stat whose dice each
 * element holds its own of (initialFrom), rolled on the element's form once
 * they are filled in. The Dice stats offered are those the stat can read
 * (initialSource): any in a plain group for a stat in a plain group, its own
 * group's for a stat in a group that repeats. Unticked, both are cleared
 * and the stat starts at 0. Whether it is ticked is held here, starting
 * from whether either is set, so a box cleared to be retyped stays open; a
 * blank left in it saves as no roll. Controller for the reason FlagCheckbox
 * gives.
 */
function InitialRollField({
  control,
  setValue,
  g,
  s,
  label,
  error,
  fromError,
}: {
  control: EditorControl;
  setValue: UseFormSetValue<FormInput>;
  g: number;
  s: number;
  label: string;
  error?: string;
  fromError?: string;
}) {
  const value = useWatch({ control, name: `groups.${g}.stats.${s}.initialRoll` });
  const from = useWatch({ control, name: `groups.${g}.stats.${s}.initialFrom` });
  const groups = useWatch({ control, name: "groups" });
  const [ticked, setTicked] = useState(value !== "" || from !== "");

  const own = groups?.[g];
  const sources = (groups ?? [])
    .filter((group) =>
      own && own.keyedBy.trim() !== "" ? group === own : group.keyedBy.trim() === "",
    )
    .flatMap((group) =>
      group.stats
        .filter((stat) => stat.type === "dice" && group.name.trim() && stat.name.trim())
        .map((stat) => ({
          value: `${group.name.trim()}.${stat.name.trim()}`,
          label: `Roll ${statLabel(stat)}`,
        })),
    );
  // A Dice stat renamed or taken away since is still shown, so the select
  // says what is saved; the schema says on save that it is gone.
  if (from !== "" && !sources.some((source) => source.value === from)) {
    sources.push({ value: from, label: `Roll ${from}` });
  }

  return (
    <Controller
      control={control}
      name={`groups.${g}.stats.${s}.initialRoll`}
      render={({ field }) => (
        <HStack gap="2" align="flex-start" wrap="wrap">
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              <Checkbox.Root
                name={field.name}
                checked={ticked}
                onCheckedChange={(details) => {
                  const next = details.checked === true;
                  setTicked(next);
                  if (!next) {
                    field.onChange("");
                    setValue(`groups.${g}.stats.${s}.initialFrom`, "");
                  }
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
                  Roll dice, or an element&apos;s own Dice stat, for its starting value and max
                </Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
          {ticked && (
            <Field.Root invalid={!!fromError} w="40" mt="-1">
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  aria-label={`${label} initialized from`}
                  value={from}
                  onChange={(event) => {
                    const next = event.target.value;
                    setValue(`groups.${g}.stats.${s}.initialFrom`, next, { shouldDirty: true });
                    // Dice typed here and a Dice stat are never both kept.
                    if (next !== "") field.onChange("");
                  }}
                >
                  <option value="">Dice</option>
                  {sources.map((source) => (
                    <option key={source.value} value={source.value}>
                      {source.label}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Field.ErrorText>{fromError}</Field.ErrorText>
            </Field.Root>
          )}
          {ticked && from === "" && (
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
export function FlagCheckbox({
  control,
  name,
  tooltip,
  children,
}: {
  control: EditorControl;
  name:
    | `groups.${number}.stats.${number}.${"visible" | "sticky" | "static" | "global" | "upDown" | "leftRight"}`
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
      <IconButtonWithTooltip
        label={`Roll for ${label}`}
        tooltip={roll !== "" ? `Rolls ${roll}` : `Roll for ${label}`}
        variant={roll !== "" ? "solid" : "ghost"}
        colorPalette={error ? "red" : roll !== "" ? "blue" : undefined}
        data-roll={roll || undefined}
        popoverTrigger={triggerId}
      >
        <Dices />
      </IconButtonWithTooltip>
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
