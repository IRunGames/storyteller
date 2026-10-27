import { and, desc, eq, exists, sql } from "drizzle-orm";

import { attachmentUrl } from "./attachment-url";
import { db } from "./index";
import { hasOpenSession } from "./open-session";
import { stories, storyFavorites, storyPlayers, systems, user as users } from "./schema";
import { presentCount, waitingCount } from "./session-player-counts";

// The story card's query, shared by the Stories page's actions and the profile
// dialog's. It lives here rather than in stories/actions.ts because a
// "use server" module may only export server actions; see attachment-url.ts.

// Whether the caller has favorited the story on the current outer row. It is
// a correlated EXISTS rather than a join so a favorite never duplicates or
// drops a card, and it is scoped to the caller: nobody sees anyone else's
// hearts.
function favoritedBy(userId: string) {
  return exists(
    db
      .select({ one: storyFavorites.idStoryFavorite })
      .from(storyFavorites)
      .where(and(eq(storyFavorites.idStory, stories.idStory), eq(storyFavorites.idUser, userId))),
  ).mapWith(Boolean);
}

// How many story_players rows the story has. A correlated subquery rather than
// a join with GROUP BY, so the paging LIMIT still counts stories, not players.
// count() comes back as a bigint string from pg; the card wants a number.
export const playerCount = sql<number>`(
  select count(*) from ${storyPlayers} where ${storyPlayers.idStory} = ${stories.idStory}
)`.mapWith(Number);

// How a user is shown everywhere, storyteller or player: the same preference
// the account menu uses (nickname, else name), and NULLIF so a nickname that
// was blanked out does not win over the name.
export const playerName = sql<string>`coalesce(nullif(${users.nickName}, ''), ${users.name})`;

// One projection shared by every list and by sa_getStory, so the card never sees
// a shape that differs by section.
export function cardColumns(userId: string) {
  return {
    idStory: stories.idStory,
    title: stories.title,
    summary: stories.summary,
    // The story's picture is an attachments row now, not a column; the key
    // keeps its name because it still holds the url a card paints on.
    imageUrl: attachmentUrl("STORY", "stories", "id_story"),
    lastPlayed: stories.lastPlayed,
    systemName: systems.systemName,
    systemVersion: systems.systemVersion,
    variant: systems.variant,
    isFavorite: favoritedBy(userId),
    // NULL = userId is NULL in SQL, and Boolean(null) is false, so a story with
    // no recorded creator has no owner rather than an error.
    isOwner: eq(stories.idCreatedByUser, userId).mapWith(Boolean),
    isActive: stories.isActive,
    isLookingForPlayers: stories.isLookingForPlayers,
    // Null when the left join found no creator row.
    storytellerName: sql<string | null>`${playerName}`,
    hasOpenSession,
    playerCount,
    // Everyone waiting but the viewer: the storyteller never waits, and a
    // player waiting in another tab is not someone else waiting.
    waitingCount: waitingCount(stories.idStory, userId),
    presentCount: presentCount(),
  };
}

// updated_at ties are common — the seed inserts every story in one statement,
// so all 14 share a timestamp — and a LIMIT/OFFSET pair over an unstable sort
// can hand the same row to two different pages. id_story breaks the tie so the
// sections page reliably.
export const cardOrder = [desc(stories.updatedAt), desc(stories.title)];

// Left joins, so a story with no system or whose creator row is gone still
// makes a card. Every list starts here; a section adds its own join or WHERE.
export function cardQuery(userId: string) {
  return db
    .select(cardColumns(userId))
    .from(stories)
    .leftJoin(systems, eq(stories.idSystem, systems.idSystem))
    .leftJoin(users, eq(stories.idCreatedByUser, users.id));
}

// An archived story is off the Stories page altogether: My Stories leaves it
// out even with "Show inactive" on, and a favorite of one is not listed. It
// is not deleted, and the edit page still reaches it, so unarchiving brings
// it back.
export const notArchived = eq(stories.isArchived, false);
