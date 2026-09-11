# How are we gonna do this?

## Technologies

- NextJS
- Drizzle for queries and mutations
- Zod for SQL checking
- postgres for database
- better-auth for authentication (drizzle adapter)
- Charkra ui v3
- next-themes
  > For SSR: the recommended pattern reads the active theme from a cookie during your Next.js RootLayout render and injects the matching theme CSS inline in <head>, so the server-rendered HTML is already correct on first paint — same flash-free approach you'd expect from MUI's SSR theme setup.
- real-time comms mqtt
- bun for running scripts and migrations
- bunx dbmate for migrations

## Hosting

- Vercel (nextjs, Vercel Blob)
- Neon (postgres)
- hivemq (mqtt)
