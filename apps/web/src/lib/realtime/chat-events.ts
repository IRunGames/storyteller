import { z } from "zod";

// What goes over a story's chat topic: one line of the table chat, whole,
// each time it is said or edited. Shared by the server that publishes and
// the tables that read, so it holds no database or React code; the zod
// schema is what the browser checks an incoming message against, since
// anything could be published to a topic it can read.

/**
 * One line as every table may see it. idUser is the sender's id (the row's
 * id_created_by_user), so a table can tell its viewer's own lines, which
 * they may edit; from is the name the chat shows, "Storyteller" for the
 * story's storyteller. color and picture are the sender's from their
 * profile (a palette colour, a picture URL), or null where they have not
 * chosen one and the chat falls back to its own. createdAt is ISO, since
 * the message is JSON.
 */
export const publicChatSchema = z.object({
  idChat: z.number().int(),
  idStoryScene: z.number().int().nullable(),
  idUser: z.string().nullable(),
  from: z.string(),
  text: z.string(),
  isSystem: z.boolean(),
  isEdited: z.boolean(),
  createdAt: z.string(),
  color: z.string().nullable(),
  picture: z.string().nullable(),
});
export type PublicChat = z.infer<typeof publicChatSchema>;

const base = { v: z.literal(1), at: z.string(), idStory: z.number().int(), chat: publicChatSchema };

/**
 * The messages on a story's chat topic: a line said, or a line edited. Both
 * carry the line whole, so a table replaces what it holds by id either way.
 */
export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("chat.posted") }),
  z.object({ ...base, type: z.literal("chat.edited") }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
export type ChatEventType = ChatEvent["type"];

/** A message as read off the topic, or null for one that is not one of ours. */
export function parseChatEvent(raw: unknown): ChatEvent | null {
  const parsed = chatEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What a message is about, in a few words, for the diagnostics panel's log. */
export function chatEventTitle(event: ChatEvent): string {
  return `${event.type} · ${event.chat.from}: ${event.chat.text.slice(0, 40)}`;
}
