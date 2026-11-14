// The scene builder opens a scene under the story the address names, and only
// that one: a scene id under another story's id is the not-found page. Every
// module the page imports is replaced, so no database is touched; a server
// component is an async function, so calling it runs the page's checks and
// returns the element it would render, without rendering it.
import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

class NotFound extends Error {}
const notFound = () => {
  throw new NotFound("not-found");
};

const requireSession = mock.fn(async () => ({ user: { isAnonymous: false } }));
const getSceneForEdit = mock.fn(async (): Promise<unknown> => null);
const getPlayStory = mock.fn(async (): Promise<unknown> => null);
const getScenePlaySpace = mock.fn(async (): Promise<unknown> => null);
const listStatusOptions = mock.fn(async () => []);
const LiveTable = () => null;

let Page: typeof import("./page").default;

// The scene is story 7's; the address names story 7 or another one.
const scene = { idStory: 7, sessions: [], values: { idStorySession: null } };

const open = (id: string, idScene: string) => Page({ params: Promise.resolve({ id, idScene }) });

describe("the scene builder page", () => {
  before(async () => {
    mock.module("next/navigation", { namedExports: { notFound } });
    mock.module("@/lib/require-session", { namedExports: { requireSession } });
    mock.module("@/components/prep/actions", {
      namedExports: { sa_getStorySceneForEdit: getSceneForEdit },
    });
    mock.module("@/components/play/actions", {
      namedExports: { sa_getPlayStory: getPlayStory },
    });
    mock.module("@/components/run/actions", {
      namedExports: { sa_getScenePlaySpace: getScenePlaySpace },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions: listStatusOptions },
    });
    mock.module("@/components/live/live-table", { namedExports: { LiveTable } });
    Page = (await import("./page")).default;
  });

  beforeEach(() => {
    for (const fn of [getSceneForEdit, getPlayStory, getScenePlaySpace, listStatusOptions]) {
      fn.mock.resetCalls();
    }
    getSceneForEdit.mock.mockImplementation(async () => scene);
    getPlayStory.mock.mockImplementation(async () => ({ title: "Tale", isOwner: true }));
    getScenePlaySpace.mock.mockImplementation(async () => ({
      scene: { idStoryScene: 21 },
      tags: [],
      coverUrl: null,
      inPlay: [],
    }));
  });

  it("shows the not-found page for a scene that belongs to another story", async () => {
    await expect(open("8", "21")).rejects.toThrow(NotFound);

    // It stops at the scene check, before the story and the table are read.
    expect(getSceneForEdit.mock.callCount()).toBe(1);
    expect(getPlayStory.mock.callCount()).toBe(0);
    expect(getScenePlaySpace.mock.callCount()).toBe(0);
  });

  it("shows the not-found page for a scene that is not there or not the caller's", async () => {
    getSceneForEdit.mock.mockImplementation(async () => null);

    await expect(open("7", "21")).rejects.toThrow(NotFound);
  });

  it("opens the table for a scene under the story the address names", async () => {
    const element = await open("7", "21");

    expect(element.type).toBe(LiveTable);
    expect(element.props.idStory).toBe(7);
    expect(getSceneForEdit.mock.calls[0].arguments).toEqual([21]);
  });
});
