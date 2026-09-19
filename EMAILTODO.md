# Email TODO

Plan for adding an email provider to Storyteller, for (1) email-based login /
verification and (2) sending updates to users.

**Decision: Resend.** Free tier is 3,000 emails/month, capped at 100/day,
permanent, 1 custom domain, no card. Better Auth's own docs use it, Vercel has a
first-party Resend marketplace integration, and React Email lets the templates
live as `.tsx` next to the rest of the Next.js app. Pro is $20/mo for 50k if we
outgrow it.

## Stack context

- Next.js 16 on Vercel (`apps/web`)
- Better Auth 1.7 (`apps/web/src/lib/auth.ts`) — currently Google OAuth only
- Drizzle + Neon Postgres
- Sending domain: `mail.irun.games` (subdomain, see below)

## Checklist

### Account + domain
- [ ] Create Resend account, add via Vercel Marketplace integration so
      `RESEND_API_KEY` lands in the Vercel project env automatically
- [ ] Verify the **subdomain** `mail.irun.games` in Resend (not the root domain,
      so app sending reputation stays separate from personal mail on irun.games)
- [ ] Add the DNS records Resend gives you: SPF, DKIM, and a DMARC record
      (`_dmarc.mail.irun.games`, start with `p=none`)
- [ ] Add `RESEND_API_KEY` to `.env.local` for dev (`vercel env pull`)
- [ ] Decide the from address, e.g. `Storyteller <noreply@mail.irun.games>`

### Code
- [ ] `npm i resend` in `apps/web` (plus `@react-email/components` if we want
      React templates rather than raw HTML strings)
- [ ] Create `apps/web/src/lib/email.ts` — single `resend` client + a
      `sendEmail({ to, subject, react|html })` helper so every send goes
      through one place
- [ ] Pick the login flavor (see below) and wire it into `auth.ts`
- [ ] Build the email template(s): verification / magic link, and later an
      "updates" template
- [ ] Add a "check your email" screen + resend link in the sign-in UI
- [ ] Test end to end in dev (Resend dashboard shows delivered/opened/bounced)

### Login flavor — pick one

**Option A: magic link (recommended for a personal/creative app — no password
reset flow to build).** Uses the `magicLink` plugin:

```ts
// apps/web/src/lib/auth.ts
import { magicLink } from "better-auth/plugins";
import { sendEmail } from "@/lib/email";

plugins: [
  magicLink({
    sendMagicLink: async ({ email, url }) => {
      await sendEmail({
        to: email,
        subject: "Sign in to Storyteller",
        html: `<p>Click <a href="${url}">here</a> to sign in.</p>`,
      });
    },
  }),
  nextCookies(), // must stay last
],
```

Client side: `authClient.signIn.magicLink({ email, callbackURL: "/" })`.
Also needs the `magicLinkClient()` plugin in the auth client.

**Option B: email + password with verification.**

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
},
emailVerification: {
  sendOnSignUp: true,
  sendVerificationEmail: async ({ user, url }) => {
    await sendEmail({
      to: user.email,
      subject: "Verify your email",
      html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
    });
  },
},
```

Option B also needs `sendResetPassword` and a reset-password page.

Either option is additive — Google OAuth stays as is.

### Updates / announcements (later)
- [ ] Use Resend **Audiences + Broadcasts** for newsletter-style updates from
      the same account; unsubscribe link is handled for us
- [ ] Add users to the audience on signup (or an opt-in checkbox) via
      `resend.contacts.create(...)` in a Better Auth `databaseHooks.user.create.after`
- [ ] Only if we later need segments/automations, look at Brevo (300/day free,
      but adds a "Sent with Brevo" footer on the free plan)

## Gotchas

- The 100/day free cap counts **every** send — verification + welcome + reset
  are three. Don't get chatty per signup. If we ever expect >100 signups in a
  day, upgrade to Pro ($20/mo) or switch to Brevo.
- Better Auth verification/magic-link URLs are built from `baseURL`, so make
  sure `BETTER_AUTH_URL` is set correctly per environment (Vercel preview URLs
  will differ from prod).
- Keep `nextCookies()` last in the `plugins` array.

## Alternatives considered (Sept 2026)

| Provider   | Free tier                              | Why not                                   |
|------------|----------------------------------------|-------------------------------------------|
| Brevo      | 300/day forever, full API + marketing  | "Sent with Brevo" footer on free plan     |
| Amazon SES | 3k/mo, first 12 months only, $0.10/1k  | Sandbox mode, bare-bones, more setup      |
| Mailgun    | 100/day forever, 1 domain              | Same cap as Resend, clunkier DX           |
| Postmark   | 100/**month**                          | Great deliverability, tiny free tier      |
| SendGrid   | 60-day trial only                      | No permanent free tier anymore            |
