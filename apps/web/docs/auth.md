# Authentication

How sign-up, sign-in and route protection work in the web app.

## Stack

| Piece | What it does |
|---|---|
| [better-auth](https://better-auth.com) 1.7.x | Issues sessions, hashes passwords, runs the OAuth dance |
| Drizzle adapter | Lets Better Auth read/write our own tables instead of its default ones |
| node-postgres (`pg`) | The driver, pointed at the `irun` schema |
| Next.js 16 App Router | Route groups for access tiers, `proxy.ts` for the cheap gate |
| Chakra UI v3 | The forms |

Two sign-in methods are enabled: **email + password** (minimum 8 characters) and
**Google OAuth**. A third kind of session has no account behind it: a **guest**,
someone who followed a story's join link (see [Guests](#guests)).

## Routes

Route groups set the access tier. The group name is not part of the URL.

### Public pages

These are the only pages reachable without a session.

| URL | Source | Who can reach it |
|---|---|---|
| `/` | [`(public)/page.tsx`](<../src/app/(public)/page.tsx>) | Anyone, signed in or not |
| `/login` | [`(auth)/login/`](<../src/app/(auth)/login/page.tsx>) | Signed-out only — signed-in users bounce to `/home`, guests excepted |
| `/signup` | [`(auth)/signup/`](<../src/app/(auth)/signup/page.tsx>) | Signed-out only — same bounce |
| `/join/[code]` | [`(public)/join/[code]/`](<../src/app/(public)/join/[code]/page.tsx>) | Anyone holding a story's join link; see [Guests](#guests) |
| `/invite/[token]` | [`(public)/invite/[token]/`](<../src/app/(public)/invite/[token]/page.tsx>) | Anyone holding an invitation's link; see [Invitations](#invitations) |
| `/api/auth/*` | [`api/auth/[...all]/route.ts`](<../src/app/api/auth/[...all]/route.ts>) | Better Auth's own handler |
| `/api/cron/*` | [`api/cron/`](../src/app/api/cron/) | Vercel Cron only — no session, each job checks `Authorization: Bearer $CRON_SECRET` itself: `blob-sweep` and `guest-sweep` |
| `/images/*` | [`public/images/`](../public/images/) | Anyone — the pictures the landing, waiting and error pages paint; the proxy skips them so a visitor with no cookie sees the landing page's |

### Private pages

Everything else lives under `(app)`, whose
[`layout.tsx`](<../src/app/(app)/layout.tsx>) requires a session and mounts
`UserProvider`. Within it there are two groups; a new signed-in page goes in
one of them and is protected by being there.

| Group | Source | What it holds |
|---|---|---|
| `(app)/(nav)` | [`(nav)/layout.tsx`](<../src/app/(app)/(nav)/layout.tsx>) | Every signed-in page that carries the menu bar: the landing page after login (`/home`) and the sections the bar links to |
| `(app)/play` | [`play/[id]/page.tsx`](<../src/app/(app)/play/[id]/page.tsx>) | The players' table and waiting room, with their own full-screen layout and no menu bar. The story's owner is sent on to `/run/[id]` |
| `(app)/run` | [`run/[id]/page.tsx`](<../src/app/(app)/run/[id]/page.tsx>) | The storyteller's table, with the story's library down the side. Only the story's owner gets in; anyone else gets the not-found page |
| `(app)/table` | [`table/[id]/page.tsx`](<../src/app/(app)/table/[id]/page.tsx>) | The display table: the scene large, with nothing to press, for a shared screen or a guest. The story's owner and its players get in, guests included; anyone else gets the not-found page |
| `(app)/(nav)/admin` | [`admin/invitations/page.tsx`](<../src/app/(app)/(nav)/admin/invitations/page.tsx>) | The administrators' tools, behind the menu bar's wrench. Anyone short of an administrator gets the not-found page, and every action checks `requireAdmin()` |
| `(app)/preview` | [`preview/scene/[id]/page.tsx`](<../src/app/(app)/preview/scene/[id]/page.tsx>) | A read-only look at one scene as the players would see it, keyed on the scene, opened in a new tab from the storyteller's scene selector. The story's owner and its players get in; anyone else gets the not-found page |

## The flow

```
          ┌── /signup ──► signUp.email() ──┐
visitor ──┤                                ├──► session cookie set ──► /home
          └── /login ───► signIn.email() ──┘         (or Google OAuth round trip)
```

Both forms are client components that call the Better Auth client
([`auth-client.ts`](../src/lib/auth-client.ts)), which POSTs to `/api/auth/*`.
On success the server sets an HTTP-only session cookie, and the form calls
`router.push(redirectTo)` followed by `router.refresh()` — the refresh is what
re-runs the Server Components so the layout sees the new cookie.

Each form page is a **Server Component** that reads `searchParams` and hands
`redirectTo` to a client form beside it. Doing it this way avoids
`useSearchParams` and the Suspense boundary it would otherwise require.

Google is both sign-up and sign-in — the provider decides which — so
[`GoogleButton`](../src/components/auth/google-button.tsx) is the same component
on both pages with different wording.

## How protection works

Two tiers, and you need both.

**Tier 1 — [`proxy.ts`](../src/proxy.ts)** (Next 16's name for middleware). Calls
`getSessionCookie()` to check a session cookie is *present*. This is an
optimistic filter, not a security boundary: it never touches the database, so a
stale or forged cookie passes it. It cannot query the database — this runtime
can't open a `pg` pool. All it buys is skipping a round trip to a page that
would redirect anyway.

It only guards the signed-out direction (no cookie on a protected route →
`/login`). It deliberately does *not* bounce cookie-holders away from `/login`:
a stale cookie (session row deleted or expired while the browser still has the
token) would then loop — `(app)/layout` sends the visitor to `/login`, the proxy
sends them straight back. Better Auth tries to clear the stale cookie from
`getSession()`, but Server Components cannot set cookies, so it survives.
`(auth)/layout` does the signed-in bounce authoritatively instead.

**Tier 2 — [`requireSession()`](../src/lib/require-session.ts)**. Validates the
session against the database. This is the real boundary. It is wrapped in React
`cache()`, so a layout and the page inside it share one lookup rather than two.

### Why protected pages call `requireSession()` themselves

[`(app)/layout.tsx`](<../src/app/(app)/layout.tsx>) calls it, but that is only a
backstop. **A layout's `redirect()` does not stop its child pages rendering** —
Next renders layouts and pages concurrently. A page that fetches data
unconditionally will still stream that data into the response body, even though
the status line is a 307.

So every protected Server Component that touches user data calls
`requireSession()` before fetching. The layout is defence in depth, not the
guarantee.

### Open redirects

`redirectTo` arrives in a query string, so it is attacker-controlled.
[`safeRedirect()`](../src/lib/safe-redirect.ts) narrows it to a same-origin
path — `https://evil.example` and the protocol-relative `//evil.example` both
fall back to `/home`.

## Guests

A storyteller hands out a join link from their table (the link button in the
run table's header, `sa_getJoinLink`, with a chip once anyone has joined by
it saying how many of the plan's seats are taken): `/join/<code>`, where the code is a
random 12 characters kept on `stories.join_code`. Following it needs no
account. The join page asks for a name, offering a random one ("Ferocious
Hamster"), and its form calls one of two actions:

- a visitor with no session calls `sa_joinAsGuest`. It checks the link and
  that a seat is free, and only then makes the guest, through Better Auth's
  [anonymous plugin](https://better-auth.com/docs/plugins/anonymous) called
  from the server (`auth.api.signInAnonymous`). That makes a real `s_users` row
  with `is_anonymous` set and a placeholder email, and sets a session cookie
  like any other. The guest is then named after the name they picked and
  seated. If the last seat went meanwhile, the guest is deleted again;
- a visitor with a session (an account, or a guest joining another table)
  calls `sa_joinByLink`, which seats them as they are.

Either way the seat is a `story_players` row with `is_from_link` set. The
seats the link may give out are capped by the storyteller's plan: 3 for an
unpaid storyteller, 10 for a paid one ([`lib/join.ts`](../src/lib/join.ts)).
Invited players do not count.

The plugin's own endpoints, `/api/auth/sign-in/anonymous` and
`/api/auth/delete-anonymous-user`, are closed over HTTP (`disabledPaths` in
[`auth.ts`](../src/lib/auth.ts)), so a guest can only come from a join link.

**What a guest may do.** A guest only reads the table they joined. The pages
keep them there:

- `(nav)/layout.tsx` sends a guest to `/signup`: nothing behind the menu bar
  is theirs;
- `/play/[id]` and its waiting room send a guest to `/table/[id]`;
- `(auth)/layout.tsx` lets a guest's session through to `/login` and
  `/signup` instead of bouncing it to `/home`.

The server actions enforce it, since an action is a POST anyone holding a
cookie can make whatever the pages show. Every action starts with
`requireAccount()` ([`authorize.ts`](../src/lib/authorize.ts)), which refuses
a guest, except the few the display table and its waiting room need: reading
the story, the scene, its sessions, the chat and the live channel, keeping
the guest's presence, reading their preferences, joining by link and
leaving. Those start with `requireUser()` and are listed in
[`guest-gate.test.ts`](../src/test/guest-gate.test.ts), which fails for any
other action that lets a guest through. The realtime login a table gets
can only subscribe, so a guest cannot publish to the broker either.

**Linking.** Logging in or signing up while holding a guest's session links
it: the plugin calls `onLinkAccount` in [`auth.ts`](../src/lib/auth.ts) with
both users, then deletes the anonymous one.
[`moveGuestToUser`](../src/db/guests.ts) runs first and moves the guest's
seats, presence and chat lines to the account. It has to: `story_players`,
`user_preferences` and `user_systems` would block the delete, and `chats`
would lose its authors to `ON DELETE SET NULL`. The display table's Log in /
Sign up button carries `redirectTo=/table/[id]`, and the links between
`/login` and `/signup` keep it, so the new account lands back at the table.

**Removing guests.** A guest is nothing but their seats, so a guest who
leaves a story loses their seat and presence there
([`removeGuestsFromStory`](../src/db/guests.ts)), and a guest left seated
nowhere is deleted, their session with them:

- **Leave** on the display table, or **Give up** in its waiting room
  (`sa_leaveAsGuest`), takes the guest out of that story and sends them to
  the landing page;
- **closing the display table's page** sends a beacon on `pagehide` to
  [`/api/table/leave`](../src/app/api/table/leave/route.ts). The guest goes
  AWAY at once, and `GUEST_AWAY_GRACE_MS` (10 seconds) later, unless their
  table has come back and made them PRESENT again, they are taken out of the
  story. The wait is there because a reload sends the same event: the
  reloaded table seats the guest again before it runs out;
- **the storyteller removing them**, from the list of who joined at the
  bottom of the run table's join link popover (`sa_removeLinkPlayer`). Someone
  with an account who came in by the link loses their seat and presence there
  and keeps their account;
- **ending a session** (`sa_setRowStatus` to DONE) takes every guest seated
  at the story out of it, whether or not they sat at that session. Their
  table finds it can no longer load the scene and sends them to the landing
  page;
- **anything those miss** (a browser that never sent the beacon, a guest a
  full table turned away) is caught by the daily
  [`guest-sweep`](../src/app/api/cron/guest-sweep/route.ts) cron job, which
  deletes guests more than a day old whose sessions have all expired.

Each table a deleted guest was at is told its new head count. Chat lines
guests wrote before they were refused writing stay, with no author.

## Invitations

An invitation is a link, `/invite/<token>`, that brings someone in with an
account rather than as a guest. There are two kinds, both rows of
`invitations` ([`db/invitations.ts`](../src/db/invitations.ts)):

- **A storyteller's**, to one of their stories: the Invite by Email button
  beside Invite Players (`sa_inviteToStory`). Only the story's owner may
  send one. Accepting it seats the account at the story. The seat is not a
  link seat, so it does not count against the join link's cap.
- **An administrator's**, to the app with an account type: the Invitations
  page behind the menu bar's wrench (`sa_inviteToApp`). The type is Paid
  Player or Paid Storyteller. Accepting it raises the account to that type
  and never lowers one: the smaller id is the more powerful
  ([`user-types.ts`](../src/lib/user-types.ts)), so the new type is
  `least(current, invited)`, and an administrator who accepts stays an
  administrator.

Each is emailed through Resend ([`lib/email.ts`](../src/lib/email.ts)), or
made without mail and copied as a link to send some other way. A mail that
does not go out leaves the invitation in place, and the sender is told to
copy the link instead. The link is built from `BETTER_AUTH_URL` in mail, and
from the page's own origin when copied.

Only production mails the person invited. Everywhere else (development, test,
staging, or an environment that is not set) every message goes to the address
in `EMAIL_NON_PRODUCTION_TO` instead, its subject prefixed with
`[to: <intended address>]`, so trying an invite out never reaches a stranger
with a link to someone's localhost. Without `EMAIL_NON_PRODUCTION_TO` there,
nothing is sent and the invitation's link is copied instead. Production does
not read it.

**One at a time.** An email may have one waiting invitation per story, and
one to the app. Two partial unique indexes enforce it, so two sends racing
each other cannot both get in; a second is refused with "That email already
has an invitation waiting". The indexes cannot see expiry, so an expired
invitation is revoked as the next one is made, which frees the email.
Withdrawing (a storyteller) or deleting (an administrator) frees it too.

**Accepting.** The token is what is redeemed, whatever address the account
has, so a link passed on by text, or a Google account under another address,
still works; the invited address only fills in the signup form. On the
invite page:

- someone signed in with an account presses Accept (`sa_acceptInvitation`)
  and goes on to `/play/[id]` for a story, or `/home`;
- anyone else, a guest included, is offered Sign up
  (`/signup?redirectTo=/invite/<token>&email=<invited>`) or Log in, and comes
  back to the invite page to accept. Google's `callbackURL` carries the same
  `redirectTo`. There is no guest step, and one accept path serves every way
  of signing in;
- a used, withdrawn or expired link says it is no longer valid.

Accepting locks the row for its transaction, so one link opened in two tabs
is accepted once. A link lasts `INVITE_TTL_DAYS` (14 days); an administrator
can set a later day from the Edit dialog, which also brings an expired
invitation back. An accepted invitation cannot be edited. Deleting one
removes only the record; the seat or type it gave stays.

## Storage

Better Auth's four models map onto our own tables in the `irun` schema via
[`db/schema.ts`](../src/db/schema.ts): `s_users`, `s_sessions`, `s_accounts`,
`s_verifications`. The exported names stay singular because the Drizzle adapter
looks tables up by those keys; the SQL names are ours.

Primary keys are `uuidv7()` defaults generated by Postgres, not the app — v7 is
time-ordered, so inserts append to the right edge of the index. Password hashes
live in `accounts.password`; a Google-only user simply has no password there.

dbmate owns the schema (see [`db/README.md`](../../../db/README.md)).
`schema.ts` describes what dbmate already built — it is not the source of truth.

## Current gaps

- **Email verification is off.** Resend is wired up for invitations
  (`lib/email.ts`), but Better Auth is not given a `sendVerificationEmail`, so
  `requireEmailVerification: false` and `email_verified` stays false. Sign-in
  is not blocked by it.
- **Google needs credentials.** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are
  empty in `.env.local`; the button won't work until they're filled in.
- **No password reset or "forgot password" flow yet.**

## Local setup

`DATABASE_URL` must use `options=-c search_path=irun`, **not** the
`search_path=irun` form that [`db/.env`](../../../db/.env) uses. dbmate's Go
driver understands the latter; node-postgres silently drops unknown connection
parameters and would resolve to the `public` schema and find no tables.

```
DATABASE_URL=postgres://localhost:5432/runner?sslmode=disable&options=-c%20search_path%3Dirun
```
