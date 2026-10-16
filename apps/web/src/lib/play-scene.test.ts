import { describe, it } from "node:test";
import { expect } from "expect";

import type { PublicElement, PublicSceneElement, StoryEvent } from "@/lib/realtime/events";
import { applyStoryEvent, sortPlaySceneItems, toPlayItem, type PlayScene } from "./play-scene";

function element(over: Partial<PublicElement> = {}): PublicElement {
  return {
    idElement: 5,
    idStory: 7,
    kind: "PERSON",
    status: "READY",
    initialName: "A hooded figure",
    name: "Zed",
    title: "Harbourmaster",
    description: null,
    notes: null,
    imageUrl: null,
    url: null,
    urlText: null,
    tags: [],
    pendingAt: null,
    readyAt: null,
    inactiveAt: null,
    createdAt: "2026-10-13T10:00:00.000Z",
    updatedAt: "2026-10-13T10:00:00.000Z",
    ...over,
  };
}

function link(over: Partial<PublicSceneElement> = {}): PublicSceneElement {
  return {
    idSceneElement: 11,
    idStoryScene: 3,
    idElement: 5,
    status: "READY",
    tags: ["scene"],
    elementShowing: "initial_name",
    showInfo: true,
    url: null,
    urlText: null,
    readyAt: null,
    invisibleAt: null,
    tappedAt: null,
    disabledAt: null,
    createdAt: "2026-10-13T10:00:00.000Z",
    updatedAt: "2026-10-13T10:00:00.000Z",
    ...over,
  };
}

const scene: PlayScene = {
  idStorySession: 2,
  scene: {
    idStoryScene: 3,
    title: "The docks",
    status: "ACTIVE",
    text: { description: "Fog on the water.", notes: null },
  },
  tags: ["scene", "elements"],
  coverUrl: null,
  items: [{ element: element(), sceneElement: link() }],
};

const base = { v: 1 as const, at: "2026-10-13T10:01:00.000Z", idStory: 7 };

describe("toPlayItem", () => {
  it("keys and labels the pill as the storyteller's table does", () => {
    expect(toPlayItem({ element: element(), sceneElement: link() })).toMatchObject({
      key: "PERSON:5",
      kind: "PERSON",
      label: "A hooded figure",
      detail: "Harbourmaster",
      sceneTags: ["scene"],
      sceneStatus: "READY",
      showing: "initial_name",
    });
  });

  it("carries the description as info only while the link shows it", () => {
    const keeps = element({ description: "Keeps the docks." });
    expect(toPlayItem({ element: keeps, sceneElement: link() })).toMatchObject({
      showInfo: true,
      info: "Keeps the docks.",
    });
    expect(toPlayItem({ element: keeps, sceneElement: link({ showInfo: false }) })).toMatchObject({
      showInfo: false,
      info: null,
    });
  });

  it("falls back to the name when the chosen field is empty or unknown", () => {
    const item = toPlayItem({
      element: element({ initialName: null }),
      sceneElement: link({ elementShowing: "whatever" }),
    });
    expect(item.label).toBe("Zed");
    expect(item.showing).toBe("initial_name");
  });
});

describe("sortPlaySceneItems", () => {
  it("orders by kind, then name", () => {
    const sorted = sortPlaySceneItems([
      { element: element({ idElement: 1, kind: "THING", name: "Lantern" }), sceneElement: link() },
      { element: element({ idElement: 2, kind: "PERSON", name: "Zed" }), sceneElement: link() },
      { element: element({ idElement: 3, kind: "PERSON", name: "Abbot" }), sceneElement: link() },
    ]);
    expect(sorted.map((item) => item.element.name)).toEqual(["Abbot", "Zed", "Lantern"]);
  });
});

describe("applyStoryEvent", () => {
  it("adds an element to the scene in the storyteller's order", () => {
    const event: StoryEvent = {
      ...base,
      type: "scene_element.upserted",
      element: element({ idElement: 6, name: "Abbot" }),
      sceneElement: link({ idSceneElement: 12, idElement: 6 }),
    };
    const { scene: next, refetch } = applyStoryEvent(scene, event);
    expect(refetch).toBe(false);
    expect(next.items.map((item) => item.element.name)).toEqual(["Abbot", "Zed"]);
  });

  it("replaces an element already held", () => {
    const event: StoryEvent = {
      ...base,
      type: "scene_element.upserted",
      element: element({ name: "Zed the Grey", updatedAt: "2026-10-13T10:02:00.000Z" }),
      sceneElement: link({ status: "DISABLED" }),
    };
    const { scene: next } = applyStoryEvent(scene, event);
    expect(next.items).toHaveLength(1);
    expect(next.items[0].element.name).toBe("Zed the Grey");
    expect(next.items[0].sceneElement.status).toBe("DISABLED");
  });

  it("drops an upsert older than what is held on both rows", () => {
    const event: StoryEvent = {
      ...base,
      type: "scene_element.upserted",
      element: element({ name: "Old Zed", updatedAt: "2026-10-13T09:00:00.000Z" }),
      sceneElement: link({ updatedAt: "2026-10-13T09:00:00.000Z" }),
    };
    expect(applyStoryEvent(scene, event).scene).toBe(scene);
  });

  it("takes an element out on a removal, and a hidden upsert", () => {
    const removed: StoryEvent = {
      ...base,
      type: "scene_element.removed",
      idStoryScene: 3,
      idElement: 5,
      idSceneElement: 11,
    };
    expect(applyStoryEvent(scene, removed).scene.items).toEqual([]);

    const hidden: StoryEvent = {
      ...base,
      type: "scene_element.upserted",
      element: element(),
      sceneElement: link({ status: "INVISIBLE" }),
    };
    expect(applyStoryEvent(scene, hidden).scene.items).toEqual([]);
  });

  it("ignores a removal from another scene", () => {
    const event: StoryEvent = {
      ...base,
      type: "scene_element.removed",
      idStoryScene: 4,
      idElement: 5,
      idSceneElement: 11,
    };
    expect(applyStoryEvent(scene, event)).toEqual({ scene, refetch: false });
  });

  it("asks for a reload on a change of scene, or an upsert for a scene not held", () => {
    expect(
      applyStoryEvent(scene, { ...base, type: "scene.changed", idStoryScene: 4 }).refetch,
    ).toBe(true);
    const other: StoryEvent = {
      ...base,
      type: "scene_element.upserted",
      element: element(),
      sceneElement: link({ idStoryScene: 4 }),
    };
    expect(applyStoryEvent(scene, other).refetch).toBe(true);
  });

  it("leaves the scene alone when the session is renamed", () => {
    const event: StoryEvent = { ...base, type: "session.updated", idStorySession: 2, title: "X" };
    expect(applyStoryEvent(scene, event)).toEqual({ scene, refetch: false });
  });
});
