import { describe, it } from "node:test";
import { expect } from "expect";
import {
  chatTime,
  inkOn,
  isSceneEntry,
  mergeChatEntries,
  sceneEntryText,
  senderInitials,
  senderNameColor,
  senderPalette,
  toChatEntry,
} from "./chat";

describe("senderPalette", () => {
  it("gives a sender the same palette every time", () => {
    expect(senderPalette("Harry")).toBe(senderPalette("Harry"));
  });

  it("spreads senders over more than one palette", () => {
    const palettes = new Set(["Harry", "Tom", "David", "Storyteller", "Ana"].map(senderPalette));
    expect(palettes.size).toBeGreaterThan(1);
  });
});

describe("inkOn", () => {
  it("writes black on a light colour and white on a dark one", () => {
    expect(inkOn("#FFC53D")).toBe("black");
    expect(inkOn("#6E56CF")).toBe("white");
  });
});

describe("senderNameColor", () => {
  it("keeps the colour on the dark theme and darkens it on the light one", () => {
    expect(senderNameColor("#FFC53D")).toEqual({
      base: "color-mix(in oklab, #FFC53D 60%, black)",
      _dark: "#FFC53D",
    });
  });
});

describe("senderInitials", () => {
  it("takes two letters whatever the name", () => {
    expect(senderInitials("David Williams")).toBe("DW");
    expect(senderInitials("Harry")).toBe("HA");
    expect(senderInitials("  tom  ")).toBe("TO");
    expect(senderInitials("Ana Lucia Reyes")).toBe("AL");
  });
});

const chat = {
  idChat: 4,
  idStoryScene: 3,
  idUser: "u1",
  from: "Harry",
  text: "It's ticking.",
  isSystem: false,
  isEdited: false,
  createdAt: "2026-10-26T20:05:00.000Z",
  color: null,
  picture: null,
  roll: null,
};

describe("isSceneEntry", () => {
  it("is a system line that enters a scene", () => {
    expect(isSceneEntry({ isSystem: true, text: sceneEntryText("The Docks") })).toBe(true);
    expect(isSceneEntry({ isSystem: true, text: "Harry untapped Zed" })).toBe(false);
    expect(isSceneEntry({ isSystem: false, text: "Entering the docks now" })).toBe(false);
  });
});

describe("toChatEntry", () => {
  it("makes a person's line text, keyed by its row", () => {
    expect(toChatEntry(chat)).toEqual({
      id: "chat-4",
      idChat: 4,
      idUser: "u1",
      from: "Harry",
      color: null,
      picture: null,
      createdAt: chat.createdAt,
      isEdited: false,
      kind: "text",
      text: "It's ticking.",
    });
  });

  it("carries the sender's profile colour and picture", () => {
    const entry = toChatEntry({ ...chat, color: "#46A758", picture: "https://x.test/me.png" });
    expect(entry.color).toBe("#46A758");
    expect(entry.picture).toBe("https://x.test/me.png");
  });

  it("makes the scene divider and other system lines their own kinds", () => {
    expect(toChatEntry({ ...chat, isSystem: true, text: "Entering The Docks" }).kind).toBe("scene");
    expect(toChatEntry({ ...chat, isSystem: true, text: "Harry untapped Zed" }).kind).toBe(
      "system",
    );
  });

  it("makes a line that carries a roll a roll, whatever its text", () => {
    const roll = {
      notation: "2d4+2",
      label: "initiative",
      total: 6,
      dice: [
        { value: 3, dropped: false },
        { value: 1, dropped: false },
      ],
      detail: "2d4+2: [3, 1]+2 = 6",
    };
    expect(toChatEntry({ ...chat, text: "6 for initiative", roll })).toMatchObject({
      kind: "roll",
      text: "6 for initiative",
      roll,
    });
  });
});

describe("chatTime", () => {
  const now = new Date(2026, 9, 26, 21, 0);
  const daysAgo = (days: number) => new Date(2026, 9, 26 - days, 12, 0).toISOString();

  it("shows the clock time for a line said today", () => {
    expect(chatTime(new Date(2026, 9, 26, 8, 5).toISOString(), now)).toMatch(/8:05/);
  });

  it("counts days, then weeks, then months, then years", () => {
    expect(chatTime(daysAgo(1), now)).toMatch(/^1 day ago$/);
    expect(chatTime(daysAgo(6), now)).toMatch(/^6 days ago$/);
    expect(chatTime(daysAgo(8), now)).toMatch(/^1 week ago$/);
    expect(chatTime(daysAgo(29), now)).toMatch(/^4 weeks ago$/);
    expect(chatTime(daysAgo(40), now)).toMatch(/^1 month ago$/);
    expect(chatTime(daysAgo(400), now)).toMatch(/^1 year ago$/);
  });

  it("counts from midnight, so last night is a day ago", () => {
    const earlyMorning = new Date(2026, 9, 26, 1, 0);
    expect(chatTime(new Date(2026, 9, 25, 23, 0).toISOString(), earlyMorning)).toMatch(
      /^1 day ago$/,
    );
  });
});

describe("mergeChatEntries", () => {
  it("keeps one line per row, the later copy winning, in the order said", () => {
    const first = toChatEntry(chat);
    const second = toChatEntry({ ...chat, idChat: 5, createdAt: "2026-10-26T20:06:00.000Z" });
    const edited = toChatEntry({ ...chat, text: "It stopped.", isEdited: true });

    const merged = mergeChatEntries([second, first], [edited]);
    expect(merged.map((entry) => entry.id)).toEqual(["chat-4", "chat-5"]);
    expect(merged[0]).toMatchObject({ text: "It stopped.", isEdited: true });
  });
});
