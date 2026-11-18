import type { ChannelStatus } from "@/components/play/use-story-channel";

/**
 * What a table that follows the storyteller says of each state the live
 * connection can be in short of connected; connected says nothing, since
 * live is the usual state. The players' table (PlaySpace) and the display
 * table (PassiveTable) say the same words.
 */
export const STATUS_NOTES: Partial<Record<ChannelStatus, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Offline: changes will show when the connection is back.",
  unavailable: "Live updates are off; reload to see changes.",
};
