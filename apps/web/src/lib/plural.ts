/**
 * A count with its noun: "1 player", "3 players". The plural is the singular
 * with an s unless another is given ("person", "people"). Every count the
 * app writes out goes through this, so none of them spells the rule itself.
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
