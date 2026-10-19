import { describe, it } from "node:test";
import { expect } from "expect";
import type { Attachment } from "@/lib/attachments";
import {
  attachmentLabel,
  elementIdOf,
  pillText,
  playStacks,
  RUN_LIBRARY_TABS,
  sortAttachments,
  withShowing,
  type PlayItem,
} from "./run";

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
    idStory: -4,
    kind: "STORY" as const,
    idExternal: 4,
    idAttachmentUse: null,
    status: "READY",
    isUploaded: false,
    isCover: false,
    tags: [],
    createdAt: null,
    updatedAt: null,
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

describe("pillText", () => {
  const fields = { initial_name: "A hooded figure", name: "Dafydd", title: "Shell seller" };

  it("labels the pill with the chosen field, highlighted unless it is the name", () => {
    expect(pillText(fields, "initial_name")).toEqual({
      label: "A hooded figure",
      detail: "Shell seller",
      highlighted: true,
    });
    expect(pillText(fields, "name")).toEqual({
      label: "Dafydd",
      detail: "Shell seller",
      highlighted: false,
    });
    // The title is not repeated underneath itself.
    expect(pillText(fields, "title")).toEqual({
      label: "Shell seller",
      detail: null,
      highlighted: true,
    });
  });

  it("falls back to the name, unhighlighted, for a field left empty", () => {
    expect(pillText({ initial_name: null, name: "Dafydd", title: null }, "initial_name")).toEqual({
      label: "Dafydd",
      detail: null,
      highlighted: false,
    });
  });
});

describe("withShowing", () => {
  it("relabels a linked element's item, and leaves anything else alone", () => {
    const item: PlayItem = {
      key: "PERSON:5",
      kind: "PERSON",
      label: "A hooded figure",
      detail: "Shell seller",
      imageUrl: null,
      fields: { initial_name: "A hooded figure", name: "Dafydd", title: "Shell seller" },
      showing: "initial_name",
    };
    expect(withShowing(item, "name")).toMatchObject({ label: "Dafydd", showing: "name" });
    const loose = { ...item, fields: undefined, showing: undefined };
    expect(withShowing(loose, "name")).toBe(loose);
  });
});

describe("sortAttachments", () => {
  const row = (idAttachment: number, values: Partial<Attachment>): Attachment => ({
    idAttachment,
    idStory: -4,
    kind: "STORY",
    idExternal: -4,
    idAttachmentUse: null,
    status: "READY",
    url: `https://x.test/${idAttachment}.png`,
    isUploaded: true,
    fileName: `file-${idAttachment}.png`,
    isCover: false,
    tags: [],
    createdAt: null,
    updatedAt: null,
    ...values,
  });
  const rows = [
    row(1, {
      fileName: "Tide chart.png",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-03T00:00:00.000Z",
    }),
    row(2, {
      fileName: "Docks map.png",
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    }),
    row(3, {
      fileName: null,
      url: "https://x.test/harbour.png",
      createdAt: "2026-10-03T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    }),
  ];
  const ids = (sorted: Attachment[]) => sorted.map((each) => each.idAttachment);

  it("sorts by the label the list shows, A to Z", () => {
    // The third has no file name, so its label is the address's file name.
    expect(ids(sortAttachments(rows, "file_name"))).toEqual([2, 3, 1]);
  });

  it("sorts newest first by either date", () => {
    expect(ids(sortAttachments(rows, "created"))).toEqual([3, 2, 1]);
    expect(ids(sortAttachments(rows, "updated"))).toEqual([1, 2, 3]);
  });

  it("keeps the order given for rows that tie, and leaves the rows it was given alone", () => {
    const unstamped = [row(7, {}), row(5, {}), row(6, { createdAt: "2026-10-09T00:00:00.000Z" })];
    // A row without a stamp ties with any other, so only the order given holds.
    expect(ids(sortAttachments(unstamped, "created"))).toEqual([7, 5, 6]);
    expect(ids(unstamped)).toEqual([7, 5, 6]);
  });
});
