import { afterEach, describe, it } from "node:test";
import { expect } from "expect";
import { chatLog } from "./chat-log";

describe("chatLog", () => {
  afterEach(() => chatLog.clear());

  it("keeps each line posted and tells whoever is listening", () => {
    const heard: string[] = [];
    const stop = chatLog.subscribe((entry) => heard.push(entry.kind === "text" ? entry.text : ""));

    const entry = chatLog.post({ from: "Storyteller", text: "untapped Zed" });
    expect(entry).toMatchObject({ kind: "text", from: "Storyteller", text: "untapped Zed" });
    expect(entry.time).toMatch(/\d/);
    expect(heard).toEqual(["untapped Zed"]);
    expect(chatLog.entries().map((line) => line.id)).toEqual([entry.id]);

    stop();
    chatLog.post({ from: "Storyteller", text: "quiet" });
    expect(heard).toEqual(["untapped Zed"]);
    expect(chatLog.entries()).toHaveLength(2);
  });
});
