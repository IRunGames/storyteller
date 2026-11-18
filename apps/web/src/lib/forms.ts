import type { FieldValues, UseFormSetError } from "react-hook-form";
import type { z } from "zod";

/** What an action answers a form that it refused: one message per field, keyed as the form names it. */
export type FormErrors = Record<string, string>;

/** The key of a refusal with no field to sit on; react-hook-form shows it as `errors.root`. */
export const ROOT = "root";

/**
 * Zod's issues as a form wants them: keyed by the issue's path joined with
 * dots (`statBlocks.sys.stats.str`), the first message per key winning so a
 * field with two complaints shows one. An issue with no path, which a
 * refine() on the whole object gives, lands on "root", where every form
 * puts the error it has no field for (docs/standards.md, Forms). `prefix`
 * puts the issues under a field of the enclosing form when a nested schema
 * was parsed on its own.
 */
export function formErrors(error: z.ZodError, prefix: PropertyKey[] = []): FormErrors {
  const errors: FormErrors = {};
  for (const issue of error.issues) {
    const key = [...prefix, ...issue.path].map(String).join(".") || ROOT;
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * Puts an action's refusal onto a form: every key the form knows is set as
 * that field's error, and `root`, or a key the form has no field for (an id
 * the client never shows, say), goes on `root`, where every form shows what
 * it cannot attribute (docs/standards.md, Forms). Root's own message wins
 * over an unknown key's, and the first unknown key wins over the rest. With
 * nothing to show at all, `fallback` goes on root, for an action that
 * refused without saying why.
 *
 * `fields` is the names the form registers, or a predicate for a form whose
 * paths nest (`statBlocks.<system>.<group>.<stat>`). react-hook-form types
 * `setError` by the form's own field names, and the action's keys are plain
 * strings until this has checked them against `fields`, so the setter is
 * called through a wider type once a key is known.
 */
export function applyActionErrors<T extends FieldValues>(
  form: { setError: UseFormSetError<T> },
  errors: FormErrors,
  fields: readonly string[] | ((key: string) => boolean),
  fallback?: string,
) {
  const setError = form.setError as (name: string, error: { message: string }) => void;
  const known = typeof fields === "function" ? fields : (key: string) => fields.includes(key);
  let root: string | undefined;
  for (const [key, message] of Object.entries(errors)) {
    if (key === ROOT) continue;
    if (known(key)) setError(key, { message });
    else root ??= message;
  }
  root = errors[ROOT] ?? root ?? (Object.keys(errors).length === 0 ? fallback : undefined);
  if (root !== undefined) setError(ROOT, { message: root });
}
