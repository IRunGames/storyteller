-- migrate:up
-- A /roll said in the table chat: the notation, what it was for, the total,
-- each die and the roll written out (apps/web/src/lib/roll.ts has the
-- shape). Null for every other line. chat_text still holds the line the
-- roll says, "6 for initiative", so anything reading text alone reads it.
ALTER TABLE chats ADD COLUMN IF NOT EXISTS roll jsonb;

-- migrate:down
