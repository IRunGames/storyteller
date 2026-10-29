import { z } from "zod";
import { after } from "next/server";
import { isGuestAway, markGuestAway } from "@/db/guests";
import { requireUser, UnauthorizedError } from "@/lib/authorize";
import { GUEST_AWAY_GRACE_MS } from "@/lib/play";
import { recountTable, removeGuestsFrom } from "@/lib/guests";

const bodySchema = z.object({ idStory: z.number().int().min(-2147483648).max(2147483647) });

/**
 * Where a guest's display table reports that its page is going (pagehide),
 * by navigator.sendBeacon. A route rather than a server action because a
 * beacon is a plain POST the browser sends as the page unloads, which a
 * server action cannot receive.
 *
 * The guest's place at the table goes AWAY at once, so the head count
 * drops, and GUEST_AWAY_GRACE_MS later, unless their table came back and made
 * them PRESENT again, they are taken out of the story as Leave would
 * (removeGuestsFrom), and deleted if seated nowhere else. Anyone but a
 * guest, or a guest with no place at the table, is answered and left alone.
 */
export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return new Response(null, { status: 401 });
    throw error;
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response(null, { status: 400 });
  if (!user.isAnonymous) return new Response(null, { status: 204 });

  const { idStory } = body.data;
  const id = user.id;
  // Nothing to wait on without a place at the table to have left: the
  // guest was not at it, or another tab of theirs has already gone.
  if (!(await markGuestAway(idStory, id))) return new Response(null, { status: 204 });
  recountTable(idStory);

  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, GUEST_AWAY_GRACE_MS));
    if (await isGuestAway(idStory, id)) await removeGuestsFrom(idStory, [id]);
  });
  return new Response(null, { status: 204 });
}
