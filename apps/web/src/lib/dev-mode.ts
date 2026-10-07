/**
 * Whether this is `next dev`, for tools that only a developer should see,
 * such as the account menu's Cause error. Next writes the value of
 * process.env.NODE_ENV into the browser bundle at build time, so in a
 * production build this is false and what it guards is never offered. It
 * reads the variable on each call rather than once at import so a test can
 * set it.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}
