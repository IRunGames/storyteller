import type { Control } from "react-hook-form";
import { joinRack, splitRack } from "@/lib/stat-blocks";
import type { StatBlockDefinitionFormInput } from "@/lib/stat-block-schemas";
import type { StatBlockDefinition, StatFormat, StatType } from "@/lib/stat-blocks";

/** The definition as the form holds it: each rack as the text of its field (StatBlockDefinitionFormInput). */
export type FormInput = StatBlockDefinitionFormInput;
export type EditorControl = Control<FormInput, unknown, StatBlockDefinition>;

/** The definition as the form holds it: each rack as the text of its field. */
export function toForm(definition: StatBlockDefinition): FormInput {
  return {
    groups: definition.groups.map((group) => ({
      ...group,
      stats: group.stats.map((stat) => ({ ...stat, rack: joinRack(stat.rack) })),
    })),
  };
}

/** The form's values as a definition, for the JSON tab; the schema does the same on save. */
export function toDefinition(values: FormInput): StatBlockDefinition {
  return {
    groups: values.groups.map((group) => ({
      ...group,
      stats: group.stats.map((stat) => ({ ...stat, rack: splitRack(stat.rack) })),
    })),
  };
}

export const EMPTY_STAT = {
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
  leftRight: false,
  initialRoll: "",
  initialFrom: "",
};

/**
 * The name a stat's clone takes: its source's with _copy, then _copy_2 and
 * on, whichever no stat in the group has yet, cut to fit the 40 characters a
 * name may be. The schema refuses two stats of one name in a group, so a
 * clone that kept its source's name could not be saved until renamed. A stat
 * not yet named gives a clone not yet named, since "_copy" alone is no name.
 */
export function cloneName(name: string, taken: string[]): string {
  const base = name.trim();
  if (base === "") return "";
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "_copy" : `_copy_${n}`;
    const candidate = base.slice(0, 40 - suffix.length) + suffix;
    if (!taken.includes(candidate)) return candidate;
  }
}
