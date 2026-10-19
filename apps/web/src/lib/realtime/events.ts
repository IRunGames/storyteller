import { z } from "zod";
import type { schema } from "@/db";

// What goes over a story's state topic: the shape of each message the
// storyteller's table publishes and the players' table reads. Shared by both
// sides, so it holds no database or React code of its own; the zod schemas
// are what the browser checks an incoming message against, since anything
// could be published to a topic it can read.

/** The database's element row, as Drizzle types it. */
export type ElementRow = typeof schema.elements.$inferSelect;
/** The database's scene_elements row, as Drizzle types it. */
export type SceneElementRow = typeof schema.sceneElements.$inferSelect;

// A timestamp as JSON carries it: ISO 8601, or null for a column left empty.
const isoDate = z.string().nullable();
const tags = z.array(z.string());

/**
 * An element as the players may see it: every column but the two the
 * database builds for itself (search_text, activity_log). The notes are
 * the players' own, written from their table, so they go whole. Timestamps
 * are ISO strings, since the message is JSON. imageUrl is the element's
 * cover picture (its ELEMENT use in attachment_uses), worked out on the way
 * out as the storyteller's table has it, so the players' table need not ask
 * again.
 */
export const publicElementSchema = z.object({
  idElement: z.number().int(),
  idStory: z.number().int(),
  kind: z.string(),
  status: z.string(),
  initialName: z.string().nullable(),
  name: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  imageUrl: z.string().nullable(),
  url: z.string().nullable(),
  urlText: z.string().nullable(),
  tags,
  pendingAt: isoDate,
  readyAt: isoDate,
  inactiveAt: isoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type PublicElement = z.infer<typeof publicElementSchema>;

/** An element's link to a scene as the players may see it: every column but activity_log. */
export const publicSceneElementSchema = z.object({
  idSceneElement: z.number().int(),
  idStoryScene: z.number().int(),
  idElement: z.number().int(),
  status: z.string(),
  tags,
  elementShowing: z.string(),
  showInfo: z.boolean(),
  url: z.string().nullable(),
  urlText: z.string().nullable(),
  readyAt: isoDate,
  invisibleAt: isoDate,
  tappedAt: isoDate,
  disabledAt: isoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type PublicSceneElement = z.infer<typeof publicSceneElementSchema>;

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/**
 * The element row with its private columns left out, ready to publish.
 * The description and the external link go only while the link's show_info
 * allows them: the topic is one every player can read, so what they are not
 * to know yet is kept off it here, not hidden by their page.
 */
export function toPublicElement(
  row: ElementRow,
  imageUrl: string | null,
  showInfo: boolean,
): PublicElement {
  // Picked field by field rather than spread, so a column added to elements
  // later does not reach the players until someone decides it should.
  return {
    idElement: row.idElement,
    idStory: row.idStory,
    kind: row.kind,
    status: row.status,
    initialName: row.initialName,
    name: row.name,
    title: row.title,
    description: showInfo ? row.description : null,
    notes: row.notes,
    imageUrl,
    url: showInfo ? row.url : null,
    urlText: showInfo ? row.urlText : null,
    tags: row.tags,
    pendingAt: iso(row.pendingAt),
    readyAt: iso(row.readyAt),
    inactiveAt: iso(row.inactiveAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * The link row with its activity log left out, ready to publish. Picked
 * field by field, as the element is: scene_elements.show_image is not sent,
 * since what the players' preview shows is a pulse (below), not state, and
 * the link's own external link goes only while its show_info allows it, as
 * the element's does.
 */
export function toPublicSceneElement(row: SceneElementRow): PublicSceneElement {
  return {
    idSceneElement: row.idSceneElement,
    idStoryScene: row.idStoryScene,
    idElement: row.idElement,
    status: row.status,
    tags: row.tags,
    elementShowing: row.elementShowing,
    showInfo: row.showInfo,
    url: row.showInfo ? row.url : null,
    urlText: row.showInfo ? row.urlText : null,
    readyAt: iso(row.readyAt),
    invisibleAt: iso(row.invisibleAt),
    tappedAt: iso(row.tappedAt),
    disabledAt: iso(row.disabledAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

// Every message says which story it is about and when it was made, and
// carries a version so a later shape can be told from this one.
const base = { v: z.literal(1), at: z.string(), idStory: z.number().int() };

/**
 * The pulses this build answers on a `scene_element.custom` message: the
 * storyteller's tack opening an element's picture full size on the players'
 * table, and closing it again. A pulse is something that happens, not state:
 * nothing is written for it, a table that was not listening never hears of
 * it, and the message's `custom` is open (passthrough) so a later pulse can
 * carry more than an action without a new message shape.
 */
export const SCENE_ELEMENT_PULSES = ["preview.open", "preview.close"] as const;
export type ScenePulse = (typeof SCENE_ELEMENT_PULSES)[number];

export function isScenePulse(action: unknown): action is ScenePulse {
  return SCENE_ELEMENT_PULSES.includes(action as ScenePulse);
}

/** What a pulse carries: its action, and whatever else that action needs. */
export const scenePulseSchema = z.looseObject({ action: z.string() });
export type ScenePulseCustom = z.infer<typeof scenePulseSchema>;

/**
 * The messages on a story's state topic. An element the players may see
 * comes whole, element and link together, whenever either changes;
 * `removed` is the only word of one they may not see, or that has left the
 * scene, and carries ids alone. `scene.changed` says the table moved to
 * another scene, or the scene's own stacks or status changed, which is
 * cheaper to reload than to describe. `scene_element.custom` is a pulse
 * about one element of a scene (SCENE_ELEMENT_PULSES), which the players'
 * table acts on and does not keep.
 */
export const storyEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("scene_element.upserted"),
    element: publicElementSchema,
    sceneElement: publicSceneElementSchema,
  }),
  z.object({
    ...base,
    type: z.literal("scene_element.removed"),
    idStoryScene: z.number().int(),
    idElement: z.number().int(),
    idSceneElement: z.number().int().nullable(),
  }),
  z.object({
    ...base,
    type: z.literal("scene.changed"),
    idStoryScene: z.number().int().nullable(),
  }),
  z.object({
    ...base,
    type: z.literal("session.updated"),
    idStorySession: z.number().int(),
    title: z.string().nullable(),
  }),
  z.object({
    ...base,
    type: z.literal("scene_element.custom"),
    idStoryScene: z.number().int(),
    idElement: z.number().int(),
    custom: scenePulseSchema,
  }),
]);
export type StoryEvent = z.infer<typeof storyEventSchema>;

/** A message as read off the topic, or null for one that is not one of ours. */
export function parseStoryEvent(raw: unknown): StoryEvent | null {
  const parsed = storyEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What a message is about, in a few words, for a log of them. */
export function storyEventTitle(event: StoryEvent): string {
  switch (event.type) {
    case "scene_element.upserted":
      return `${event.type} · ${event.element.name} (${event.sceneElement.status})`;
    case "scene_element.removed":
      return `${event.type} · element ${event.idElement}`;
    case "scene.changed":
      return `${event.type} · scene ${event.idStoryScene ?? "none"}`;
    case "session.updated":
      return `${event.type} · ${event.title ?? "untitled"}`;
    case "scene_element.custom":
      return `${event.type} · element ${event.idElement} (${event.custom.action})`;
  }
}
