# How are we gonna do this?

## Technologies

- bun for running scripts and migrations
- postgres for database
- dbmate for db migrations
- real-time comms mqtt

- NextJS for web app
  - Drizzle for queries and mutations
  - Zod for SQL checking and form schemas
  - react-hook-form for form state, wired to Zod via @hookform/resolvers
  - better-auth for authentication (drizzle adapter), with its anonymous plugin for guests who join a story by link (docs/auth.md)
  - Chakra ui v3
  - lucide-react for icons; the only hand-drawn SVGs are marks (the themes' marks in `src/components/nav/icons.tsx`, the Google mark in the sign-in button)
  - next-themes
    > For SSR: the recommended pattern reads the active theme from a cookie during your Next.js RootLayout render and injects the matching theme CSS inline in <head>, so the server-rendered HTML is already correct on first paint — same flash-free approach you'd expect from MUI's SSR theme setup.
  - Data access: every read and write is a server action in the route's `actions.ts`, starting with `requireAccount()` from `src/lib/authorize.ts`, which checks the session and the user row (exists, active, not a guest) before the query runs; the few a guest may call use `requireUser()`, which lets a guest through. No separate query layer.
  - @vercel/blob for image uploads, browser-direct to a public store
  - @dice-roller/rpg-dice-roller for the table chat's `/roll`, on the server only (`src/lib/dice.ts`), drawing from Web Crypto
  - mqtt (mqtt.js) in the browser, over WebSocket TLS, for the players' table to follow the storyteller's; the server publishes through EMQX's REST API (`src/lib/realtime/`)

## Hosting

- Vercel (nextjs, Vercel Blob)
- Neon (postgres)
- EMQX (mqtt)
