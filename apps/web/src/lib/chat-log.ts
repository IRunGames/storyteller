import type { ChatEntry } from "./chat";

// Lines the table itself puts in the chat, as the toaster takes toasts: a
// module-level store any component can post to, which the chat panel
// (components/play/play-chat.tsx) subscribes to. The chat is still a
// placeholder with its own local state, so this is the one way a line
// reaches it from outside; when the messaging service lands, posting here
// becomes sending through it, and the subscribers go.

type Listener = (entry: ChatEntry) => void;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

const posted: ChatEntry[] = [];
const listeners = new Set<Listener>();

export const chatLog = {
  /** Puts a line in the chat, from whoever is named, timed now. */
  post({ from, text }: { from: string; text: string }): ChatEntry {
    const entry: ChatEntry = {
      id: crypto.randomUUID(),
      kind: "text",
      from,
      time: timeFormat.format(new Date()),
      text,
    };
    posted.push(entry);
    for (const listener of listeners) listener(entry);
    return entry;
  },
  /** Every line posted so far, oldest first, for a chat that mounts after some were posted. */
  entries(): ChatEntry[] {
    return [...posted];
  },
  /** Hears each line as it is posted; returns the way to stop. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Forgets every line; for tests. */
  clear(): void {
    posted.length = 0;
  },
};
