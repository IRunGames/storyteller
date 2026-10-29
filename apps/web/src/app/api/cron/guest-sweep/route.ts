import { lapsedGuests } from "@/db/guests";
import { removeGuests } from "@/lib/guests";

/**
 * Deletes guests whose every session has run out (lapsedGuests): one who
 * closed the tab instead of leaving, or one a full table turned away. A
 * guest who leaves, or whose session the storyteller ends, is deleted then
 * and there; this catches the rest.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ids = await lapsedGuests();
  await removeGuests(ids);
  return Response.json({ deletedGuests: ids.length });
}
