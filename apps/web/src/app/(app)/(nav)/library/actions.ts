"use server";

import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { systemLabel } from "@/lib/stories";

const { stories, systems } = schema;

/** One story on the Library page: enough to name it and link to its library. */
export type LibraryStory = {
  idStory: number;
  title: string;
  /** "Cypher System · Numenera (Revised)", or null for a story with no system. */
  system: string | null;
  isActive: boolean;
  isArchived: boolean;
};

/**
 * Every story the caller is the storyteller of, newest first: the stories
 * that have a library they can open, since a library is its storyteller's
 * alone (libraries/[id_story]/page.tsx). A story they only play in has none
 * for them, so it is left out.
 *
 * Inactive and archived stories stay in: their libraries are still there,
 * and looking back over an old story's preparation is a reason to come here.
 * Unpaged, like sa_listPlayableStories, because one person runs few enough
 * stories for one list.
 */
export async function sa_listLibraryStories(): Promise<LibraryStory[]> {
  const user = await requireUser();

  const rows = await db
    .select({
      idStory: stories.idStory,
      title: stories.title,
      systemName: systems.systemName,
      systemVersion: systems.systemVersion,
      variant: systems.variant,
      isActive: stories.isActive,
      isArchived: stories.isArchived,
    })
    .from(stories)
    .leftJoin(systems, eq(stories.idSystem, systems.idSystem))
    .where(eq(stories.idCreatedByUser, user.id))
    // updated_at ties are common in the seed, which inserts its stories in one
    // statement; id_story breaks them the way the card lists do.
    .orderBy(desc(stories.updatedAt), desc(stories.idStory));

  return rows.map(({ systemName, systemVersion, variant, ...story }) => ({
    ...story,
    system: systemLabel({ systemName, systemVersion, variant }),
  }));
}
