import { describe, it } from "node:test";
import { expect } from "expect";

import {
  isScenePulse,
  parseStoryEvent,
  storyEventTitle,
  toPublicElement,
  toPublicSceneElement,
  type ElementRow,
  type SceneElementRow,
} from "./events";

const when = new Date("2026-10-13T10:00:00Z");

const element: ElementRow = {
  idElement: 5,
  idStory: 7,
  kind: "PERSON",
  status: "READY",
  initialName: "A hooded figure",
  name: "Zed",
  title: "Harbourmaster",
  description: "Keeps the docks.",
  notes: "Secretly the villain.",
  url: "https://example.com/zed",
  urlText: "Zed's ledger",
  tags: ["docks"],
  searchText: "READY A hooded figure Zed Harbourmaster",
  activityLog: [{ at: "x" }],
  pendingAt: null,
  readyAt: when,
  inactiveAt: null,
  createdAt: when,
  updatedAt: when,
  idCreatedByUser: "u1",
  idUpdatedByUser: "u1",
};

const link: SceneElementRow = {
  idSceneElement: 11,
  idStoryScene: 3,
  idElement: 5,
  status: "READY",
  tags: ["scene"],
  elementShowing: "initial_name",
  showInfo: true,
  showImage: false,
  url: null,
  urlText: null,
  activityLog: [{ at: "x" }],
  readyAt: when,
  invisibleAt: null,
  tappedAt: null,
  disabledAt: null,
  createdAt: when,
  updatedAt: when,
  idCreatedByUser: "u1",
  idUpdatedByUser: "u1",
};

describe("public rows", () => {
  it("keeps the players' notes, and drops the database's own columns from an element", () => {
    const pub = toPublicElement(element, "https://blob/zed.png", true);

    expect(pub.notes).toBe("Secretly the villain.");
    expect(pub).not.toHaveProperty("searchText");
    expect(pub).not.toHaveProperty("activityLog");
    expect(pub).not.toHaveProperty("idCreatedByUser");
    expect(pub).toMatchObject({
      idElement: 5,
      name: "Zed",
      initialName: "A hooded figure",
      imageUrl: "https://blob/zed.png",
      readyAt: "2026-10-13T10:00:00.000Z",
      pendingAt: null,
    });
  });

  it("keeps the description and the links back while the link does not show its info", () => {
    expect(toPublicElement(element, null, true)).toMatchObject({
      description: "Keeps the docks.",
      url: "https://example.com/zed",
      urlText: "Zed's ledger",
    });
    expect(toPublicElement(element, null, false)).toMatchObject({
      description: null,
      url: null,
      urlText: null,
    });
    const linked = { ...link, url: "https://example.com/docks", urlText: "Here" };
    expect(toPublicSceneElement(linked)).toMatchObject({ url: "https://example.com/docks" });
    expect(toPublicSceneElement({ ...linked, showInfo: false })).toMatchObject({
      url: null,
      urlText: null,
    });
  });

  it("drops the activity log from a link", () => {
    const pub = toPublicSceneElement(link);

    expect(pub).not.toHaveProperty("activityLog");
    expect(pub).toMatchObject({
      idSceneElement: 11,
      elementShowing: "initial_name",
      showInfo: true,
      tappedAt: null,
    });
    expect(pub).not.toHaveProperty("showImage");
  });
});

describe("parseStoryEvent", () => {
  it("reads back what the publisher wrote", () => {
    const event = {
      v: 1,
      at: when.toISOString(),
      idStory: 7,
      type: "scene_element.upserted",
      element: toPublicElement(element, null, true),
      sceneElement: toPublicSceneElement(link),
    };

    expect(parseStoryEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });

  it("reads a pulse, whatever its action, and keeps what else it carries", () => {
    const pulse = {
      v: 1,
      at: when.toISOString(),
      idStory: 7,
      type: "scene_element.custom",
      idStoryScene: 3,
      idElement: 5,
      custom: { action: "preview.open" },
    };
    expect(parseStoryEvent(JSON.parse(JSON.stringify(pulse)))).toEqual(pulse);
    // A later pulse may say more than this build knows; it is read, not refused.
    const later = { ...pulse, custom: { action: "dice.roll", sides: 20 } };
    expect(parseStoryEvent(JSON.parse(JSON.stringify(later)))).toEqual(later);
    expect(parseStoryEvent({ ...pulse, custom: {} })).toBeNull();
  });

  it("knows which pulses this build answers", () => {
    expect(isScenePulse("preview.open")).toBe(true);
    expect(isScenePulse("preview.close")).toBe(true);
    expect(isScenePulse("dice.roll")).toBe(false);
  });

  it("refuses a message that is not one of ours", () => {
    expect(parseStoryEvent({ type: "scene_element.upserted" })).toBeNull();
    expect(parseStoryEvent("hello")).toBeNull();
    expect(parseStoryEvent({ v: 2, at: "", idStory: 7, type: "scene.changed" })).toBeNull();
  });
});

describe("storyEventTitle", () => {
  it("names the element an upsert carries and the status it is in", () => {
    const title = storyEventTitle({
      v: 1,
      at: "",
      idStory: 7,
      type: "scene_element.upserted",
      element: toPublicElement(element, null, true),
      sceneElement: toPublicSceneElement(link),
    });
    expect(title).toBe("scene_element.upserted · Zed (READY)");
  });

  it("names the element and the action of a pulse", () => {
    expect(
      storyEventTitle({
        v: 1,
        at: "",
        idStory: 7,
        type: "scene_element.custom",
        idStoryScene: 3,
        idElement: 5,
        custom: { action: "preview.open" },
      }),
    ).toBe("scene_element.custom · element 5 (preview.open)");
  });

  it("says when the table is on no scene", () => {
    expect(
      storyEventTitle({ v: 1, at: "", idStory: 7, type: "scene.changed", idStoryScene: null }),
    ).toBe("scene.changed · scene none");
  });
});
