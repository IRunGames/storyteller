import { afterEach, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { PlayScene } from "@/lib/play-scene";

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

let ScenePreview: typeof import("./scene-preview").ScenePreview;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

describe("ScenePreview", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push: mock.fn(), refresh: mock.fn() }),
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
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: {
        sa_getStoryChannel: mock.fn(),
        sa_getPlayScene: mock.fn(),
        sa_setPlaySceneText: mock.fn(),
        sa_setPlayElementNotes: mock.fn(),
        sa_untapPlaySceneElement: mock.fn(),
      },
    });
    ({ ScenePreview } = await import("./scene-preview"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  function render() {
    return renderWithProviders(
      <UserProvider user={user}>
        <UserPreferencesProvider preferences={{}}>
          <ScenePreview idStory={7} title="Psychoneira" scene={scene} />
        </UserPreferencesProvider>
      </UserProvider>,
    );
  }

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
    await u.keyboard("{Escape}");

    // The scene's own text the same way.
    await u.click(within(space).getByRole("button", { name: "Describe The docks" }));
    const text = await screen.findByRole("dialog", { name: "The docks" });
    expect(within(text).getByText("Fog on the water.")).toBeInTheDocument();
    expect(within(text).getByText("Bring the lantern.")).toBeInTheDocument();
    expect(within(text).queryByRole("textbox")).toBeNull();
    expect(within(text).queryByRole("button", { name: "Save" })).toBeNull();
  });
});
