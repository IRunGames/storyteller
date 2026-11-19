// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes two
// administrators and a storyteller under @example.test; every item the suite writes is
// found again by its id, so whatever else is in the news table never
// changes an answer. Everything is removed in `after`.
import { after, before, it } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import { utcDayOf } from "@/lib/news-schemas";

const ADMIN_EMAIL = "news-actions-admin@example.test";
const OTHER_ADMIN_EMAIL = "news-actions-other-admin@example.test";
const STORYTELLER_EMAIL = "news-actions-storyteller@example.test";

let db: Db;
let tables: Tables;
let actions: typeof import("./actions");

let admin = "";
let otherAdmin = "";
let storyteller = "";
const made: number[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;
const today = utcDayOf(new Date());
const dayFromToday = (days: number) => utcDayOf(new Date(Date.now() + days * DAY_MS));

const item = {
  title: "Fixture news",
  body: "Something happened at the table.",
  startsOn: today,
  expiresOn: "",
};
/** The same, as the Edit dialog sends it. */
const edit = { ...item, archived: false };

/** Makes an item through the action, remembering it for `after`. */
async function create(input: Partial<typeof item> = {}) {
  const result = await actions.sa_createNews({ ...item, ...input });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  made.push(result.news.idNews);
  return result.news;
}

describeWithDb("admin news actions", {}, (suite) => {
  before(async () => {
    ({ db, tables } = suite);
    actions = await import("./actions");

    admin = await suite.makeUser(ADMIN_EMAIL, { name: "Fixture Admin" });
    otherAdmin = await suite.makeUser(OTHER_ADMIN_EMAIL);
    storyteller = await suite.makeUser(STORYTELLER_EMAIL);
    await db
      .update(tables.user)
      .set({ idUserType: -100 })
      .where(inArray(tables.user.id, [admin, otherAdmin]));
    await db.update(tables.user).set({ idUserType: -25 }).where(eq(tables.user.id, storyteller));
    suite.caller = admin;
  });

  after(async () => {
    // Before the users: each row names the admin in id_created_by_user.
    if (made.length > 0) await db.delete(tables.news).where(inArray(tables.news.idNews, made));
  });

  it("is refused to anyone short of an administrator", async () => {
    const mine = await create();
    suite.caller = storyteller;
    try {
      await expect(actions.sa_listAdminNews()).rejects.toThrow();
      await expect(actions.sa_createNews(item)).rejects.toThrow();
      await expect(actions.sa_updateNews(mine.idNews, edit)).rejects.toThrow();
      await expect(actions.sa_setNewsArchived(mine.idNews, true)).rejects.toThrow();
      await expect(actions.sa_deleteNews(mine.idNews)).rejects.toThrow();
    } finally {
      suite.caller = admin;
    }
  });

  it("posts an item stamped with the administrator, live from the start of its day", async () => {
    const news = await create({ title: "  Fixture posted  " });
    expect(news).toMatchObject({
      title: "Fixture posted",
      body: item.body,
      startsAt: new Date(`${today}T00:00:00Z`),
      expiresAt: null,
      status: "live",
      author: "Fixture Admin",
    });
    const [row] = await db
      .select({ by: tables.news.idCreatedByUser, updatedBy: tables.news.idUpdatedByUser })
      .from(tables.news)
      .where(eq(tables.news.idNews, news.idNews));
    expect(row).toEqual({ by: admin, updatedBy: admin });
  });

  it("says whether an item is scheduled, live or expired", async () => {
    const scheduled = await create({ startsOn: dayFromToday(2) });
    const expired = await create({ startsOn: dayFromToday(-5), expiresOn: dayFromToday(-1) });
    const lapsing = await create({ expiresOn: dayFromToday(3) });
    expect(scheduled.status).toBe("scheduled");
    expect(expired.status).toBe("expired");
    expect(lapsing.status).toBe("live");
    expect(lapsing.expiresAt).toEqual(new Date(`${dayFromToday(3)}T00:00:00Z`));
  });

  it("refuses what the form would, on the field", async () => {
    expect(await actions.sa_createNews({ ...item, title: "", expiresOn: today })).toEqual({
      ok: false,
      errors: {
        title: "Please give the news item a title.",
        expiresOn: "Pick a day after it starts.",
      },
    });
  });

  it("lists every item, archived ones too, newest first", async () => {
    const older = await create({ title: "Fixture older" });
    const newer = await create({ title: "Fixture newer" });
    await actions.sa_setNewsArchived(older.idNews, true);

    const ids = (await actions.sa_listAdminNews()).map((news) => news.idNews);
    expect(ids).toContain(older.idNews);
    expect(ids.indexOf(newer.idNews)).toBeLessThan(ids.indexOf(older.idNews));
  });

  it("changes an item and answers it as the list has it", async () => {
    const news = await create();
    const result = await actions.sa_updateNews(news.idNews, {
      title: "Fixture changed",
      body: "Changed.",
      startsOn: dayFromToday(1),
      expiresOn: dayFromToday(4),
      archived: false,
    });
    expect(result).toMatchObject({
      ok: true,
      news: {
        idNews: news.idNews,
        title: "Fixture changed",
        body: "Changed.",
        status: "scheduled",
        createdAt: news.createdAt,
      },
    });
  });

  it("archives an item, which takes it off the home page, and restores it", async () => {
    const news = await create({ title: "Fixture archived" });
    const home = await import("@/app/(app)/(nav)/home/actions");
    const onHome = async () => (await home.sa_listNews()).some((n) => n.idNews === news.idNews);
    // The home page shows six at most, newest start first. The suite's items
    // all start at today's first moment and the latest id wins that tie, so
    // this one is listed unless six others started later today.
    expect(await onHome()).toBe(true);

    const archived = await actions.sa_setNewsArchived(news.idNews, true);
    expect(archived).toMatchObject({ ok: true, news: { status: "archived", isArchived: true } });
    expect(await onHome()).toBe(false);
    const [row] = await db
      .select({ by: tables.news.idArchivedByUser, at: tables.news.archivedAt })
      .from(tables.news)
      .where(eq(tables.news.idNews, news.idNews));
    expect(row.by).toBe(admin);
    expect(row.at).toBeInstanceOf(Date);

    const restored = await actions.sa_setNewsArchived(news.idNews, false);
    expect(restored).toMatchObject({ ok: true, news: { status: "live", isArchived: false } });
    expect(await onHome()).toBe(true);
  });

  it("archives and restores an item from its edit, keeping who archived it", async () => {
    const news = await create({ title: "Fixture edited archive" });
    const archiveOf = async () =>
      (
        await db
          .select({ by: tables.news.idArchivedByUser, at: tables.news.archivedAt })
          .from(tables.news)
          .where(eq(tables.news.idNews, news.idNews))
      )[0];

    const archived = await actions.sa_updateNews(news.idNews, { ...edit, archived: true });
    expect(archived).toMatchObject({ ok: true, news: { status: "archived", isArchived: true } });
    const first = await archiveOf();
    expect(first.by).toBe(admin);
    expect(first.at).toBeInstanceOf(Date);

    // Another administrator corrects it while it stays archived: it is still
    // the first one's archive, from when they archived it.
    suite.caller = otherAdmin;
    try {
      const corrected = await actions.sa_updateNews(news.idNews, {
        ...edit,
        body: "Corrected.",
        archived: true,
      });
      expect(corrected).toMatchObject({ ok: true, news: { body: "Corrected.", isArchived: true } });
      expect(await archiveOf()).toEqual(first);

      const restored = await actions.sa_updateNews(news.idNews, edit);
      expect(restored).toMatchObject({ ok: true, news: { status: "live", isArchived: false } });
      expect(await archiveOf()).toEqual({ by: null, at: null });
    } finally {
      suite.caller = admin;
    }
  });

  it("refuses an edit without the archive switch, on the field", async () => {
    const news = await create();
    const result = await actions.sa_updateNews(news.idNews, item);
    expect(result.ok).toBe(false);
    expect(Object.keys(!result.ok ? result.errors : {})).toEqual(["archived"]);
  });

  it("deletes an item, and says so when it is already gone", async () => {
    const news = await create();
    expect(await actions.sa_deleteNews(news.idNews)).toEqual({ ok: true });
    expect((await actions.sa_listAdminNews()).map((n) => n.idNews)).not.toContain(news.idNews);
    expect(await actions.sa_deleteNews(news.idNews)).toEqual({
      ok: false,
      error: "That news item is no longer there.",
    });
    expect(await actions.sa_updateNews(news.idNews, edit)).toEqual({
      ok: false,
      errors: { root: "That news item is no longer there." },
    });
    expect(await actions.sa_setNewsArchived(news.idNews, true)).toEqual({
      ok: false,
      error: "That news item is no longer there.",
    });
  });
});
