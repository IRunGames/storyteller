// Telling the database's refusals apart from everything else that can go
// wrong on a query. An action that catches around a write must let a lost
// connection or a bug surface as the error it is; only the refusal it
// expected is turned into an answer for the form.

/**
 * The SQLSTATE of a database error, or undefined when the error carries none.
 * The code sits on the pg error itself when it is thrown raw, and on `cause`
 * when Drizzle wraps the failed query in an error of its own, so both are
 * read.
 */
export function pgErrorCode(error: unknown): string | undefined {
  const own = codeOf(error);
  if (own !== undefined) return own;
  return codeOf((error as { cause?: unknown } | null)?.cause);
}

function codeOf(value: unknown): string | undefined {
  const code = (value as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

/** A unique constraint or index refused the row: SQLSTATE 23505. */
export const isUniqueViolation = (error: unknown): boolean => pgErrorCode(error) === "23505";

/**
 * A status transition trigger refused the move. The triggers use a bare
 * RAISE EXCEPTION (db/functions/_tables_metatable/validate_status_transition.sql
 * and validate_transition_from_status_keys.sql), which Postgres reports under
 * P0001, raise_exception, since no ERRCODE is named.
 */
export const isTransitionRefusal = (error: unknown): boolean => pgErrorCode(error) === "P0001";
