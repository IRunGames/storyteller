// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes an administrator
// and a storyteller under @example.test and one system of its own with a
// definition; the list is searched for that system by its label, so whatever
// else is in the table never changes an answer. Everything is removed in
// `after`.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import type { StatBlockDefinition } from "@/lib/stat-blocks";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

const hasDb = Boolean(process.env.DATABASE_URL);
const ADMIN_EMAIL = "systems-actions-admin@example.test";
const STORYTELLER_EMAIL = "systems-actions-storyteller@example.test";
const SYSTEM_NAME = "Fixture Stat System";
const NEW_NAME = "Fixture New System";
const STORY_TITLE = "Fixture system story";

let caller = "";
const getSession = mock.fn(async () => (caller ? { user: { id: caller } } : null));

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];
let actions: typeof import("./actions");

let admin = "";
let storyteller = "";
let idSystem = 0;

const definition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      keyedBy: "",
      stats: [
        {
          name: "str",
          label: "Strength",
          type: "display",
          rack: [],
          connectedTo: "",
          computedAs: "",
        },
        {
          name: "mod",
          label: "",
          type: "computed",
          rack: [],
          connectedTo: "",
          computedAs: "floor((stats.str - 10) / 2)",
        },
      ],
    },
    { name: "saves", label: "Saves", keyedBy: "", stats: [] },
  ],
};

describe("admin systems actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    admin = await makeTestUser(db, tables, ADMIN_EMAIL);
    storyteller = await makeTestUser(db, tables, STORYTELLER_EMAIL);
    await db.update(tables.user).set({ idUserType: -100 }).where(eq(tables.user.id, admin));
    await db.update(tables.user).set({ idUserType: -25 }).where(eq(tables.user.id, storyteller));

    await db.delete(tables.systems).where(eq(tables.systems.systemName, SYSTEM_NAME));
    await db.delete(tables.systems).where(eq(tables.systems.systemName, NEW_NAME));
    const [system] = await db
      .insert(tables.systems)
      .values({ systemName: SYSTEM_NAME, systemVersion: "1e", variant: "Fixture" })
      .returning({ idSystem: tables.systems.idSystem });
    idSystem = system.idSystem;
    caller = admin;
  });

  after(async () => {
    await db.delete(tables.stories).where(eq(tables.stories.title, STORY_TITLE));
    await db.delete(tables.systems).where(eq(tables.systems.idSystem, idSystem));
    await db.delete(tables.systems).where(eq(tables.systems.systemName, NEW_NAME));
    // The admin goes last: the row it saved names it in id_updated_by_user.
    await removeTestUser(db, tables, STORYTELLER_EMAIL);
    await removeTestUser(db, tables, ADMIN_EMAIL);
  });

  it("is refused to anyone short of an administrator", async () => {
    caller = storyteller;
    try {
      await expect(actions.sa_listAdminSystems()).rejects.toThrow();
      await expect(actions.sa_getAdminSystem(idSystem)).rejects.toThrow();
      await expect(actions.sa_setSystemStatBlockDefinition(idSystem, definition)).rejects.toThrow();
      await expect(
        actions.sa_createSystem({ systemName: NEW_NAME, systemVersion: "", variant: "" }),
      ).rejects.toThrow();
      await expect(actions.sa_deleteSystem(idSystem)).rejects.toThrow();
      await expect(
        actions.sa_updateSystem(idSystem, { systemName: "X", systemVersion: "", variant: "" }),
      ).rejects.toThrow();
    } finally {
      caller = admin;
    }
  });

  it("lists the system with no definition yet as empty, labelled as a card would", async () => {
    const found = (await actions.sa_listAdminSystems()).find((row) => row.idSystem === idSystem);
    expect(found).toEqual({
      idSystem,
      label: "Fixture Stat System · Fixture (1e)",
      groupCount: 0,
      statCount: 0,
    });
    expect(await actions.sa_getAdminSystem(idSystem)).toEqual({
      idSystem,
      label: "Fixture Stat System · Fixture (1e)",
      systemName: SYSTEM_NAME,
      systemVersion: "1e",
      variant: "Fixture",
      definition: { groups: [] },
    });
  });

  it("refuses a definition that breaks the rules, on the field", async () => {
    const result = await actions.sa_setSystemStatBlockDefinition(idSystem, {
      groups: [
        {
          name: "stats",
          label: "",
          keyedBy: "",
          stats: [
            { name: "str", label: "", type: "display", rack: [], connectedTo: "", computedAs: "" },
            {
              name: "mod",
              label: "",
              type: "computed",
              rack: [],
              connectedTo: "",
              computedAs: "stats.dex + 1",
            },
          ],
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      errors: { "groups.0.stats.1.computedAs": "There is no stat stats.dex." },
    });
    expect((await actions.sa_getAdminSystem(idSystem))?.definition).toEqual({ groups: [] });
  });

  it("saves a sound definition and reads it back, counted on the list", async () => {
    expect(await actions.sa_setSystemStatBlockDefinition(idSystem, definition)).toEqual({
      ok: true,
    });
    expect((await actions.sa_getAdminSystem(idSystem))?.definition).toEqual(definition);
    const found = (await actions.sa_listAdminSystems()).find((row) => row.idSystem === idSystem);
    expect(found).toMatchObject({ groupCount: 2, statCount: 2 });
    const [row] = await db
      .select({ by: tables.systems.idUpdatedByUser })
      .from(tables.systems)
      .where(eq(tables.systems.idSystem, idSystem));
    expect(row.by).toBe(admin);
  });

  it("answers null and a root error for a system that is not there", async () => {
    expect(await actions.sa_getAdminSystem(2147483647)).toBeNull();
    expect(await actions.sa_getAdminSystem(1e12)).toBeNull();
    expect(await actions.sa_setSystemStatBlockDefinition(2147483647, { groups: [] })).toEqual({
      ok: false,
      errors: { root: "That system is no longer there." },
    });
  });

  it("makes a system with no definition, stamped with the administrator, listed as a row", async () => {
    const result = await actions.sa_createSystem({
      systemName: ` ${NEW_NAME} `,
      systemVersion: " 2e ",
      variant: null,
    });
    expect(result).toMatchObject({
      ok: true,
      system: { label: `${NEW_NAME} (2e)`, groupCount: 0, statCount: 0 },
    });
    if (!result.ok) return;
    const [row] = await db
      .select({
        version: tables.systems.systemVersion,
        variant: tables.systems.variant,
        by: tables.systems.idCreatedByUser,
      })
      .from(tables.systems)
      .where(eq(tables.systems.idSystem, result.system.idSystem));
    expect(row).toEqual({ version: "2e", variant: null, by: admin });
    expect((await actions.sa_listAdminSystems()).map((s) => s.idSystem)).toContain(
      result.system.idSystem,
    );
  });

  it("refuses a second system with the same name, version and variant, on the name", async () => {
    expect(
      await actions.sa_createSystem({ systemName: NEW_NAME, systemVersion: "2e", variant: "" }),
    ).toEqual({ ok: false, errors: { systemName: `There is already a ${NEW_NAME} (2e).` } });
    expect(
      await actions.sa_createSystem({ systemName: "", systemVersion: "", variant: "" }),
    ).toEqual({ ok: false, errors: { systemName: "Please enter a name." } });
  });

  it("changes a system's own fields, refusing another system's name, version and variant", async () => {
    const [made] = await db
      .select({ idSystem: tables.systems.idSystem })
      .from(tables.systems)
      .where(eq(tables.systems.systemName, NEW_NAME));

    expect(
      await actions.sa_updateSystem(made.idSystem, {
        systemName: SYSTEM_NAME,
        systemVersion: "1e",
        variant: "Fixture",
      }),
    ).toEqual({
      ok: false,
      errors: { systemName: "There is already a Fixture Stat System · Fixture (1e)." },
    });
    expect(
      await actions.sa_updateSystem(made.idSystem, {
        systemName: NEW_NAME,
        systemVersion: " 3e ",
        variant: null,
      }),
    ).toEqual({ ok: true, label: `${NEW_NAME} (3e)` });
    expect(await actions.sa_getAdminSystem(made.idSystem)).toMatchObject({
      label: `${NEW_NAME} (3e)`,
      systemVersion: "3e",
      variant: null,
    });
    expect(
      await actions.sa_updateSystem(2147483647, {
        systemName: "X",
        systemVersion: "",
        variant: "",
      }),
    ).toEqual({ ok: false, errors: { root: "That system is no longer there." } });
  });

  it("keeps a system a story is run in, and deletes one nothing uses", async () => {
    const [made] = await db
      .select({ idSystem: tables.systems.idSystem })
      .from(tables.systems)
      .where(eq(tables.systems.systemName, NEW_NAME));
    const [story] = await db
      .insert(tables.stories)
      .values({ title: STORY_TITLE, idSystem: made.idSystem, idCreatedByUser: admin })
      .returning({ idStory: tables.stories.idStory });

    expect(await actions.sa_deleteSystem(made.idSystem)).toEqual({
      ok: false,
      error: "1 story is run in it, so it stays.",
    });

    await db.delete(tables.stories).where(eq(tables.stories.idStory, story.idStory));
    expect(await actions.sa_deleteSystem(made.idSystem)).toEqual({ ok: true });
    expect((await actions.sa_listAdminSystems()).map((s) => s.idSystem)).not.toContain(
      made.idSystem,
    );
    expect(await actions.sa_deleteSystem(made.idSystem)).toEqual({
      ok: false,
      error: "That system is no longer there.",
    });
  });
});
