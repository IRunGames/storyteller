import { relations, sql } from "drizzle-orm";
import {
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
