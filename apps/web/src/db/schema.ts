import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

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
  id: uuid("id_user").primaryKey().default(sql`uuidv7()`),
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
});

export const session = pgTable(
  "sessions",
  {
    id: uuid("id_session").primaryKey().default(sql`uuidv7()`),
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
    id: uuid("id_account").primaryKey().default(sql`uuidv7()`),
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
    id: uuid("id_verification").primaryKey().default(sql`uuidv7()`),
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
// Game tables. Built by dbmate (db/custom/create_foundation_tables.sql and
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

export const games = pgTable("games", {
  idGame: integer("id_game")
    .primaryKey()
    .default(sql`nextval('games_id_game_seq'::regclass)`),
  gameTitle: varchar("game_title").notNull(),
  summary: text("summary"),
  hoursPlayed: doublePrecision("hours_played").default(0).notNull(),
  idSystem: integer("id_system"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true).notNull(),
  isLookingForPlayers: boolean("is_looking_for_players").default(false).notNull(),
  lastPlayed: timestamp("last_played", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

// id_game is bigint on the child tables but integer on games itself; mode
// "number" keeps both sides comparable in the query builder.
export const gamePlayers = pgTable("game_players", {
  idGamePlayer: integer("id_game_player")
    .primaryKey()
    .default(sql`nextval('game_players_id_game_player_seq'::regclass)`),
  idGame: bigint("id_game", { mode: "number" }).notNull(),
  idUser: uuid("id_user").notNull(),
  idCharacter: bigint("id_character", { mode: "number" }),
  hoursPlayed: doublePrecision("hours_played"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const gameFavorites = pgTable("game_favorites", {
  idGameFavorite: integer("id_game_favorite").primaryKey().generatedByDefaultAsIdentity(),
  idGame: bigint("id_game", { mode: "number" }).notNull(),
  idUser: uuid("id_user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  idCreatedByUser: uuid("id_created_by_user"),
  idUpdatedByUser: uuid("id_updated_by_user"),
});

export type Game = typeof games.$inferSelect;
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
// id_user is the reader as the row's subject, as on game_favorites.
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

export const gamesRelations = relations(games, ({ one, many }) => ({
  system: one(systems, {
    fields: [games.idSystem],
    references: [systems.idSystem],
  }),
  players: many(gamePlayers),
  favorites: many(gameFavorites),
}));

export const gamePlayersRelations = relations(gamePlayers, ({ one }) => ({
  game: one(games, { fields: [gamePlayers.idGame], references: [games.idGame] }),
  user: one(user, { fields: [gamePlayers.idUser], references: [user.id] }),
}));

export const gameFavoritesRelations = relations(gameFavorites, ({ one }) => ({
  game: one(games, { fields: [gameFavorites.idGame], references: [games.idGame] }),
  user: one(user, { fields: [gameFavorites.idUser], references: [user.id] }),
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
