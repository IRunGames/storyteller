import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { StoryElement } from "@/lib/elements";
import { EMPTY_PLAY_SPACE, type PlayItem, type RunPlaySpace } from "@/lib/run";
import type { StatusOption } from "@/lib/status";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
};

const people: StoryElement[] = [
  { idElement: 5, status: "ACTIVE", name: "Dafydd", title: "Shell seller", description: null },
];

const scene = { idStoryScene: -15, title: "Strangers in the morning", status: "ACTIVE" };

const sa_linkSceneElement = mock.fn(
  async (_story: number, _scene: number, idElement: number, _hidden?: boolean) => ({
    ok: true as const,
    item: {
      key: `PERSON:${idElement}`,
      kind: "PERSON" as const,
      label: "Dafydd",
      detail: "Shell seller",
      imageUrl: null,
      sceneTags: [],
    },
  }),
);
const sa_createSceneElement = mock.fn(
  async (_story: number, _scene: number, tag: string | null, input: unknown) => ({
    ok: true as const,
    item: {
      key: "PLACE:40",
      kind: "PLACE" as const,
      label: (input as { name: string }).name,
      detail: null,
      imageUrl: null,
      sceneTags: tag === null ? [] : [tag],
    },
  }),
);

// The two workflows the element form offers.
const statusOptions = (keys: string[]): StatusOption[] =>
  keys.map((key) => ({
    key,
    label: key.charAt(0) + key.slice(1).toLowerCase(),
    description: null,
    from: null,
  }));
const sa_listStatusOptions = mock.fn(async (table: string) =>
  table === "scene_elements"
    ? statusOptions(["INITIAL", "INVISIBLE", "READY", "DISABLED"])
    : statusOptions(["PENDING", "READY", "INACTIVE"]),
);

// For the info popover's edit: Dafydd, a person, edited into a place.
const sa_getSceneElementDetail = mock.fn(async () => ({
  element: {
    idElement: 5,
    kind: "PERSON",
    name: "Dafydd",
    initialName: null,
    title: "Shell seller",
    description: null,
    notes: null,
    status: "READY",
    tags: [],
  },
  link: { idSceneElement: 9, status: "INITIAL", tags: ["scene"], createdAt: null },
}));
const sa_updateSceneElement = mock.fn(async () => ({
  ok: true as const,
  item: {
    key: "PLACE:5",
    kind: "PLACE" as const,
    label: "Dafydd's stall",
    detail: null,
    imageUrl: null,
    sceneTags: ["scene"],
    sceneStatus: "INITIAL",
  },
}));

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

let RunTable: typeof import("./run-table").RunTable;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

function renderTable(
  preferences: Record<string, boolean> = {},
  session: string | null = "3. Kildealg",
  initialSpace: RunPlaySpace = EMPTY_PLAY_SPACE,
) {
  return renderWithProviders(
    <UserProvider user={user}>
      <UserPreferencesProvider preferences={preferences}>
        <RunTable
          idStory={-4}
          title="Psychoneira"
          session={session}
          initialSpace={initialSpace}
          sceneStatusOptions={[]}
        />
        <Toaster />
      </UserPreferencesProvider>
    </UserProvider>,
  );
}

describe("RunTable", () => {
  before(async () => {
    Element.prototype.scrollIntoView = () => {};
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push: mock.fn(), refresh: mock.fn() }),
        usePathname: () => "/run/-4",
      },
    });
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    mock.module("@/components/feedback/actions", {
      namedExports: { sa_submitFeedback: mock.fn() },
    });
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference },
    });
    mock.module("@/components/uploads/actions", {
      namedExports: {
        sa_listAttachments: async () => [],
        sa_searchAttachments: async () => [],
        sa_moveStoryAttachmentToSceneCover: mock.fn(),
        sa_moveStoryAttachmentsToScene: mock.fn(),
        sa_moveSceneAttachmentsToStory: mock.fn(),
      },
    });
    mock.module("@/app/(app)/run/[id]/actions", {
      namedExports: {
        sa_listRunScenes: async () => [],
        sa_loadRunScene: mock.fn(),
        sa_createRunScene: mock.fn(),
        sa_linkSceneElement,
        sa_createSceneElement,
        sa_setSceneElementShown: mock.fn(),
        sa_getSceneElementDetail,
        sa_updateSceneElement,
        sa_moveSceneElement: mock.fn(),
      },
    });
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions, sa_setRowStatus: mock.fn() },
    });
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: {
        sa_listStoryElements: async (_id: number, kind: string) =>
          kind === "PERSON" ? people : [],
      },
    });

    ({ RunTable } = await import("./run-table"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    sa_setUserPreference.mock.resetCalls();
    sa_linkSceneElement.mock.resetCalls();
    sa_createSceneElement.mock.resetCalls();
  });

  afterEach(() => {
    toaster.remove();
  });

  it("names the story and the session in the header", () => {
    renderTable();
    const header = screen.getByRole("banner");

    expect(within(header).getByText("Psychoneira")).toBeInTheDocument();
    expect(within(header).getByText("3. Kildealg")).toBeInTheDocument();
  });

  it("opens with the library beside the play space, and the chat and character closed", () => {
    renderTable();

    expect(screen.getByRole("region", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Play space" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Table Chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Character" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("button", { name: "Library" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("closes the library from the header, and remembers it", async () => {
    const u = userEvent.setup();
    renderTable();

    await u.click(within(screen.getByRole("banner")).getByRole("button", { name: "Library" }));

    expect(screen.queryByRole("region", { name: "Library" })).not.toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.showLibrary",
      value: false,
    });
  });

  it("keeps its panels apart from a player's table", async () => {
    const u = userEvent.setup();
    renderTable();

    await u.click(within(screen.getByRole("banner")).getByRole("button", { name: "Chat" }));

    expect(screen.getByRole("region", { name: "Table Chat" })).toBeInTheDocument();
    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.showChat",
      value: true,
    });
  });

  it("with no scene, keeps a library item in a Default stack, once, and takes it out again", async () => {
    const u = userEvent.setup();
    renderTable();
    const space = screen.getByRole("region", { name: "Play space" });
    const stack = within(space).getByRole("region", { name: "Default" });
    expect(within(stack).getByText("Nothing here yet.")).toBeInTheDocument();
    expect(within(space).getByRole("heading", { name: "Play space" })).not.toHaveStyle({
      position: "absolute",
    });
    // No scene to make an element in.
    expect(within(stack).queryByRole("button", { name: /^New element/ })).not.toBeInTheDocument();

    await u.click(screen.getByRole("tab", { name: "People" }));
    const add = await screen.findByRole("button", { name: "Add Dafydd to the play space" });
    await u.click(add);
    await u.click(add);

    const items = within(stack).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Dafydd");
    expect(items[0]).toHaveTextContent("Shell seller");
    // Only the page holds it, with no scene to link it to.
    expect(sa_linkSceneElement.mock.callCount()).toBe(0);

    await u.click(within(space).getByRole("button", { name: "Remove Dafydd from the play space" }));
    expect(within(space).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("stacks the scene's elements by its tags, the untagged in the first", () => {
    const inPlay: PlayItem[] = [
      {
        key: "PERSON:5",
        kind: "PERSON",
        label: "Dafydd",
        detail: "Shell seller",
        imageUrl: null,
        sceneTags: ["scene"],
      },
      {
        key: "PLACE:6",
        kind: "PLACE",
        label: "Abbey",
        detail: null,
        imageUrl: null,
        sceneTags: [],
      },
    ];
    renderTable({}, "3. Kildealg", { scene, tags: ["elements", "scene"], coverUrl: null, inPlay });
    expect(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Scene: Strangers in the morning",
      }),
    ).toBeInTheDocument();
    const space = screen.getByRole("region", { name: "Play space" });
    // The scene is what the space is about, so its heading stands aside for
    // the eye and stays for a screen reader.
    expect(within(space).getByRole("heading", { name: "Play space" })).toHaveStyle({
      position: "absolute",
    });

    const elements = within(space).getByRole("region", { name: "elements" });
    const sceneStack = within(space).getByRole("region", { name: "scene" });
    expect(
      within(elements)
        .getAllByRole("listitem")
        .map((i) => i.textContent),
    ).toEqual(["Abbey"]);
    expect(
      within(sceneStack)
        .getAllByRole("listitem")
        .map((i) => i.textContent),
    ).toEqual(["DafyddShell seller"]);
    expect(screen.queryByTestId("play-space-cover")).not.toBeInTheDocument();
  });

  it("shows one Default stack for a scene with no tags", () => {
    renderTable({}, "3. Kildealg", { scene, tags: [], coverUrl: null, inPlay: [] });
    const space = screen.getByRole("region", { name: "Play space" });

    const stack = within(space).getByRole("region", { name: "Default" });
    expect(
      within(stack).getByRole("button", { name: "New element in Default" }),
    ).toBeInTheDocument();
  });

  it("links a library element to the scene, into the first stack", async () => {
    const u = userEvent.setup();
    renderTable({}, "3. Kildealg", {
      scene,
      tags: ["elements", "scene"],
      coverUrl: null,
      inPlay: [],
    });

    await u.click(screen.getByRole("tab", { name: "People" }));
    await u.click(await screen.findByRole("button", { name: "Add Dafydd to the play space" }));

    const elements = screen.getByRole("region", { name: "elements" });
    expect(await within(elements).findByText("Dafydd")).toBeInTheDocument();
    expect(sa_linkSceneElement.mock.calls[0].arguments).toEqual([-4, -15, 5, false]);
  });

  it("makes a new element from a stack's +, filed under its tag", async () => {
    const u = userEvent.setup();
    renderTable({}, "3. Kildealg", {
      scene,
      tags: ["elements", "scene"],
      coverUrl: null,
      inPlay: [],
    });
    const sceneStack = screen.getByRole("region", { name: "scene" });

    await u.click(within(sceneStack).getByRole("button", { name: "New element in scene" }));
    const popover = await screen.findByRole("dialog", { name: "New element in scene" });
    await u.selectOptions(within(popover).getByRole("combobox", { name: "Kind" }), "PLACE");
    // The scene element's status leads the form, at the workflow's first.
    expect(
      await within(popover).findByRole("button", { name: "In this scene: Initial" }),
    ).toBeInTheDocument();
    await u.type(within(popover).getByRole("textbox", { name: /^Name/ }), "The tide pool");
    await u.type(within(popover).getByRole("textbox", { name: /^Notes/ }), "Cold.");
    await u.selectOptions(within(popover).getByRole("combobox", { name: "Status" }), "READY");
    await u.click(within(popover).getByRole("button", { name: "Add element" }));

    expect(await within(sceneStack).findByText("The tide pool")).toBeInTheDocument();
    expect(sa_createSceneElement.mock.calls[0].arguments).toEqual([
      -4,
      -15,
      "scene",
      {
        kind: "PLACE",
        name: "The tide pool",
        initialName: "",
        title: "",
        description: "",
        notes: "Cold.",
        status: "READY",
        sceneStatus: "INITIAL",
      },
    ]);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New element in scene" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("adds as invisible with the library's switch, from the arrow and the +", async () => {
    const u = userEvent.setup();
    renderTable({ "run.addInvisible": true }, "3. Kildealg", {
      scene,
      tags: ["scene"],
      coverUrl: null,
      inPlay: [],
    });
    const library = screen.getByRole("region", { name: "Library" });
    expect(within(library).getByRole("switch", { name: "Add as invisible" })).toBeChecked();

    await u.click(screen.getByRole("tab", { name: "People" }));
    await u.click(await screen.findByRole("button", { name: "Add Dafydd to the play space" }));
    expect(sa_linkSceneElement.mock.calls[0].arguments).toEqual([-4, -15, 5, true]);

    const sceneStack = screen.getByRole("region", { name: "scene" });
    await u.click(within(sceneStack).getByRole("button", { name: "New element in scene" }));
    const popover = await screen.findByRole("dialog", { name: "New element in scene" });
    expect(
      await within(popover).findByRole("button", { name: "In this scene: Invisible" }),
    ).toBeInTheDocument();
  });

  it("remembers the Add as invisible switch", async () => {
    const u = userEvent.setup();
    renderTable();

    await u.click(screen.getByRole("switch", { name: "Add as invisible" }));

    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "run.addInvisible",
      value: true,
    });
  });

  it("keeps one pill for an element whose kind is changed from its popover", async () => {
    const u = userEvent.setup();
    renderTable({}, "3. Kildealg", {
      scene,
      tags: ["scene"],
      coverUrl: null,
      inPlay: [
        {
          key: "PERSON:5",
          kind: "PERSON",
          label: "Dafydd",
          detail: "Shell seller",
          imageUrl: null,
          sceneTags: ["scene"],
          sceneStatus: "INITIAL",
        },
      ],
    });
    const sceneStack = screen.getByRole("region", { name: "scene" });

    await u.click(within(sceneStack).getByRole("button", { name: "About Dafydd" }));
    const popover = await screen.findByRole("dialog", { name: "Dafydd" });
    await u.click(await within(popover).findByRole("button", { name: "Edit Dafydd" }));
    await u.selectOptions(await within(popover).findByRole("combobox", { name: "Kind" }), "PLACE");
    await u.click(within(popover).getByRole("button", { name: "Save element" }));

    expect(await within(sceneStack).findByText("Dafydd's stall")).toBeInTheDocument();
    expect(within(sceneStack).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows the scene's cover behind the play space", () => {
    renderTable({}, "3. Kildealg", {
      scene,
      tags: ["scene"],
      coverUrl: "https://x.test/docks.png",
      inPlay: [],
    });

    expect(screen.getByTestId("play-space-cover")).toHaveStyle({
      backgroundImage: 'url("https://x.test/docks.png")',
    });
  });

  it("tells the storyteller when no session is being played", async () => {
    renderTable({}, null);

    const header = screen.getByRole("banner");
    expect(within(header).getByTitle("No active session")).toHaveTextContent("None");
    // With no session there is no table to put a scene on.
    expect(within(header).getByRole("button", { name: "Scene: None" })).toBeDisabled();
    expect(await screen.findByText("There is no active session.")).toBeInTheDocument();
  });
});
