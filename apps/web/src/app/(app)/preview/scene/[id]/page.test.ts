// The scene preview's old address sends the reader on to the new one, which
// names the scene's story; a scene the reader may not see is the not-found
// page here as there. Every module the page imports is replaced, so no
// database is touched.
import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

class NotFound extends Error {}
class Redirect extends Error {}
const notFound = () => {
  throw new NotFound("not-found");
};
const redirect = (href: string) => {
  throw new Redirect(href);
};

const requireSession = mock.fn(async () => ({ user: { isAnonymous: false } }));
const getScenePreview = mock.fn(async (_idStoryScene: number): Promise<unknown> => null);

let Page: typeof import("./page").default;

const open = (id: string) => Page({ params: Promise.resolve({ id }) });

describe("the scene preview's old address", () => {
  before(async () => {
    mock.module("next/navigation", { namedExports: { notFound, redirect } });
    mock.module("@/lib/require-session", { namedExports: { requireSession } });
    mock.module("@/app/(app)/stories/[id]/scenes/[idScene]/preview/actions", {
      namedExports: { sa_getScenePreview: getScenePreview },
    });
    Page = (await import("./page")).default;
  });

  beforeEach(() => getScenePreview.mock.resetCalls());

  it("sends the reader on to the preview beside the scene's other pages", async () => {
    getScenePreview.mock.mockImplementation(async () => ({ idStory: 7 }));
    await expect(open("21")).rejects.toThrow(new Redirect("/stories/7/scenes/21/preview"));
  });

  it("shows the not-found page for a scene the reader may not see", async () => {
    getScenePreview.mock.mockImplementation(async () => null);
    await expect(open("21")).rejects.toThrow(NotFound);
  });
});
