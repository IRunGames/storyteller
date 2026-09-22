"use server";

import { and, desc, eq, gt, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { NEWS_LIMIT, type NewsItem } from "@/lib/news";

const { news, newsReads } = schema;

// The only way the home page touches the news tables; requireUser() proves
// who is asking before anything is read or written.

// news.id_news is int4. An id outside that range is a query error to Postgres,
// not "no such row", so it is refused before the query rather than after.
const idNewsSchema = z.number().int().min(-2147483648).max(2147483647);

/**
 * The announcements to show the caller right now: started, not expired, not
 * archived, and not yet read by them, newest start first. The clock is the
 * database's (now()), not Node's, so a row inserted by a migration and a row
 * inserted by the app agree on "now".
 */
export async function sa_listNews(): Promise<NewsItem[]> {
  const user = await requireUser();

  const now = sql`now()`;
  // Correlated and scoped to the caller, like favoritedBy() on the Stories
  // page: another user's reads never hide anything from this one.
  const readByCaller = db
    .select({ one: newsReads.idNewsRead })
    .from(newsReads)
    .where(and(eq(newsReads.idNews, news.idNews), eq(newsReads.idUser, user.id)));

  return db
    .select({
      idNews: news.idNews,
      title: news.title,
      body: news.body,
      startsAt: news.startsAt,
    })
    .from(news)
    .where(
      and(
        eq(news.isArchived, false),
        lte(news.startsAt, now),
        or(isNull(news.expiresAt), gt(news.expiresAt, now)),
        notExists(readByCaller),
      ),
    )
    // id_news breaks a starts_at tie so the order is stable between renders.
    .orderBy(desc(news.startsAt), desc(news.idNews))
    .limit(NEWS_LIMIT);
}

/**
 * Records that the caller has read these items, so sa_listNews() stops
 * returning them. A card calls it when its story is opened or its Read
 * button is pressed, never for merely being on screen. Idempotent: the
 * (id_news, id_user) unique constraint absorbs a repeat, so opening a story
 * twice is harmless. Only ever writes rows for user.id. An unknown id is
 * refused by the foreign key, and that is a bug in the caller rather than
 * something to handle here.
 */
export async function sa_markNewsRead(idNews: number[]): Promise<{ ok: true }> {
  const user = await requireUser();
  const ids = z.array(idNewsSchema).max(NEWS_LIMIT).parse(idNews);
  if (ids.length === 0) return { ok: true };

  await db
    .insert(newsReads)
    .values(
      ids.map((id) => ({
        idNews: id,
        idUser: user.id,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })),
    )
    .onConflictDoNothing({ target: [newsReads.idNews, newsReads.idUser] });

  return { ok: true };
}
