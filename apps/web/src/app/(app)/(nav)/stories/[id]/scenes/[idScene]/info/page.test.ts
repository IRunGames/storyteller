// A scene's info page shows a scene under the story the address names, and
// only that one: a scene id under another story's id is the not-found page.
// Every module the page imports is replaced, so no database is touched; a
// server component is an async function, so calling it runs the page's checks
// and returns the element it would render, without rendering it.
import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

class NotFound extends Error {}
const notFound = () => {
  throw new NotFound("not-found");
};

const requireSession = mock.fn(async () => ({ user: { isAnonymous: false } }));
const getStoryScene = mock.fn(async (): Promise<unknown> => null);
const listStatusOptions = mock.fn(async () => []);
const ScenePageDetail = () => null;

let Page: typeof import("./page").default;

// The scene is story 7's; the address names story 7 or another one.
const scene = { idStory: 7 };

const open = (id: string, idScene: string) => Page({ params: Promise.resolve({ id, idScene }) });

describe("a scene's info page", () => {
  before(async () => {
    mock.module("next/navigation", { namedExports: { notFound } });
    mock.module("@/lib/require-session", { namedExports: { requireSession } });
    mock.module("@/components/prep/actions", {
      namedExports: { sa_getStoryScene: getStoryScene },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions: listStatusOptions },
    });
    mock.module("@/components/prep/scene-page-detail", { namedExports: { ScenePageDetail } });
    Page = (await import("./page")).default;
  });

  beforeEach(() => {
    getStoryScene.mock.resetCalls();
    getStoryScene.mock.mockImplementation(async () => scene);
  });

  it("shows the not-found page for a scene that belongs to another story", async () => {
    await expect(open("8", "21")).rejects.toThrow(NotFound);

    expect(getStoryScene.mock.calls[0].arguments).toEqual([21]);
  });

  it("shows the not-found page for a scene that is not there or not the caller's to read", async () => {
    getStoryScene.mock.mockImplementation(async () => null);

    await expect(open("7", "21")).rejects.toThrow(NotFound);
  });

  it("shows a scene under the story the address names", async () => {
    const element = await open("7", "21");

    // The page's own container wraps the detail panel, which gets the scene.
    expect(element.props.children.type).toBe(ScenePageDetail);
    expect(element.props.children.props.initial).toBe(scene);
  });
});
