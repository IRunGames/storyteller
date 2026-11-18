/**
 * Whether a request to a cron route came from the scheduler: Vercel sends
 * CRON_SECRET as a bearer token, and the route answers nobody else. With no
 * secret set, as in local development, every request is refused rather
 * than every request let through. The jobs have no session to check
 * (test/guest-gate.test.ts leaves them out for that reason), so this is
 * their whole gate.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}
