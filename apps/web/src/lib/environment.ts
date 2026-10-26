// Which deployment this is, and when it was built.
//
// NEXT_PUBLIC_ENVIRONMENT comes from the environment: .env.local on a
// developer's machine, the project's settings in Vercel for a deployment.
// NEXT_PUBLIC_BUILT_AT is never set by hand; next.config.ts stamps it when
// Next loads its config, so it is the build's time for `next build`, the
// GitHub workflow's `vercel build` and a build on Vercel alike, and the time
// the server started under `next dev`.
//
// Both are NEXT_PUBLIC_, so Next writes their values into the browser bundle
// at build time. That only happens for a literal `process.env.NEXT_PUBLIC_…`,
// which is why they are read here by name rather than through a lookup.

export const ENVIRONMENTS = ["DEV", "TEST", "STAGING", "PRODUCTION"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

/**
 * The value as one of ENVIRONMENTS, or a thrown error that says what is
 * wrong. next.config.ts calls this so a missing or misspelled value fails
 * the build, rather than shipping a deployment that does not know what it
 * is.
 */
export function parseEnvironment(value: string | undefined): Environment {
  if (value === undefined) {
    throw new Error(`NEXT_PUBLIC_ENVIRONMENT is not set; use one of ${ENVIRONMENTS.join(", ")}.`);
  }
  if (!(ENVIRONMENTS as readonly string[]).includes(value)) {
    throw new Error(
      `NEXT_PUBLIC_ENVIRONMENT is "${value}"; use one of ${ENVIRONMENTS.join(", ")}.`,
    );
  }
  return value as Environment;
}

/**
 * This deployment's environment, or null when it is unset or not one of
 * ENVIRONMENTS. The build refuses both, so null only happens under test. It
 * reads the variable on each call rather than once at import so a test can
 * set it.
 */
export function currentEnvironment(): Environment | null {
  const value = process.env.NEXT_PUBLIC_ENVIRONMENT;
  return (ENVIRONMENTS as readonly string[]).includes(value ?? "") ? (value as Environment) : null;
}

/** Where something is shown: strictly below one level, strictly above one, or between. */
export type EnvironmentRule = { showBelow?: Environment; showAbove?: Environment };

/**
 * Whether `environment` passes `rule`, comparing places in ENVIRONMENTS. Both
 * bounds are strict, so showBelow "PRODUCTION" is every environment but
 * production. A rule with neither bound, or no environment, shows nothing:
 * hidden is the default, so something meant for development never reaches
 * production by being written without its rule.
 */
export function isShownIn(environment: Environment | null, rule: EnvironmentRule): boolean {
  if (environment === null) return false;
  if (rule.showBelow === undefined && rule.showAbove === undefined) return false;
  const at = ENVIRONMENTS.indexOf(environment);
  if (rule.showBelow !== undefined && at >= ENVIRONMENTS.indexOf(rule.showBelow)) return false;
  if (rule.showAbove !== undefined && at <= ENVIRONMENTS.indexOf(rule.showAbove)) return false;
  return true;
}

/**
 * When this build was made, as an ISO 8601 timestamp in UTC, or null when it
 * is unset, which only happens under test. Read on each call, as
 * currentEnvironment() is.
 */
export function builtAt(): string | null {
  return process.env.NEXT_PUBLIC_BUILT_AT || null;
}
