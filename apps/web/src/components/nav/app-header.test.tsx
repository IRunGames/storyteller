import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import { Toaster, toaster } from "@/components/ui/toaster";

const router = {
  push: mock.fn<(href: string) => void>(),
  refresh: mock.fn<() => void>(),
};

let pathname = "/stories";

const signOut = mock.fn<() => Promise<{ data: object; error: null }>>(
  async () => ({ data: {}, error: null }),
);

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
};

// The popover imports its server action itself, so the whole actions module
// is mocked rather than handed in as a prop.
type SubmitFeedback = import("@/components/feedback/actions").SubmitFeedbackResult;
const sa_submitFeedback = mock.fn<(values: unknown) => Promise<SubmitFeedback>>(
  async () => ({ ok: true }),
);

// Static imports are hoisted, so the module under test can only be loaded
// after the mocks are registered — hence the dynamic import in `before`.
let AppHeader: typeof import("./app-header").AppHeader;

// The header reads the signed-in user from UserProvider, as it would under
// (app)/layout.tsx, rather than from a prop.
function renderHeader(who: CurrentUser = user) {
  return renderWithProviders(
    <UserProvider user={who}>
      <AppHeader />
    </UserProvider>,
  );
}

describe("AppHeader", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: { useRouter: () => router, usePathname: () => pathname },
    });
    mock.module("@/lib/auth-client", { namedExports: { signOut } });
    mock.module("@/components/feedback/actions", { namedExports: { sa_submitFeedback } });

    ({ AppHeader } = await import("./app-header"));
  });

  beforeEach(() => {
    pathname = "/stories";
    router.push.mock.resetCalls();
    router.refresh.mock.resetCalls();
    signOut.mock.resetCalls();
    sa_submitFeedback.mock.resetCalls();
    sa_submitFeedback.mock.mockImplementation(async () => ({ ok: true }));
  });

  // The toaster is a module-level store, so a toast raised in one test would
  // still be there the next time a Toaster mounts. This runs before Testing
  // Library's cleanup, while a Toaster may still be mounted, hence act().
  afterEach(() => {
    act(() => toaster.remove());
  });

  it("links to the four sections and marks the current one", () => {
    renderHeader();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = Array.from(nav.querySelectorAll("a"));

    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Play", "/play"],
      ["Stories", "/stories"],
      ["Characters", "/characters"],
      ["Library", "/library"],
    ]);
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(links[0]).not.toHaveAttribute("aria-current");
  });

  it("opens Find a Story from the chevron beside Stories", async () => {
    const u = userEvent.setup();
    renderHeader();

    // The pill itself is still the link to /stories; only the chevron opens
    // the menu, so the sub-page costs one extra click and the page none.
    await u.click(screen.getByRole("button", { name: "More in Stories" }));

    const find = await screen.findByRole("menuitem", { name: "Find a Story" });
    expect(find).toHaveAttribute("href", "/stories/find");
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("points the chevron up while its menu is open and down again when it closes", async () => {
    const u = userEvent.setup();
    renderHeader();

    const chevron = screen.getByRole("button", { name: "More in Stories" });
    expect(chevron.querySelector(".lucide-chevron-down")).toBeInTheDocument();
    expect(chevron.querySelector(".lucide-chevron-up")).not.toBeInTheDocument();

    await u.click(chevron);
    const menu = await screen.findByRole("menu");
    expect(chevron.querySelector(".lucide-chevron-up")).toBeInTheDocument();
    expect(chevron.querySelector(".lucide-chevron-down")).not.toBeInTheDocument();

    // Zag moves focus into the menu and starts listening for Escape one
    // animation frame after opening. Press Escape inside that frame and
    // nothing hears it; a person cannot, but this test can, so wait for the
    // focus that arrives in the same frame.
    await waitFor(() => expect(menu).toHaveFocus());
    await u.keyboard("{Escape}");
    await waitFor(() =>
      expect(chevron.querySelector(".lucide-chevron-down")).toBeInTheDocument(),
    );
    expect(chevron.querySelector(".lucide-chevron-up")).not.toBeInTheDocument();
  });

  it("marks Stories and its Find a Story entry current on the find page", async () => {
    const u = userEvent.setup();
    pathname = "/stories/find";
    renderHeader();

    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute("aria-current", "page");

    await u.click(screen.getByRole("button", { name: "More in Stories" }));
    expect(await screen.findByRole("menuitem", { name: "Find a Story" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("lists Find a Story under Stories in the drawer", async () => {
    const u = userEvent.setup();
    renderHeader();

    await u.click(screen.getByRole("button", { name: "Open menu" }));

    const drawer = await screen.findByRole("dialog", { name: "Menu" });
    const links = Array.from(drawer.querySelectorAll("a"));
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Play", "/play"],
      ["Stories", "/stories"],
      ["Find a Story", "/stories/find"],
      ["Characters", "/characters"],
      ["Library", "/library"],
    ]);
  });

  it("highlights the brand mark on the home page it links to, and only there", () => {
    pathname = "/home";
    renderHeader();
    expect(screen.getByRole("link", { name: "Storyteller" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    cleanup();

    pathname = "/stories";
    renderHeader();
    expect(screen.getByRole("link", { name: "Storyteller" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("stays pinned to the top while the page scrolls under it", () => {
    renderHeader();

    const header = screen.getByRole("banner");
    expect(header).toHaveStyle({ position: "sticky", top: "0px" });
  });

  it("treats a nested path as part of its section", () => {
    pathname = "/characters/42";
    renderHeader();

    expect(screen.getByRole("link", { name: "Characters" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the notifications bell disabled", () => {
    renderHeader();

    expect(screen.getByRole("button", { name: "Notifications" })).toBeDisabled();
  });

  it("explains each icon in a tooltip on hover", async () => {
    const u = userEvent.setup();
    renderHeader();

    await u.hover(screen.getByRole("button", { name: "Give feedback" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("How's it going?");

    await u.hover(await screen.findByRole("button", { name: "Choose theme" }));
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Set your theme"));

    // The bell is disabled, so the hover lands on the span wrapped round it.
    await u.hover(screen.getByRole("button", { name: "Notifications" }).parentElement!);
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Coming soon"));
  });

  it("lets the user pick a theme", async () => {
    const u = userEvent.setup();
    renderHeader();

    await u.click(await screen.findByRole("button", { name: "Choose theme" }));

    const light = await screen.findByRole("menuitemradio", { name: "Light" });
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Light",
      "Dark",
      "Halloween",
      "Blackberry",
    ]);

    await u.click(light);

    await waitFor(() =>
      expect(document.documentElement).toHaveClass("light"),
    );
  });

  it("puts the chosen theme's class on <html> and takes the old one off", async () => {
    const u = userEvent.setup();
    renderHeader();

    await u.click(await screen.findByRole("button", { name: "Choose theme" }));
    await u.click(await screen.findByRole("menuitemradio", { name: "Halloween" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("halloween"));

    await u.click(await screen.findByRole("button", { name: "Choose theme" }));
    await u.click(await screen.findByRole("menuitemradio", { name: "Blackberry" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("blackberry"));
    // next-themes only clears classes it knows about, so a theme missing from
    // the provider's list would leave both on the element at once.
    expect(document.documentElement).not.toHaveClass("halloween");
  });

  it("shows the brand mark of the theme in force: sparkle, pumpkin or berry", async () => {
    const u = userEvent.setup();
    renderHeader();

    const brand = screen.getByRole("link", { name: "Storyteller" });
    const sparkle = brand.querySelector('[data-icon="sparkle"]')!;
    const pumpkin = brand.querySelector('[data-icon="pumpkin"]')!;
    const berry = brand.querySelector('[data-icon="berry"]')!;

    async function choose(label: string, className: string) {
      await u.click(await screen.findByRole("button", { name: "Choose theme" }));
      await u.click(await screen.findByRole("menuitemradio", { name: label }));
      await waitFor(() => expect(document.documentElement).toHaveClass(className));
    }

    await choose("Dark", "dark");
    expect(sparkle).toBeVisible();
    expect(pumpkin).not.toBeVisible();
    expect(berry).not.toBeVisible();

    await choose("Halloween", "halloween");
    expect(pumpkin).toBeVisible();
    expect(sparkle).not.toBeVisible();
    expect(berry).not.toBeVisible();

    await choose("Blackberry", "blackberry");
    expect(berry).toBeVisible();
    expect(sparkle).not.toBeVisible();
    expect(pumpkin).not.toBeVisible();
  });

  it("names the account button with the nickname, else the name, else the email", async () => {
    const u = userEvent.setup();
    const avatar = () => screen.getByRole("button", { name: "Account menu" });

    renderHeader({ ...user, nickName: "Gandalf" });
    await u.hover(avatar());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Gandalf");
    await u.unhover(avatar());
    cleanup();

    renderHeader({ ...user, nickName: null });
    await u.hover(avatar());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Paul Stafford");
    await u.unhover(avatar());
    cleanup();

    renderHeader({ ...user, nickName: "", name: "" });
    await u.hover(avatar());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("storyteller@irun.games");
  });

  it("keeps each menu anchored to its own button despite the tooltip", async () => {
    // Tooltip and menu both stamp an id on the shared button and look their
    // trigger up by it. If they disagree, the menu cannot find its anchor and
    // opens at the top-left corner of the page.
    const u = userEvent.setup();
    renderHeader();

    const theme = await screen.findByRole("button", { name: "Choose theme" });
    await u.click(theme);
    const themeMenu = await screen.findByRole("menu");
    expect(themeMenu).toHaveAttribute("aria-labelledby", theme.id);
    // Escape is only heard once Zag has focused the menu, a frame after it
    // opens; see the chevron test above.
    await waitFor(() => expect(themeMenu).toHaveFocus());
    await u.keyboard("{Escape}");

    const account = screen.getByRole("button", { name: "Account menu" });
    await u.click(account);
    await waitFor(() =>
      expect(screen.getByRole("menu")).toHaveAttribute("aria-labelledby", account.id),
    );
  });

  it("opens an account menu with Profile and Logout", async () => {
    const u = userEvent.setup();
    renderHeader();

    await u.click(screen.getByRole("button", { name: "Account menu" }));

    const profile = await screen.findByRole("menuitem", { name: "Profile" });
    expect(profile).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  it("logs out and returns to the landing page", async () => {
    const u = userEvent.setup();
    renderHeader();

    await u.click(screen.getByRole("button", { name: "Account menu" }));
    const logout = await screen.findByRole("menuitem", { name: "Logout" });

    // The menu only selects the highlighted item, and a single synthetic hover
    // does not reliably highlight it: on open, Zag schedules a frame that sets
    // its input modality to "virtual", which makes the item ignore pointer
    // moves, and only a move to a *new* position sets it back to "pointer".
    // A real pointer keeps moving, so keep nudging it until the highlight has
    // rendered, then click.
    let step = 0;
    await waitFor(async () => {
      step += 1;
      await u.pointer({ target: logout, coords: { clientX: step, clientY: step } });
      expect(logout).toHaveAttribute("data-highlighted");
    });
    await u.click(logout);

    await waitFor(() => expect(signOut.mock.callCount()).toBe(1));
    await waitFor(() => expect(router.push.mock.callCount()).toBe(1));
    expect(router.push.mock.calls[0].arguments[0]).toBe("/");
    expect(router.refresh.mock.callCount()).toBe(1);
  });

  describe("feedback popover", () => {
    // These render a Toaster too, as the root layout does, because the
    // success path confirms with a toast. Only here: the toast machine's
    // mount-time update would raise act() warnings in tests that never wait.
    async function openFeedback() {
      const u = userEvent.setup();
      renderWithProviders(
        <UserProvider user={user}>
          <AppHeader />
          <Toaster />
        </UserProvider>,
      );
      await u.click(screen.getByRole("button", { name: "Give feedback" }));
      const dialog = await screen.findByRole("dialog", { name: "How is this page working for you?" });
      return { u, dialog };
    }

    it("opens a form with thumbs up preselected, an optional text and a send button", async () => {
      const { dialog } = await openFeedback();

      const rating = within(dialog).getByRole("radiogroup", { name: "Rating" });
      expect(within(rating).getByRole("radio", { name: "Good" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(within(rating).getByRole("radio", { name: "Not good" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
      expect(within(dialog).getByRole("textbox", { name: /Feedback/ })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Send" })).toBeInTheDocument();
    });

    it("sends a thumbs up with no text when nothing is changed", async () => {
      const { u, dialog } = await openFeedback();

      await u.click(within(dialog).getByRole("button", { name: "Send" }));

      await waitFor(() => expect(sa_submitFeedback.mock.callCount()).toBe(1));
      expect(sa_submitFeedback.mock.calls[0].arguments[0]).toEqual({
        isPositive: true,
        feedback: "",
        pagePath: "/stories",
      });
    });

    it("sends the rating, the text and the current page, then closes and toasts thanks", async () => {
      pathname = "/characters/42";
      const { u, dialog } = await openFeedback();

      const notGood = within(dialog).getByRole("radio", { name: "Not good" });
      await u.click(notGood);
      expect(notGood).toHaveAttribute("aria-checked", "true");
      expect(within(dialog).getByRole("radio", { name: "Good" })).toHaveAttribute(
        "aria-checked",
        "false",
      );

      await u.type(within(dialog).getByRole("textbox", { name: /Feedback/ }), "Nice cards");
      await u.click(within(dialog).getByRole("button", { name: "Send" }));

      await waitFor(() => expect(sa_submitFeedback.mock.callCount()).toBe(1));
      expect(sa_submitFeedback.mock.calls[0].arguments[0]).toEqual({
        isPositive: false,
        feedback: "Nice cards",
        pagePath: "/characters/42",
      });
      // The popover closes straight away and the confirmation is a toast, so
      // the thanks must appear outside the dialog and the dialog must go. The
      // toast renders its title twice (once for the live region), so match all.
      const thanks = await screen.findAllByText("Thanks for your feedback.");
      expect(thanks.length).toBeGreaterThan(0);
      for (const el of thanks) expect(el.closest('[role="dialog"]')).toBeNull();
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "How is this page working for you?" }),
        ).not.toBeInTheDocument(),
      );
    });

    it("keeps the popover open when the action fails", async () => {
      sa_submitFeedback.mock.mockImplementation(async () => ({ ok: false, errors: {} }));
      const { u, dialog } = await openFeedback();

      await u.click(within(dialog).getByRole("button", { name: "Send" }));

      expect(
        await within(dialog).findByText("Could not send your feedback. Please try again."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Thanks for your feedback.")).not.toBeInTheDocument();
    });

    it("shows a field error the action sends back", async () => {
      sa_submitFeedback.mock.mockImplementation(async () => ({
        ok: false,
        errors: { feedback: "Too long" },
      }));
      const { u, dialog } = await openFeedback();

      await u.click(within(dialog).getByRole("radio", { name: "Not good" }));
      await u.click(within(dialog).getByRole("button", { name: "Send" }));

      expect(await within(dialog).findByText("Too long")).toBeInTheDocument();
    });
  });
});
