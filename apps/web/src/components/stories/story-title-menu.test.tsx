import { afterEach, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

// The page the menu is on, as the router would say.
let pathname = "/stories/-15";
const push = mock.fn((_href: string) => {});
// Build scenes makes the first scene of a story without one.
const sa_createLiveScene = mock.fn(async (_idStory: number, values: { title: string }) => ({
  ok: true as const,
  space: {
    scene: { idStoryScene: -70, title: values.title, status: "PENDING" },
    tags: [],
    coverUrl: null,
    inPlay: [],
  },
}));
// Run asks which session, as Play does: a suspended one to resume, or a new one.
const sa_listUnfinishedSessions = mock.fn(async (_idStory: number) => [
  { idStorySession: 7, number: 3, title: "Kildealg", status: "SUSPENDED" },
]);
const sa_startPlaying = mock.fn(
  async (_idStory: number, _idSession: number | null, _title: string) => ({
    error: "Refused for the test.",
  }),
);
let StoryTitleMenu: typeof import("./story-title-menu").StoryTitleMenu;

describe("StoryTitleMenu", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { usePathname: () => pathname, useRouter: () => ({ push }) },
    });
    mock.module("@/app/(app)/(nav)/play/actions", {
      namedExports: { sa_listUnfinishedSessions, sa_startPlaying },
    });
    mock.module("@/app/(app)/run/[id]/actions", { namedExports: { sa_createLiveScene } });
    ({ StoryTitleMenu } = await import("./story-title-menu"));
  });

  afterEach(() => {
    cleanup();
    pathname = "/stories/-15";
    push.mock.resetCalls();
    sa_createLiveScene.mock.resetCalls();
    sa_listUnfinishedSessions.mock.resetCalls();
    sa_startPlaying.mock.resetCalls();
  });

  it("draws the title as the page's h1 with a caret, opening the storyteller's doors as links", async () => {
    const user = userEvent.setup();
    pathname = "/somewhere/else";
    renderWithProviders(
      <StoryTitleMenu idStory={-15} title="Vampire" isStoryteller buildSceneId={-7} />,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Vampire" });
    const trigger = screen.getByRole("button", { name: "Vampire" });
    expect(heading).toContainElement(trigger);
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    const links = screen.getAllByRole("menuitem");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Overview", "/stories/-15"],
      ["Edit", "/stories/-15/edit"],
      ["Library", "/libraries/-15"],
      ["Build scenes", "/scenes/-7/live"],
      ["Play", null],
      ["Storyboard", "/stories/-15/storyboard"],
    ]);
    // Real links, so the browser's own ways with them hold; Play opens the
    // Play popover instead.
    for (const link of links) {
      if (link.textContent !== "Play") expect(link.tagName).toBe("A");
    }
    expect(menu).toBeInTheDocument();
  });

  it("asks which session from Play, as the Play button does, by the title", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryTitleMenu idStory={-15} title="Vampire" isStoryteller />);

    await user.click(screen.getByRole("button", { name: "Vampire" }));
    await user.click(await screen.findByRole("menuitem", { name: "Play" }));
    const ask = await screen.findByRole("dialog", { name: "Play Vampire" });
    await waitFor(() => expect(sa_listUnfinishedSessions.mock.calls[0]?.arguments).toEqual([-15]));
    const select = within(ask).getByRole("combobox", { name: "Session" });
    await waitFor(() => expect(select).toHaveValue("7"));
    await user.selectOptions(select, "");
    await user.click(within(ask).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(sa_startPlaying.mock.callCount()).toBe(1));
    expect(sa_startPlaying.mock.calls[0].arguments.slice(0, 2)).toEqual([-15, null]);
    expect(await within(ask).findByRole("alert")).toHaveTextContent("Refused for the test.");
  });

  it("marks the page it is on as current, and that item is no link", async () => {
    const user = userEvent.setup();
    pathname = "/libraries/-15";
    renderWithProviders(
      <StoryTitleMenu idStory={-15} title="Vampire" isStoryteller buildSceneId={-7} />,
    );

    await user.click(screen.getByRole("button", { name: "Vampire" }));
    const library = await screen.findByRole("menuitem", { name: "Library" });
    expect(library).toHaveAttribute("aria-current", "page");
    expect(library.tagName).not.toBe("A");
    expect(library).not.toHaveAttribute("href");
    const edit = screen.getByRole("menuitem", { name: "Edit" });
    expect(edit).not.toHaveAttribute("aria-current");
    expect(edit).toHaveAttribute("href", "/stories/-15/edit");
  });

  it("marks Play on the storyteller's table", async () => {
    const user = userEvent.setup();
    pathname = "/run/-15";
    renderWithProviders(<StoryTitleMenu idStory={-15} title="Vampire" isStoryteller />);

    await user.click(screen.getByRole("button", { name: "Vampire" }));
    const run = await screen.findByRole("menuitem", { name: "Play" });
    expect(run).toHaveAttribute("aria-current", "page");
    expect(run).not.toHaveAttribute("href");
  });

  it("counts any scene's live page as Build scenes", async () => {
    const user = userEvent.setup();
    pathname = "/scenes/-3/live";
    renderWithProviders(
      <StoryTitleMenu idStory={-15} title="Vampire" isStoryteller buildSceneId={-7} />,
    );

    await user.click(screen.getByRole("button", { name: "Vampire" }));
    expect(await screen.findByRole("menuitem", { name: "Build scenes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("makes the first scene from Build scenes while the story has none, and goes to it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryTitleMenu idStory={-15} title="Vampire" isStoryteller />);

    await user.click(screen.getByRole("button", { name: "Vampire" }));
    const build = await screen.findByRole("menuitem", { name: "Build scenes" });
    // No page to link to yet, so no link.
    expect(build).not.toHaveAttribute("href");
    await user.click(build);
    await waitFor(() => expect(sa_createLiveScene.mock.callCount()).toBe(1));
    expect(sa_createLiveScene.mock.calls[0].arguments).toEqual([
      -15,
      { title: "New scene", description: "" },
    ]);
    await waitFor(() => expect(push.mock.calls.at(-1)?.arguments).toEqual(["/scenes/-70/live"]));
  });

  it("offers a reader the Storyboard alone", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryTitleMenu idStory={-15} title="Vampire" isStoryteller={false} />);

    await user.click(screen.getByRole("button", { name: "Vampire" }));
    // On the story's own page, so Overview is the current one.
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Overview", null],
      ["Storyboard", "/stories/-15/storyboard"],
    ]);
    expect(items[0]).toHaveAttribute("aria-current", "page");
  });

  it("draws the title as whatever element the page asks for", () => {
    renderWithProviders(
      <StoryTitleMenu idStory={-15} title="Vampire" isStoryteller={false} as="span" size="lg" />,
    );

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("button", { name: "Vampire" })).toBeInTheDocument();
  });
});
