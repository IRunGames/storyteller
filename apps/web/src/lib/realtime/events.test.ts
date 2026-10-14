import { describe, it } from "node:test";
import { expect } from "expect";

import {
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
  it("drops the storyteller's notes and the database's own columns from an element", () => {
    const pub = toPublicElement(element, "https://blob/zed.png", true);

    expect(pub).not.toHaveProperty("notes");
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

  it("keeps the description back while the link does not show its info", () => {
    expect(toPublicElement(element, null, true).description).toBe("Keeps the docks.");
    expect(toPublicElement(element, null, false).description).toBeNull();
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

  it("says when the table is on no scene", () => {
    expect(
      storyEventTitle({ v: 1, at: "", idStory: 7, type: "scene.changed", idStoryScene: null }),
    ).toBe("scene.changed · scene none");
  });
});
