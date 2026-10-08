import { describe, it } from "node:test";
import { expect } from "expect";
import { attachmentLabel, RUN_LIBRARY_TABS } from "./run";

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
