import { describe, it } from "node:test";
import { expect } from "expect";

import { storyStateTopic, storyTopicPrefix } from "./topics";

describe("story topics", () => {
  it("puts every topic of a story under story/{id}", () => {
    expect(storyTopicPrefix(7)).toBe("story/7");
    expect(storyStateTopic(7)).toBe("story/7/state");
  });

  it("keeps a seed story's negative id as it is", () => {
    expect(storyStateTopic(-3)).toBe("story/-3/state");
  });
});
