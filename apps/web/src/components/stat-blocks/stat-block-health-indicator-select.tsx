"use client";

import { useWatch, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Field, NativeSelect } from "@chakra-ui/react";
import { isNumberFormat, statLabel } from "@/lib/stat-blocks";
import type { EditorControl, FormInput } from "./stat-block-definition-form";

/**
 * The template's Health indicator: None, or one of its pools and stacks held
 * to a number in a group that does not repeat, each as "<stat> (<group>)" and
 * saved as "group.stat". Every pill whose element carries it shows its level
 * as a drop by the name. Read from the live groups, so a stat appears as it
 * is made eligible. A choice the groups no longer offer (the stat removed,
 * renamed or retyped) stays chosen under its saved name, so the schema's
 * message beside it reads against what is chosen, as Repeats by's does.
 */
export function HealthIndicatorSelect({
  control,
  register,
  errors,
}: {
  control: EditorControl;
  register: UseFormRegister<FormInput>;
  errors: FieldErrors<FormInput>;
}) {
  const field = register("healthIndicator");
  const chosen = useWatch({ control, name: "healthIndicator" }) ?? "";
  const groups = useWatch({ control, name: "groups" }) ?? [];
  const options = groups
    .filter((group) => group.keyedBy === "" && group.name.trim() !== "")
    .flatMap((group) =>
      group.stats
        .filter(
          (stat) =>
            (stat.type === "pool" || stat.type === "stack") &&
            isNumberFormat(stat.format) &&
            stat.name.trim() !== "",
        )
        .map((stat) => ({
          value: `${group.name}.${stat.name}`,
          label: `${statLabel(stat)} (${group.label || group.name})`,
        })),
    );
  if (chosen !== "" && !options.some((option) => option.value === chosen)) {
    options.push({ value: chosen, label: chosen });
  }
  return (
    <Field.Root invalid={!!errors.healthIndicator} w="64">
      <Field.Label>Health indicator</Field.Label>
      <NativeSelect.Root size="sm">
        {/* Held to the watched value, so a choice whose option is redrawn
            (a stat renamed) stays the one shown. */}
        <NativeSelect.Field {...field} value={chosen}>
          <option value="">None</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <Field.HelperText>
        A number pool or stack that indicates health/damage - shows on any element that has the stat
        (optional)
      </Field.HelperText>
      <Field.ErrorText>{errors.healthIndicator?.message}</Field.ErrorText>
    </Field.Root>
  );
}
