"use server";

import { desc, eq, sql } from "drizzle-orm";
import { idSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/authorize";
import { newsEditSchema, newsSchema, startOfUtcDay } from "@/lib/news-schemas";
import { formErrors } from "@/lib/forms";

const { news, user: users } = schema;

// The administrators' News page: the announcements the home page's News
// section shows. Every action here starts with requireAdmin(); the wrench
// that leads to the page is only drawn for an administrator, which decides
// nothing on its own.

export type NewsStatus = "scheduled" | "live" | "expired" | "archived";

/** One row of the News table. */
export type AdminNews = {
  idNews: number;
  title: string;
  body: string;
  startsAt: Date;
  expiresAt: Date | null;
  isArchived: boolean;
  /** Archived first, since an archived item is off the home page whatever its days say. */
  status: NewsStatus;
  /** Who posted it, as the app names people elsewhere. */
  author: string;
  createdAt: Date;
};

const NEWS_GONE = "That news item is no longer there.";

// The same now() sa_listNews compares against, so an item this page calls
// live is one the home page shows.
const statusSql = sql<NewsStatus>`case
  when ${news.isArchived} then 'archived'
  when ${news.startsAt} > now() then 'scheduled'
  when ${news.expiresAt} <= now() then 'expired'
  else 'live' end`;

/** The items as the table shows them, every one or the one named; the read the writes answer with. */
async function newsRows(idNews?: number): Promise<AdminNews[]> {
  return (
    db
      .select({
        idNews: news.idNews,
        title: news.title,
        body: news.body,
        startsAt: news.startsAt,
        expiresAt: news.expiresAt,
        isArchived: news.isArchived,
        status: statusSql,
        author: sql<string>`coalesce(${users.nickName}, ${users.name}, '')`,
        createdAt: sql<Date>`${news.createdAt}`.mapWith(news.createdAt),
      })
      .from(news)
      .leftJoin(users, eq(users.id, news.idCreatedByUser))
      .where(idNews === undefined ? undefined : eq(news.idNews, idNews))
      // id_news breaks a created_at tie, as the seeds' rows share one.
      .orderBy(desc(news.createdAt), desc(news.idNews))
  );
}

/** One row as sa_listAdminNews has it, after a change to it; null when it has gone meanwhile. */
async function listed(idNews: number): Promise<AdminNews | null> {
  const [row] = await newsRows(idNews);
  return row ?? null;
}

/**
 * Every item, archived and expired ones too, newest posted first, for the
 * page's table to search and sort in the browser.
 */
export async function sa_listAdminNews(): Promise<AdminNews[]> {
  await requireAdmin();
  return newsRows();
}

export type SaveNewsResult =
  { ok: true; news: AdminNews } | { ok: false; errors: Record<string, string> };

/** The form's days as the row's moments: each day's first, and null for no expiry. */
function columnsOf(values: { startsOn: string; expiresOn: string }) {
  return {
    startsAt: startOfUtcDay(values.startsOn),
    expiresAt: values.expiresOn === "" ? null : startOfUtcDay(values.expiresOn),
  };
}

/**
 * The columns that archive an item or restore it. An item that is archived
 * already keeps the administrator who archived it, as the metatable's
 * trigger keeps its archived_at, so saving an edit to it does not make the
 * editor its archiver; a restore clears who it was, which the trigger
 * leaves alone.
 */
function archiveColumns(archived: boolean, idAdmin: string) {
  return {
    isArchived: archived,
    idArchivedByUser: archived
      ? sql`case when ${news.isArchived} then ${news.idArchivedByUser} else ${idAdmin} end`
      : null,
  };
}

/** The New news item dialog: posts an item, which shows on the home page from its start day. */
export async function sa_createNews(input: unknown): Promise<SaveNewsResult> {
  const admin = await requireAdmin();
  const parsed = newsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };

  const [made] = await db
    .insert(news)
    .values({
      title: parsed.data.title,
      body: parsed.data.body,
      ...columnsOf(parsed.data),
      idCreatedByUser: admin.id,
      idUpdatedByUser: admin.id,
    })
    .returning({ idNews: news.idNews });

  const row = await listed(made.idNews);
  if (!row) return { ok: false, errors: { root: NEWS_GONE } };
  return { ok: true, news: row };
}

/**
 * The Edit dialog: changes an item's title, its news and its days, and
 * archives or restores it by its switch. Whoever has already read it keeps
 * it read, so a correction does not bring it back to anyone's home page.
 */
export async function sa_updateNews(idNews: number, input: unknown): Promise<SaveNewsResult> {
  const admin = await requireAdmin();
  const id = idSchema.safeParse(idNews);
  if (!id.success) return { ok: false, errors: { root: NEWS_GONE } };
  const parsed = newsEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };

  const changed = await db
    .update(news)
    .set({
      title: parsed.data.title,
      body: parsed.data.body,
      ...columnsOf(parsed.data),
      ...archiveColumns(parsed.data.archived, admin.id),
      idUpdatedByUser: admin.id,
    })
    .where(eq(news.idNews, id.data))
    .returning({ idNews: news.idNews });
  if (changed.length === 0) return { ok: false, errors: { root: NEWS_GONE } };

  const row = await listed(id.data);
  if (!row) return { ok: false, errors: { root: NEWS_GONE } };
  return { ok: true, news: row };
}

export type ArchiveNewsResult = { ok: true; news: AdminNews } | { ok: false; error: string };

/**
 * The Archive and Restore button on a row: takes an item off the home page
 * and keeps it, or puts it back. The metatable's trigger stamps archived_at,
 * and clears it on a restore; who archived it is written here.
 */
export async function sa_setNewsArchived(
  idNews: number,
  archived: boolean,
): Promise<ArchiveNewsResult> {
  const admin = await requireAdmin();
  const id = idSchema.safeParse(idNews);
  if (!id.success || typeof archived !== "boolean") return { ok: false, error: NEWS_GONE };

  const changed = await db
    .update(news)
    .set({ ...archiveColumns(archived, admin.id), idUpdatedByUser: admin.id })
    .where(eq(news.idNews, id.data))
    .returning({ idNews: news.idNews });
  if (changed.length === 0) return { ok: false, error: NEWS_GONE };

  const row = await listed(id.data);
  if (!row) return { ok: false, error: NEWS_GONE };
  return { ok: true, news: row };
}

/**
 * Deletes an item outright, and with it every record of who has read it
 * (news_reads cascades). Archiving is the way to take one down and keep it.
 */
export async function sa_deleteNews(
  idNews: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const id = idSchema.safeParse(idNews);
  if (!id.success) return { ok: false, error: NEWS_GONE };
  const deleted = await db
    .delete(news)
    .where(eq(news.idNews, id.data))
    .returning({ idNews: news.idNews });
  if (deleted.length === 0) return { ok: false, error: NEWS_GONE };
  return { ok: true };
}
