import { afterEach, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Zag only selects the highlighted item, and opens with its input modality
// "virtual", so a lone synthetic hover is ignored: the nudge loop
// status-pill.test.tsx uses, moving the pointer until the highlight shows.
async function choose(user: ReturnType<typeof userEvent.setup>, item: HTMLElement) {
  let step = 0;
  await waitFor(async () => {
    step += 1;
    await user.pointer({ target: item, coords: { clientX: step, clientY: step } });
    expect(item).toHaveAttribute("data-highlighted");
  });
  await user.click(item);
}

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { PlayScene } from "@/lib/play-scene";
import type { SceneNeighbour } from "@/app/(app)/preview/scene/[id]/actions";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -1,
};

const zed = {
  element: {
    idElement: 5,
    idStory: 7,
    kind: "PERSON",
    status: "READY",
    initialName: "A hooded figure",
    name: "Zed",
    title: "Harbourmaster",
    description: "Keeps the docks.",
    notes: "Owes us a favour.",
    imageUrl: null,
    url: null,
    urlText: null,
    tags: [],
    pendingAt: null,
    readyAt: null,
    inactiveAt: null,
    createdAt: "2026-10-13T10:00:00.000Z",
    updatedAt: "2026-10-13T10:00:00.000Z",
  },
  sceneElement: {
    idSceneElement: 11,
    idStoryScene: 3,
    idElement: 5,
    status: "TAPPED",
    tags: ["scene"],
    elementShowing: "initial_name",
    showInfo: true,
    url: null,
    urlText: null,
    readyAt: null,
    invisibleAt: null,
    tappedAt: null,
    disabledAt: null,
    createdAt: "2026-10-13T10:00:00.000Z",
    updatedAt: "2026-10-13T10:00:00.000Z",
  },
};

const scene: PlayScene = {
  idStorySession: null,
  scene: {
    idStoryScene: 3,
    title: "The docks",
    status: "ACTIVE",
    text: { description: "Fog on the water.", notes: "Bring the lantern." },
  },
  tags: ["scene", "elements"],
  coverUrl: null,
  items: [zed],
};

const sa_setUserPreference = mock.fn(async (_input: { key: string; value: unknown }) => ({
  ok: true as const,
}));

const push = mock.fn((_href: string) => {});

let ScenePreview: typeof import("./scene-preview").ScenePreview;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

describe("ScenePreview", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push, refresh: mock.fn() }),
        usePathname: () => "/preview/scene/3",
      },
    });
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    mock.module("@/components/feedback/actions", {
      namedExports: { sa_submitFeedback: mock.fn() },
    });
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference },
    });
    // The preview reaches for no action of the players' table; the module is
    // mocked empty so a stray import would fail loudly.
    mock.module("@/components/elements/actions", {
      namedExports: { sa_listElementHistory: mock.fn(async () => ({ rows: [], hasMore: false })) },
    });
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: {
        sa_getStoryChannel: mock.fn(),
        sa_getPlayScene: mock.fn(),
        sa_setPlaySceneText: mock.fn(),
        sa_setPlayElementNotes: mock.fn(),
        sa_untapPlaySceneElement: mock.fn(),
        sa_listChats: mock.fn(),
        sa_postChat: mock.fn(),
        sa_editChat: mock.fn(),
      },
    });
    ({ ScenePreview } = await import("./scene-preview"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // As the action lists them: by sitting, newest first, the unplayed last.
  const scenes = [
    { idStoryScene: 3, title: "The docks", status: "ACTIVE", sessionHeading: "2. Kildealg" },
    { idStoryScene: 2, title: "The abbey", status: "COMPLETE", sessionHeading: "1. The landing" },
    { idStoryScene: 4, title: "The crossing", status: "PENDING", sessionHeading: null },
  ];
  const statusOptions = [
    { key: "PENDING", label: "Pending", description: null, from: null },
    { key: "ACTIVE", label: "Active", description: null, from: null },
    { key: "COMPLETE", label: "Complete", description: null, from: null },
  ];

  function render(
    neighbours: { previous: SceneNeighbour | null; next: SceneNeighbour | null } = {
      previous: { idStoryScene: 2, title: "The abbey", status: "COMPLETE", sessionHeading: null },
      next: null,
    },
    canEdit = false,
  ) {
    return renderWithProviders(
      <UserProvider user={user}>
        <UserPreferencesProvider preferences={{}}>
          <ScenePreview
            idStory={7}
            title="Psychoneira"
            scene={scene}
            previous={neighbours.previous}
            next={neighbours.next}
            scenes={scenes}
            statusOptions={statusOptions}
            canEdit={canEdit}
          />
        </UserPreferencesProvider>
      </UserProvider>,
    );
  }

  it("lists the story's scenes from the title, the one shown marked, and moves to the one chosen", async () => {
    const u = userEvent.setup();
    push.mock.resetCalls();
    render();
    const space = screen.getByRole("region", { name: "Play space" });

    // Still the heading, and a button to press.
    expect(within(space).getByRole("heading", { name: "The docks" })).toBeInTheDocument();
    await u.click(within(space).getByRole("button", { name: "The docks" }));
    const items = await screen.findAllByRole("menuitemradio");
    // Each with its sitting under it and its status at the right; one not
    // played yet says so.
    expect(items.map((item) => item.textContent)).toEqual([
      "The docks2. KildealgActive",
      "The abbey1. The landingComplete",
      "The crossingNot played yetPending",
    ]);
    expect(items[0]).toHaveAttribute("aria-checked", "true");

    await choose(u, items[2]);
    await waitFor(() => expect(push.mock.calls[0]?.arguments).toEqual(["/preview/scene/4"]));
  });

  it("gives the story's owner a pencil beside the title that opens the scene's edit form, coming back here", async () => {
    const u = userEvent.setup();
    const { unmount } = render(undefined, true);
    const space = screen.getByRole("region", { name: "Play space" });

    const pencil = within(space).getByRole("link", { name: "Edit scene" });
    expect(pencil).toHaveAttribute("href", "/scenes/3/edit?from=%2Fpreview%2Fscene%2F3");
    await u.hover(pencil);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Edit scene");
    unmount();

    // A player gets none.
    render();
    expect(screen.queryByRole("link", { name: "Edit scene" })).toBeNull();
  });

  it("steps to the scenes before and after from chevrons round the title, named in their tooltips", async () => {
    const u = userEvent.setup();
    const { unmount } = render();
    const space = screen.getByRole("region", { name: "Play space" });

    const previous = within(space).getByRole("link", { name: "Previous scene: The abbey" });
    expect(previous).toHaveAttribute("href", "/preview/scene/2");
    await u.hover(previous);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("The abbey");
    // Nothing after: the chevron is there but shut, and says so.
    const next = within(space).getByRole("button", { name: "No later scene" });
    expect(next).toBeDisabled();
    unmount();

    render({
      previous: null,
      next: { idStoryScene: 4, title: "The crossing", status: "PENDING", sessionHeading: null },
    });
    expect(screen.getByRole("button", { name: "No earlier scene" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Next scene: The crossing" })).toHaveAttribute(
      "href",
      "/preview/scene/4",
    );
  });

  it("shows the scene as the players see it, with nothing to press", async () => {
    const u = userEvent.setup();
    render();

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Psychoneira")).toBeInTheDocument();
    expect(within(header).getByText("Preview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chat" })).toBeNull();

    const space = screen.getByRole("region", { name: "Play space" });
    expect(within(space).getByRole("heading", { name: "The docks" })).toBeInTheDocument();
    expect(screen.queryByText("No session is being played.")).toBeNull();
    const stack = within(space).getByRole("region", { name: "scene" });
    const pill = within(stack).getByText("A hooded figure").closest("[data-scene-status]")!;
    expect(pill).toHaveAttribute("data-scene-status", "TAPPED");
    // Tapped with its info showing would be an untap button at the table;
    // here it is the marker alone.
    expect(within(pill as HTMLElement).getByRole("img", { name: "Tapped" })).toBeInTheDocument();
    expect(within(pill as HTMLElement).queryByRole("button", { name: /untap/ })).toBeNull();

    // The info popover reads the description and the notes; it writes nothing.
    await u.click(
      within(pill as HTMLElement).getByRole("button", { name: "About A hooded figure" }),
    );
    const info = await screen.findByRole("dialog", { name: "A hooded figure" });
    expect(within(info).getByText("Keeps the docks.")).toBeInTheDocument();
    expect(within(info).getByText("Owes us a favour.")).toBeInTheDocument();
    expect(within(info).queryByRole("textbox")).toBeNull();
    // The element's history, closed, at the bottom of the popover.
    expect(within(info).getByRole("button", { name: "History" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // Closed from its own button rather than Escape, for the reason the
    // players' table test gives; gone before the next press.
    await u.click(
      within(pill as HTMLElement).getByRole("button", { name: "About A hooded figure" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "A hooded figure" })).not.toBeInTheDocument(),
    );

    // The scene's own text the same way.
    await u.click(within(space).getByRole("button", { name: "Describe The docks" }));
    const text = await screen.findByRole("dialog", { name: "The docks" });
    expect(await within(text).findByText("Fog on the water.")).toBeInTheDocument();
    expect(within(text).getByText("Bring the lantern.")).toBeInTheDocument();
    expect(within(text).queryByRole("textbox")).toBeNull();
    expect(within(text).queryByRole("button", { name: "Save" })).toBeNull();
  });
});
