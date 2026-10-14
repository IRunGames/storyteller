// The MQTT topics a story's tables talk over, all under one prefix so a
// broker rule can grant a whole story at once (story/#, or story/7/# later
// with per-story credentials). Only the state topic is in use; chat and the
// per-player topics are named here so nothing else claims their shape.

/** The prefix every topic of one story sits under. */
export function storyTopicPrefix(idStory: number): string {
  return `story/${idStory}`;
}

/** Where the storyteller's table publishes what the players' table shows. */
export function storyStateTopic(idStory: number): string {
  return `${storyTopicPrefix(idStory)}/state`;
}
