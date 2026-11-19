// A scene's preview shows a scene under the story the address names, and
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
const getScenePreview = mock.fn(async (_idStoryScene: number): Promise<unknown> => null);
const ScenePreview = () => null;

let Page: typeof import("./page").default;

// The scene is story 7's; the address names story 7 or another one.
const preview = {
  idStory: 7,
  storyTitle: "Psychoneira",
  scene: {},
  previous: null,
  next: null,
  scenes: [],
  isOwner: true,
};

const open = (id: string, idScene: string) => Page({ params: Promise.resolve({ id, idScene }) });

describe("a scene's preview page", () => {
  before(async () => {
    mock.module("next/navigation", { namedExports: { notFound } });
    mock.module("@/lib/require-session", { namedExports: { requireSession } });
    mock.module("./actions", { namedExports: { sa_getScenePreview: getScenePreview } });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions: mock.fn(async () => []) },
    });
    mock.module("./scene-preview", { namedExports: { ScenePreview } });
    Page = (await import("./page")).default;
  });

  beforeEach(() => {
    getScenePreview.mock.resetCalls();
    getScenePreview.mock.mockImplementation(async () => preview);
  });

  it("shows the not-found page for a scene that belongs to another story", async () => {
    await expect(open("8", "21")).rejects.toThrow(NotFound);
    expect(getScenePreview.mock.calls[0].arguments).toEqual([21]);
  });

  it("shows the not-found page for a scene the caller may not see", async () => {
    getScenePreview.mock.mockImplementation(async () => null);
    await expect(open("7", "21")).rejects.toThrow(NotFound);
  });

  it("shows a scene under the story the address names, its owner able to annotate", async () => {
    const element = (await open("7", "21")) as { props: Record<string, unknown> };
    expect(element.props).toMatchObject({ idStory: 7, canEdit: true });
  });
});
