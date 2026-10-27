import { describe, it } from "node:test";
import { expect } from "expect";

import { chatEventTitle, parseChatEvent, type ChatEvent, type PublicChat } from "./chat-events";

const chat: PublicChat = {
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

const posted: ChatEvent = {
  v: 1,
  at: "2026-10-26T20:05:00.000Z",
  idStory: 7,
  type: "chat.posted",
  chat,
};

describe("parseChatEvent", () => {
  it("takes a line said and a line edited", () => {
    expect(parseChatEvent(posted)).toEqual(posted);
    const edited = { ...posted, type: "chat.edited", chat: { ...chat, isEdited: true } };
    expect(parseChatEvent(edited)).toEqual(edited);
  });

  it("takes a line that carries a roll", () => {
    const rolled = {
      ...posted,
      chat: {
        ...chat,
        text: "6 for initiative",
        roll: {
          notation: "2d4+2",
          label: "initiative",
          total: 6,
          dice: [
            { value: 3, dropped: false },
            { value: 1, dropped: false },
          ],
          detail: "2d4+2: [3, 1]+2 = 6",
        },
      },
    };
    expect(parseChatEvent(rolled)).toEqual(rolled);
    expect(parseChatEvent({ ...rolled, chat: { ...rolled.chat, roll: { total: 6 } } })).toBeNull();
  });

  it("takes a line taken back, by its id", () => {
    const deleted: ChatEvent = { v: 1, at: posted.at, idStory: 7, type: "chat.deleted", idChat: 4 };
    expect(parseChatEvent(deleted)).toEqual(deleted);
    expect(chatEventTitle(deleted)).toBe("chat.deleted · 4");
  });

  it("takes how many are at the table", () => {
    const count: ChatEvent = { v: 1, at: posted.at, idStory: 7, type: "table.count", atTable: 3 };
    expect(parseChatEvent(count)).toEqual(count);
    expect(chatEventTitle(count)).toBe("table.count · 3");
    expect(parseChatEvent({ ...count, atTable: "3" })).toBeNull();
  });

  it("turns away anything that is not one of ours", () => {
    expect(parseChatEvent("hello")).toBeNull();
    expect(parseChatEvent({ ...posted, type: "chat.burned" })).toBeNull();
    expect(parseChatEvent({ ...posted, chat: { ...chat, idChat: "4" } })).toBeNull();
  });
});

describe("chatEventTitle", () => {
  it("names the type, the sender and the start of the line", () => {
    expect(chatEventTitle(posted)).toBe("chat.posted · Harry: It's ticking.");
  });
});
