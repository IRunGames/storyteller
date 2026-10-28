-- migrate:up
-- Guests: someone who follows a story's join link without an account is
-- signed in as an anonymous user by Better Auth's anonymous plugin, which
-- reads and writes is_anonymous on the user row. Signing up or logging in
-- afterwards moves what the guest did onto the real account and deletes the
-- anonymous row (apps/web/src/db/guests.ts).
ALTER TABLE s_users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

-- The random code in a story's join link, /join/<code>. Null until the
-- storyteller first asks for the link; unique so a code names one story.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS join_code text;
CREATE UNIQUE INDEX IF NOT EXISTS stories_join_code_key ON stories (join_code);

-- A seat taken through the join link rather than by invitation or by
-- joining a story that is looking for players. The storyteller's plan caps
-- how many of these a story may have.
ALTER TABLE story_players ADD COLUMN IF NOT EXISTS is_from_link boolean NOT NULL DEFAULT false;

-- migrate:down
