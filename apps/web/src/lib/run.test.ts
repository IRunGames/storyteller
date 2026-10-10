import { describe, it } from "node:test";
import { expect } from "expect";
import { attachmentLabel, elementIdOf, playStacks, RUN_LIBRARY_TABS, type PlayItem } from "./run";

describe("RUN_LIBRARY_TABS", () => {
  it("puts Attachments first, then every kind of element in the board's order", () => {
    expect(RUN_LIBRARY_TABS.map((tab) => tab.title)).toEqual([
      "Attachments",
      "People",
      "Places",
      "Things",
      "Other",
      "Ephemera",
    ]);
  });
});

describe("attachmentLabel", () => {
  const base = {
    idAttachment: 1,
    kind: "STORY" as const,
    idExternal: 4,
    status: "READY",
    isUploaded: false,
    isCover: false,
    tags: [],
  };

  it("names an attachment by its file name", () => {
    expect(attachmentLabel({ ...base, url: "https://x.test/a/map.png", fileName: "Map" })).toBe(
      "Map",
    );
  });

  it("falls back to the last part of a link's address, then to a plain word", () => {
    expect(
      attachmentLabel({
        ...base,
        url: "https://x.test/maps/kildealg%20docks.webp",
        fileName: null,
      }),
    ).toBe("kildealg docks.webp");
    expect(attachmentLabel({ ...base, url: null, fileName: null })).toBe("Attachment");
  });
});

describe("playStacks", () => {
  const item = (key: string, sceneTags?: string[]): PlayItem => ({
    key,
    kind: "PERSON",
    label: key,
    detail: null,
    imageUrl: null,
    sceneTags,
  });
  const keys = (stacks: ReturnType<typeof playStacks>) =>
    stacks.map((stack) => [stack.title, stack.items.map((i) => i.key)]);

  it("makes one stack per scene tag and files each item under every tag it carries", () => {
    const stacks = playStacks(
      ["elements", "scene"],
      [item("a", ["scene"]), item("b", ["elements", "scene"])],
    );
    expect(stacks.map((stack) => stack.tag)).toEqual(["elements", "scene"]);
    expect(keys(stacks)).toEqual([
      ["elements", ["b"]],
      ["scene", ["a", "b"]],
    ]);
  });

  it("puts an untagged item, one tagged off the scene's list, or an unlinked one in the first stack", () => {
    const stacks = playStacks(
      ["elements", "scene"],
      [item("a", []), item("b", ["other"]), item("c")],
    );
    expect(keys(stacks)).toEqual([
      ["elements", ["a", "b", "c"]],
      ["scene", []],
    ]);
  });

  it("makes a single Default stack, with no tag, for a scene with none", () => {
    const stacks = playStacks([], [item("a", ["scene"])]);
    expect(stacks).toEqual([{ tag: null, title: "Default", items: [item("a", ["scene"])] }]);
  });
});

describe("elementIdOf", () => {
  it("reads the element id out of an item's key, negative ids included", () => {
    const item = (key: string): PlayItem => ({
      key,
      kind: "PERSON",
      label: "x",
      detail: null,
      imageUrl: null,
    });
    expect(elementIdOf(item("PERSON:5"))).toBe(5);
    expect(elementIdOf(item("EPHEMERA:-12"))).toBe(-12);
  });
});
