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

  it("turns away anything that is not one of ours", () => {
    expect(parseChatEvent("hello")).toBeNull();
    expect(parseChatEvent({ ...posted, type: "chat.deleted" })).toBeNull();
    expect(parseChatEvent({ ...posted, chat: { ...chat, idChat: "4" } })).toBeNull();
  });
});

describe("chatEventTitle", () => {
  it("names the type, the sender and the start of the line", () => {
    expect(chatEventTitle(posted)).toBe("chat.posted · Harry: It's ticking.");
  });
});
