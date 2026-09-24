import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  interval,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { UserPreferenceMap } from "@/lib/user-preference-schemas";

// The exported names (user, session, account, verification) are Better Auth's
// model names and must stay singular — the Drizzle adapter looks the tables up
// by these keys. SQL table and column names are ours; the adapter only ever
// touches Drizzle Column objects, never bare identifier strings, so the two
// naming schemes are free to disagree.
//
// Primary keys carry no value from the app: `generateId: "uuid"` in auth.ts
// means Postgres generates them via DEFAULT uuidv7() (db/custom/
// create_auth_tables.sql). uuidv7 is time-ordered, so inserts append to the
// right edge of the primary key index instead of scattering across it.

export const user = pgTable("users", {
  // Better Auth field -> users column
  id: uuid("id_user")
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),

  // Columns the app owns. Better Auth ignores these; to read them off the
  // session user, declare them in `user.additionalFields` in auth.ts too.
  nickName: varchar("nick_name"),
  lastLogin: timestamp("last_login", { withTimezone: true }).defaultNow().notNull(),
  hoursPlayed: doublePrecision("hours_played").default(0).notNull(),
  idUserType: integer("id_user_type").default(-1).notNull(),
  tags: integer("tags"),
  isActive: boolean("is_active").default(true).notNull(),
  // name, email and nick_name joined for lookups, built by the database from
  // the search_fields recipe on the users row of _tables
  // (db/migrations/20260923181837_add_users_search_text.sql). Generated, so
  // an insert or update never names it.
  searchText: text("search_text").generatedAlwaysAs(
    sql`immutable_concat_ws(' ', name, email, nick_name)`,
  ),
});

export const session = pgTable(
  "sessions",
  {
    id: uuid("id_session")
      .primaryKey()
      .default(sql`uuidv7()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("id_user")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("sessions_id_user_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const account = pgTable(
  "accounts",
  {
    id: uuid("id_account")
      .primaryKey()
      .default(sql`uuidv7()`),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("id_user")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("accounts_id_user_idx").on(table.userId)],
);

export const verification = pgTable(
  "verifications",
  {
    id: uuid("id_verification")
      .primaryKey()
      .default(sql`uuidv7()`),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// ---------------------------------------------------------------------------
// Story tables. Built by dbmate (db/custom/create_foundation_tables.sql and
// later migrations); described here so the app can query them with types.
// ---------------------------------------------------------------------------

// Each primary key below carries the same DB-generated default the live
// sequence/identity produces, so inserts may omit it (see the uuid PKs above,
// which do the same with `.default(sql\`uuidv7()\`)`).

export const systems = pgTable("systems", {
  idSystem: integer("id_system")
    .primaryKey()
    .default(sql`nextval('systems_id_system_seq'::regclass)`),
  systemName: varchar("system_name").notNull(),
  systemVersion: varchar("system_version"),
  variant: varchar("variant"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

export const stories = pgTable("stories", {
  idStory: integer("id_story")
    .primaryKey()
    .default(sql`nextval('stories_id_story_seq'::regclass)`),
  title: varchar("title").notNull(),
  summary: text("summary"),
  hoursPlayed: doublePrecision("hours_played").default(0).notNull(),
  idSystem: integer("id_system"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true).notNull(),
  isLookingForPlayers: boolean("is_looking_for_players").default(false).notNull(),
  lastPlayed: timestamp("last_played", { withTimezone: true }).defaultNow().notNull(),
  // The session currently at the table, if any; null between sessions.
  // story_sessions keeps the history, this is only the one in progress.
  idStorySession: integer("id_story_session"),
  // A retired story is archived rather than deleted. The database stamps
  // archived_at as is_archived turns on and clears both it and
  // id_archived_by_user as it turns off (set_archived_at and
  // clear_archived_by_on_unarchive on stories); the app only sets the
  // archiver on the way in.
  isArchived: boolean("is_archived").default(false).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  idArchivedByUser: uuid("id_archived_by_user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

// id_story is bigint on the child tables but integer on stories itself; mode
// "number" keeps both sides comparable in the query builder.
export const storyPlayers = pgTable("story_players", {
  idStoryPlayer: integer("id_story_player")
    .primaryKey()
    .default(sql`nextval('story_players_id_story_player_seq'::regclass)`),
  idStory: bigint("id_story", { mode: "number" }).notNull(),
  idUser: uuid("id_user").notNull(),
  idCharacter: bigint("id_character", { mode: "number" }),
  hoursPlayed: doublePrecision("hours_played"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const storyFavorites = pgTable("story_favorites", {
  idStoryFavorite: integer("id_story_favorite").primaryKey().generatedByDefaultAsIdentity(),
  idStory: bigint("id_story", { mode: "number" }).notNull(),
  idUser: uuid("id_user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

// One sitting of a story. status runs through the story_sessions workflow in
// the database (open -> suspended or done; suspended -> resumed or done;
// resumed -> suspended or done; open is the default): a CHECK limits the values, a trigger
// rejects any other transition, and a trigger stamps openAt / suspendedAt /
// resumedAt / doneAt as the row enters each status, appending the change to
// activityLog. pausedTime is the sum of the row's suspended stretches, added
// to by a trigger as each one ends, and length is generated in Postgres as
// the whole minutes from openAt to doneAt less pausedTime, so it is null
// until the session is done. Neither is ever written from here.
export const storySessionStatuses = ["open", "suspended", "resumed", "done"] as const;
export type StorySessionStatus = (typeof storySessionStatuses)[number];

export const storySessions = pgTable("story_sessions", {
  idStorySession: integer("id_story_session").primaryKey().generatedByDefaultAsIdentity(),
  idStory: integer("id_story").notNull(),
  status: varchar("status", { enum: storySessionStatuses }).default("open").notNull(),
  openAt: timestamp("open_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  doneAt: timestamp("done_at", { withTimezone: true }),
  pausedTime: interval("paused_time").default("0").notNull(),
  length: integer("length").generatedAlwaysAs(
    sql`round(EXTRACT(EPOCH FROM (done_at - open_at - paused_time)) / 60)::integer`,
  ),
  activityLog: jsonb("activity_log")
    .default(sql`'[]'::jsonb`)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

export type Story = typeof stories.$inferSelect;
export type System = typeof systems.$inferSelect;

// Thumbs up / down left from the menu bar's feedback popover. The submitter is
// id_created_by_user, the standard audit column, rather than a column of its
// own.
export const feedback = pgTable("feedback", {
  idFeedback: integer("id_feedback").primaryKey().generatedByDefaultAsIdentity(),
  isPositive: boolean("is_positive").notNull(),
  pagePath: text("page_path").notNull(),
  feedback: text("feedback"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

// One row per user, every preference in one jsonb object. idUser is the
// upsert key (unique in the database); the audit columns below carry the same
// user but are the metatable's, so the constraint could not sit on them.
export const userPreferences = pgTable("user_preferences", {
  idUserPreference: integer("id_user_preference").primaryKey().generatedByDefaultAsIdentity(),
  idUser: uuid("id_user").notNull().unique(),
  preferences: jsonb("preferences")
    .$type<UserPreferenceMap>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

// Announcements for the home page. Shown from startsAt until expiresAt (null
// = never). The three archive columns and their triggers come from the
// metatable's needs_archival flag, so an item is taken down by setting
// isArchived rather than by deleting the row.
export const news = pgTable("news", {
  idNews: integer("id_news").primaryKey().generatedByDefaultAsIdentity(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isArchived: boolean("is_archived").default(false).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  idArchivedByUser: uuid("id_archived_by_user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

// Which news items a user has read: opened the story, or pressed Read on
// it. The row existing is the whole fact; there is no dismissed flag.
// id_user is the reader as the row's subject, as on story_favorites.
export const newsReads = pgTable("news_reads", {
  idNewsRead: integer("id_news_read").primaryKey().generatedByDefaultAsIdentity(),
  idNews: integer("id_news").notNull(),
  idUser: uuid("id_user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  system: one(systems, {
    fields: [stories.idSystem],
    references: [systems.idSystem],
  }),
  players: many(storyPlayers),
  favorites: many(storyFavorites),
  sessions: many(storySessions),
  currentSession: one(storySessions, {
    fields: [stories.idStorySession],
    references: [storySessions.idStorySession],
  }),
}));

export const storyPlayersRelations = relations(storyPlayers, ({ one }) => ({
  story: one(stories, { fields: [storyPlayers.idStory], references: [stories.idStory] }),
  user: one(user, { fields: [storyPlayers.idUser], references: [user.id] }),
}));

export const storyFavoritesRelations = relations(storyFavorites, ({ one }) => ({
  story: one(stories, { fields: [storyFavorites.idStory], references: [stories.idStory] }),
  user: one(user, { fields: [storyFavorites.idUser], references: [user.id] }),
}));

export const storySessionsRelations = relations(storySessions, ({ one }) => ({
  story: one(stories, { fields: [storySessions.idStory], references: [stories.idStory] }),
  storyteller: one(user, { fields: [storySessions.idCreatedByUser], references: [user.id] }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(user, { fields: [feedback.idCreatedByUser], references: [user.id] }),
}));

export const newsRelations = relations(news, ({ one, many }) => ({
  author: one(user, { fields: [news.idCreatedByUser], references: [user.id] }),
  archivedBy: one(user, { fields: [news.idArchivedByUser], references: [user.id] }),
  reads: many(newsReads),
}));

export const newsReadsRelations = relations(newsReads, ({ one }) => ({
  news: one(news, { fields: [newsReads.idNews], references: [news.idNews] }),
  user: one(user, { fields: [newsReads.idUser], references: [user.id] }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(user, { fields: [userPreferences.idUser], references: [user.id] }),
}));
