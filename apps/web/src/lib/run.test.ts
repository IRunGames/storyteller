import { describe, it } from "node:test";
import { expect } from "expect";
import type { Attachment } from "@/lib/attachments";
import { attachmentLabel, RUN_LIBRARY_TABS, sortAttachments } from "./run";

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
