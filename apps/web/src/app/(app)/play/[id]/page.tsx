import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/require-session";
import { PlayTable } from "@/components/play/play-table";

// stories.id_story is int4, and a seed story has a negative id, so anything that
// parses to an int in that range is a candidate; the rest is a 404 rather
// than a query error later on.
const idSchema = z.coerce.number().int().min(-2147483648).max(2147483647);

// The table for one story, behind the Play button on a story card and the
// picker on /play. Outside (nav) because the table draws its own header. See
// home/page.tsx for why the page calls requireSession() itself.
export default async function PlayTablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();

  // Only checked for now: the placeholder table has nothing to load with it.
  if (!idSchema.safeParse((await params).id).success) notFound();

  return <PlayTable />;
}
