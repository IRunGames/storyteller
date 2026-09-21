# How are we gonna do this?

## Technologies

- NextJS
- Drizzle for queries and mutations
- Zod for SQL checking and form schemas
- react-hook-form for form state, wired to Zod via @hookform/resolvers
- postgres for database
- better-auth for authentication (drizzle adapter)
- Charkra ui v3
- next-themes
  > For SSR: the recommended pattern reads the active theme from a cookie during your Next.js RootLayout render and injects the matching theme CSS inline in <head>, so the server-rendered HTML is already correct on first paint — same flash-free approach you'd expect from MUI's SSR theme setup.
- real-time comms mqtt
- bun for running scripts and migrations
- bunx dbmate for migrations
- Data access: every read and write is a server action in the route's `actions.ts`, starting with `requireUser()` from `src/lib/authorize.ts`, which checks the session and the user row (exists, active) before the query runs. No separate query layer.

## Hosting

- Vercel (nextjs, Vercel Blob)
- Neon (postgres)
- hivemq (mqtt)
