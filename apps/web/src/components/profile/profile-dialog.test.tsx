import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { LikedSystem, Profile } from "@/lib/profile";
import type { UserPreferenceMap } from "@/lib/user-preference-schemas";

const router = { push: mock.fn(), refresh: mock.fn() };

const user: CurrentUser = {
  id: "8f2b1c44-0000-4000-8000-000000000001",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
  idUserType: -1,
  isAnonymous: false,
};

const profile: Profile = {
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  nickName: "redaikidoka",
  bio: null,
  image: null,
  createdAt: new Date("2017-05-25T12:00:00Z"),
  systems: [{ idSystem: -1, label: "Dungeons & Dragons (5e)" }],
};

const blades: LikedSystem = { idSystem: -2, label: "Blades in the Dark" };

const sa_getProfile = mock.fn(async () => profile);
const sa_updateProfileDetails = mock.fn<
  (input: unknown) => Promise<{ ok: true } | { ok: false; errors: Record<string, string> }>
>(async () => ({ ok: true }));
const sa_searchSystems = mock.fn(async (_query: string) => [blades]);
const sa_addLikedSystem = mock.fn(async (_id: number) => ({
  ok: true as const,
  systems: [...profile.systems, blades],
}));
const sa_removeLikedSystem = mock.fn(async (_id: number) => ({ ok: true as const, systems: [] }));
const sa_listOwnedStories = mock.fn(async () => []);
const sa_listPlayingStories = mock.fn(async () => []);
const sa_setUserPreference = mock.fn<(input: unknown) => Promise<{ ok: true }>>(async () => ({
  ok: true,
}));
const loadsAsImage = mock.fn(async (_url: string) => false);

let ProfileDialog: typeof import("./profile-dialog").ProfileDialog;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

function renderDialog(preferences: UserPreferenceMap = {}) {
  const onClose = mock.fn();
  renderWithProviders(
    <UserProvider user={user}>
      <UserPreferencesProvider preferences={preferences}>
        <ProfileDialog open onClose={onClose} />
      </UserPreferencesProvider>
    </UserProvider>,
  );
  return { onClose };
}

async function openedDialog() {
  const dialog = await screen.findByRole("dialog", { name: "Profile" });
  await within(dialog).findByText("storyteller@irun.games");
  return dialog;
}

describe("ProfileDialog", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { useRouter: () => router, usePathname: () => "/stories" },
    });
    mock.module("./actions", {
      namedExports: {
        sa_getProfile,
        sa_updateProfileDetails,
        sa_searchSystems,
        sa_addLikedSystem,
        sa_removeLikedSystem,
        sa_listOwnedStories,
        sa_listPlayingStories,
      },
    });
    mock.module("@/components/preferences/actions", { namedExports: { sa_setUserPreference } });
    mock.module("./load-image", { namedExports: { loadsAsImage } });

    ({ ProfileDialog } = await import("./profile-dialog"));
    ({ UserPreferencesProvider } =
      await import("@/components/preferences/user-preferences-provider"));
  });

  beforeEach(() => {
    for (const fn of [
      router.refresh,
      sa_updateProfileDetails,
      sa_searchSystems,
      sa_addLikedSystem,
      sa_removeLikedSystem,
      sa_setUserPreference,
      loadsAsImage,
    ]) {
      fn.mock.resetCalls();
    }
  });

  afterEach(cleanup);

  it("shows the card and the three tabs", async () => {
    renderDialog();
    const dialog = await openedDialog();

    expect(within(dialog).getByText("Paul Stafford")).toBeInTheDocument();
    expect(within(dialog).getByText("redaikidoka")).toBeInTheDocument();
    expect(within(dialog).getByText("Thoughts?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Your vibe/)).toBeInTheDocument();
    expect(within(dialog).getByText("May 25, 2017")).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Systems", "My Stories", "Playing"]);
    expect(within(dialog).getByText("Dungeons & Dragons (5e)")).toBeInTheDocument();
  });

  it("saves a banner colour picked from the palette", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByRole("button", { name: "Change banner color" }));
    const palette = await screen.findByRole("radiogroup", { name: "Banner color" });
    expect(within(palette).getByRole("radio", { name: "Violet" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await u.click(within(palette).getByRole("radio", { name: "Green" }));

    expect(sa_setUserPreference.mock.calls[0].arguments[0]).toEqual({
      key: "profile.color",
      value: "#46A758",
    });
  });

  it("saves a thought from the bubble beside the picture", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByText("Thoughts?"));
    const input = within(dialog).getByRole("textbox", { name: "Thoughts" });
    await u.type(input, "Prepping a heist{Enter}");

    await waitFor(() =>
      expect(sa_setUserPreference.mock.calls[0]?.arguments[0]).toEqual({
        key: "profile.status",
        value: "Prepping a heist",
      }),
    );
  });

  it("saves a new name with the nickname and bio, and refreshes the page", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByText("Paul Stafford"));
    const input = within(dialog).getByRole("textbox", { name: "Name" });
    await u.clear(input);
    await u.type(input, "Pól{Enter}");

    await waitFor(() => expect(router.refresh.mock.callCount()).toBe(1));
    expect(sa_updateProfileDetails.mock.calls[0].arguments[0]).toEqual({
      name: "Pól",
      nickName: "redaikidoka",
      bio: "",
    });
  });

  it("puts the name back and says why when it is refused", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByText("Paul Stafford"));
    const input = within(dialog).getByRole("textbox", { name: "Name" });
    await u.clear(input);
    await u.keyboard("{Enter}");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Your name cannot be empty.",
    );
    expect(sa_updateProfileDetails.mock.callCount()).toBe(0);
    expect(within(dialog).getByText("Paul Stafford")).toBeInTheDocument();
  });

  it("adds a system found through the search", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByRole("button", { name: "Add System" }));
    await u.type(await screen.findByRole("searchbox", { name: "Search systems" }), "blades");
    await u.click(await screen.findByRole("button", { name: "Blades in the Dark" }));

    expect(sa_addLikedSystem.mock.calls[0].arguments[0]).toBe(-2);
    const list = within(dialog).getByRole("list", { name: "Systems I like" });
    expect(await within(list).findByText("Blades in the Dark")).toBeInTheDocument();
  });

  it("removes a liked system", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByRole("button", { name: "Remove Dungeons & Dragons (5e)" }));

    expect(sa_removeLikedSystem.mock.calls[0].arguments[0]).toBe(-1);
    expect(await within(dialog).findByText("No systems yet.")).toBeInTheDocument();
  });

  it("offers a drop zone for a picture, as the other image fields do", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByRole("button", { name: "Change profile picture" }));

    expect(await screen.findByText("Drag a picture here or click to browse")).toBeInTheDocument();
  });

  it("refuses a dropped picture larger than 2 MB", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByRole("button", { name: "Change profile picture" }));
    await screen.findByText("Drag a picture here or click to browse");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    await u.upload(input, big);

    expect(await screen.findByRole("alert")).toHaveTextContent("That picture is larger than 2 MB.");
    expect(sa_setUserPreference.mock.callCount()).toBe(0);
  });

  it("refuses a linked picture that does not open as one", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByRole("button", { name: "Change profile picture" }));
    await u.type(await screen.findByLabelText("Or link one"), "https://example.com/not-a-picture");
    await u.click(screen.getByRole("button", { name: "Use link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That link does not open as a picture.",
    );
    expect(sa_setUserPreference.mock.callCount()).toBe(0);
  });

  it("saves a linked picture that opens", async () => {
    loadsAsImage.mock.mockImplementationOnce(async () => true);
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByRole("button", { name: "Change profile picture" }));
    await u.type(await screen.findByLabelText("Or link one"), "https://example.com/me.png");
    await u.click(screen.getByRole("button", { name: "Use link" }));

    await waitFor(() =>
      expect(sa_setUserPreference.mock.calls[0]?.arguments[0]).toEqual({
        key: "profile.avatarUrl",
        value: "https://example.com/me.png",
      }),
    );
  });

  it("lists the stories the user tells under My Stories", async () => {
    const u = userEvent.setup();
    renderDialog();
    const dialog = await openedDialog();

    await u.click(within(dialog).getByRole("tab", { name: "My Stories" }));

    expect(
      await within(dialog).findByText("You are not telling any stories yet."),
    ).toBeInTheDocument();
    expect(sa_listOwnedStories.mock.callCount()).toBeGreaterThan(0);
  });
});
