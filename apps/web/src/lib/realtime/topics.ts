// The MQTT topics a story's tables talk over, all under one prefix so a
// broker rule can grant a whole story at once (story/#, or story/7/# later
// with per-story credentials). The prefix is the story, not the session: a
// story has one session open at most, so the story already names it, and a
// table need not resubscribe when a new sitting begins.

/** The prefix every topic of one story sits under. */
export function storyTopicPrefix(idStory: number): string {
  return `story/${idStory}`;
}

/** Where the storyteller's table publishes what the players' table shows. */
export function storyStateTopic(idStory: number): string {
  return `${storyTopicPrefix(idStory)}/state`;
}

/**
 * Where the story's table chat is published, every line as it is said or
 * edited. Its own topic rather than a message type on the state topic, so
 * a table that only wants the chat, or a later per-player rule, can take it
 * alone.
 */
export function storyChatTopic(idStory: number): string {
  return `${storyTopicPrefix(idStory)}/chat`;
}
