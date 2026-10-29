import { atTableCount } from "@/db/session-player-counts";
import { deleteGuests, removeGuestsFromStory } from "@/db/guests";
import { publishLater, publishTableCount } from "@/lib/realtime/publish";

// Tells a story's table how many are at it now, as sa_joinSession does when
// someone sits down, so the chat's header does not go on counting a guest.
export function recountTable(idStory: number) {
  publishLater(async () => publishTableCount(idStory, await atTableCount(idStory)));
}

/** Deletes guests outright (deleteGuests), recounting every table they were at. */
export async function removeGuests(ids: string[]): Promise<void> {
  for (const idStory of await deleteGuests(ids)) recountTable(idStory);
}

/**
 * Takes guests out of one story (removeGuestsFromStory), recounting its
 * table if one of them was at it, and returns the ids deleted outright.
 */
export async function removeGuestsFrom(idStory: number, ids?: string[]): Promise<string[]> {
  const { wasPresent, deleted } = await removeGuestsFromStory(idStory, ids);
  if (wasPresent) recountTable(idStory);
  return deleted;
}
