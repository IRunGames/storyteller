// A scene's edit page opens a scene under the story the address names, and
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
const getSceneForEdit = mock.fn(async (): Promise<unknown> => null);
const getScenePlaySpace = mock.fn(async (): Promise<unknown> => null);
const listStatusOptions = mock.fn(async () => []);
const SceneForm = () => null;

let Page: typeof import("./page").default;

// The scene is story 7's; the address names story 7 or another one.
const scene = {
  idStory: 7,
  locked: false,
  sessions: [],
  status: "draft",
  values: { title: "Arrival" },
};

const open = (id: string, idScene: string) =>
  Page({
    params: Promise.resolve({ id, idScene }),
    searchParams: Promise.resolve({}),
  });

describe("a scene's edit page", () => {
  before(async () => {
    mock.module("next/navigation", { namedExports: { notFound } });
    mock.module("@/lib/require-session", { namedExports: { requireSession } });
    mock.module("@/components/prep/actions", {
      namedExports: { sa_getStorySceneForEdit: getSceneForEdit },
    });
    mock.module("@/components/run/actions", {
      namedExports: { sa_getScenePlaySpace: getScenePlaySpace },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions: listStatusOptions },
    });
    mock.module("@/components/prep/scene-form", { namedExports: { SceneForm } });
    Page = (await import("./page")).default;
  });

  beforeEach(() => {
    getSceneForEdit.mock.resetCalls();
    getScenePlaySpace.mock.resetCalls();
    getSceneForEdit.mock.mockImplementation(async () => scene);
    getScenePlaySpace.mock.mockImplementation(async () => ({
      tags: [],
      coverUrl: null,
      inPlay: [],
    }));
  });

  it("shows the not-found page for a scene that belongs to another story", async () => {
    await expect(open("8", "21")).rejects.toThrow(NotFound);

    // It stops at the scene check, before the play space is read.
    expect(getSceneForEdit.mock.calls[0].arguments).toEqual([21]);
    expect(getScenePlaySpace.mock.callCount()).toBe(0);
  });

  it("shows the not-found page for a scene that is not there or not the caller's", async () => {
    getSceneForEdit.mock.mockImplementation(async () => null);

    await expect(open("7", "21")).rejects.toThrow(NotFound);
  });

  it("shows the not-found page for a completed scene, which has no edit form", async () => {
    getSceneForEdit.mock.mockImplementation(async () => ({ ...scene, locked: true }));

    await expect(open("7", "21")).rejects.toThrow(NotFound);
  });

  it("opens the form for a scene under the story the address names", async () => {
    const element = await open("7", "21");

    expect(getScenePlaySpace.mock.calls[0].arguments).toEqual([7, 21]);
    // The cover backdrop is absent, so the container is the box's only child.
    const form = element.props.children[1].props.children;
    expect(form.type).toBe(SceneForm);
    expect(form.props.idStory).toBe(7);
  });
});
