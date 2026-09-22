// Integration test against the real database. Skipped when DATABASE_URL is
// unset so `just test` stays green offline.
//
// The seed (db/seeds/seed_news.sql) alone cannot show that the date window and the archive flag are
// honoured, so `before` inserts one item of each kind that must NOT appear —
// not yet started, already expired, archived — plus two live items that must,
// and `after` deletes them again (their news_reads rows go with them, by
// cascade). Fixture ids are positive, from the identity column, so they can
// never collide with the seed's negative ones. Nothing here ever marks a seed
// item read for the seed user: that would hide it on the real home page.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TITLE_LIVE = "Fixture — live, started an hour ago, expires tomorrow";
const TITLE_UNREAD = "Fixture — live, two hours old, read only once marked";
const TITLE_FUTURE = "Fixture — starts tomorrow";
const TITLE_EXPIRED = "Fixture — expired yesterday";
const TITLE_ARCHIVED = "Fixture — live but archived";

let fixtureIds: number[] = [];
let liveId = 0;
let unreadId = 0;

describe("home actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    const now = Date.now();
    const inserted = await db
      .insert(tables.news)
      .values([
        // An hour ago, not a day: the seed's newest item starts on the day it
        // was written, and this one has to sort above it on that same day.
        {
          title: TITLE_LIVE,
          body: "live",
          startsAt: new Date(now - HOUR),
          expiresAt: new Date(now + DAY),
        },
        { title: TITLE_UNREAD, body: "unread", startsAt: new Date(now - 2 * HOUR) },
        { title: TITLE_FUTURE, body: "future", startsAt: new Date(now + DAY) },
        {
          title: TITLE_EXPIRED,
          body: "expired",
          startsAt: new Date(now - 2 * DAY),
          expiresAt: new Date(now - DAY),
        },
        { title: TITLE_ARCHIVED, body: "archived", startsAt: new Date(now - HOUR), isArchived: true },
      ])
      .returning({ idNews: tables.news.idNews, title: tables.news.title });
    fixtureIds = inserted.map((row) => row.idNews);
    const idFor = (title: string) => {
      const row = inserted.find((r) => r.title === title);
      if (!row) throw new Error(`fixture not inserted: ${title}`);
      return row.idNews;
    };
    liveId = idFor(TITLE_LIVE);
    unreadId = idFor(TITLE_UNREAD);
  });

  after(async () => {
    if (!db) return;
    if (fixtureIds.length) await db.delete(tables.news).where(inArray(tables.news.idNews, fixtureIds));
    await db.$client.end();
  });

  it("lists what is live now, newest start first, and nothing else", async () => {
    const items = await actions.sa_listNews();
    const titles = items.map((item) => item.title);

    expect(titles).toContain(TITLE_LIVE);
    expect(titles).toContain(TITLE_UNREAD);
    expect(titles).not.toContain(TITLE_FUTURE);
    expect(titles).not.toContain(TITLE_EXPIRED);
    expect(titles).not.toContain(TITLE_ARCHIVED);

    // The live fixture is the most recent start of all, so it leads. The seed
    // items are not asserted on: the seed user is also the developer's
    // account, and opening the home page marks them read for real.
    expect(titles[0]).toBe(TITLE_LIVE);
    const starts = items.map((item) => item.startsAt.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
  });

  it("returns only what the section renders", async () => {
    const [item] = await actions.sa_listNews();
    expect(Object.keys(item).sort()).toEqual(["body", "idNews", "startsAt", "title"]);
  });

  it("leaves out an item the caller has read, even though it is live", async () => {
    await db.insert(tables.newsReads).values({ idNews: liveId, idUser: SEED_USER });

    const titles = (await actions.sa_listNews()).map((item) => item.title);
    expect(titles).not.toContain(TITLE_LIVE);
    expect(titles).toContain(TITLE_UNREAD);
  });

  it("marks items read for the caller only, idempotently, and an empty list is a no-op", async () => {
    expect(await actions.sa_markNewsRead([])).toEqual({ ok: true });

    expect(await actions.sa_markNewsRead([unreadId])).toEqual({ ok: true });
    // A repeat must not trip the (id_news, id_user) unique constraint.
    expect(await actions.sa_markNewsRead([unreadId])).toEqual({ ok: true });

    const titles = (await actions.sa_listNews()).map((item) => item.title);
    expect(titles).not.toContain(TITLE_UNREAD);

    const rows = await db
      .select({ idUser: tables.newsReads.idUser, by: tables.newsReads.idCreatedByUser })
      .from(tables.newsReads)
      .where(eq(tables.newsReads.idNews, unreadId));
    expect(rows).toEqual([{ idUser: SEED_USER, by: SEED_USER }]);
  });

  it("refuses an id outside the int4 range", async () => {
    await expect(actions.sa_markNewsRead([2 ** 31])).rejects.toThrow();
  });
});
