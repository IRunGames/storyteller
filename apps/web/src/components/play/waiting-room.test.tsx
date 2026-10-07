import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { UserProvider } from "@/components/auth/user-provider";
import type { CurrentUser } from "@/lib/current-user";
import type { WaitingRoomState } from "@/lib/play";
import type { StorySession } from "@/lib/stories";

const user: CurrentUser = {
  id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
  name: "Paul Stafford",
  email: "storyteller@irun.games",
  image: null,
  nickName: null,
};

const initial: WaitingRoomState = {
  waitingSince: new Date(Date.now() - 65_000),
  waitingCount: 3,
  hasOpenSession: false,
  isUnplayable: false,
};

const sessions: StorySession[] = [
  {
    idStorySession: 11,
    number: 2,
    title: "The Drowned Gate",
    status: "DONE",
    startedAt: new Date("2026-09-01T19:00:00Z"),
    length: 180,
  },
];

const sa_waitForSession = mock.fn<(idStory: number) => Promise<WaitingRoomState | null>>(
  async () => initial,
);
const sa_leaveWaitingRoom = mock.fn(async () => {});
const replace = mock.fn();
const push = mock.fn();

let WaitingRoom: typeof import("./waiting-room").WaitingRoom;
type PreferencesModule = typeof import("@/components/preferences/user-preferences-provider");
let UserPreferencesProvider: PreferencesModule["UserPreferencesProvider"];

describe("WaitingRoom", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push, replace, refresh: mock.fn() }),
        usePathname: () => "/play/7/waiting",
      },
    });
    mock.module("@/lib/auth-client", { namedExports: { signOut: mock.fn() } });
    mock.module("@/components/feedback/actions", {
      namedExports: { sa_submitFeedback: mock.fn() },
    });
    mock.module("@/components/preferences/actions", {
      namedExports: { sa_setUserPreference: mock.fn() },
    });
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_listStorySessions: mock.fn(async () => []), sa_getStorySession: mock.fn() },
    });
    // The session rows' info popovers import the status actions, which would
    // otherwise load the real auth and database modules.
    mock.module("@/components/status/actions", {
      namedExports: { sa_listStatusOptions: mock.fn(async () => []), sa_setRowStatus: mock.fn() },
    });
    mock.module("@/app/(app)/play/[id]/actions", {
      namedExports: { sa_waitForSession, sa_leaveWaitingRoom },
    });

    ({ WaitingRoom } = await import("./waiting-room"));
    ({ UserPreferencesProvider } = await import(
      "@/components/preferences/user-preferences-provider"
    ));
  });

  beforeEach(() => {
    sa_waitForSession.mock.resetCalls();
    sa_waitForSession.mock.mockImplementation(async () => initial);
    sa_leaveWaitingRoom.mock.resetCalls();
    replace.mock.resetCalls();
    push.mock.resetCalls();
  });

  function render() {
    return renderWithProviders(
      <UserProvider user={user}>
        <UserPreferencesProvider preferences={{}}>
          <WaitingRoom
            story={{ idStory: 7, title: "Kildealg" }}
            initial={initial}
            sessions={sessions}
            background="/images/f_waiting.webp"
          />
        </UserPreferencesProvider>
      </UserProvider>,
    );
  }

  it("shows the story, who is waiting and for how long", async () => {
    render();

    expect(screen.getByRole("heading", { name: "Kildealg", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("3 people waiting")).toBeInTheDocument();
    expect(await screen.findByText(/^Waiting 1:0\d$/)).toBeInTheDocument();
  });

  it("paints the picture the page picked behind the room", () => {
    const { container } = render();
    const painted = [...container.querySelectorAll<HTMLElement>("[aria-hidden]")].find((el) =>
      el.style.backgroundImage.includes("_waiting.webp"),
    );
    expect(painted?.style.backgroundImage).toBe('url("/images/f_waiting.webp")');
  });

  it("lists the sessions so far to look through", () => {
    render();

    const section = screen.getByRole("region", { name: "Sessions so far" });
    expect(section).toHaveTextContent("2. The Drowned Gate");
  });

  it("keeps its place with a heartbeat and leaves on unmount", async () => {
    const { unmount } = render();
    await waitFor(() => expect(sa_waitForSession.mock.callCount()).toBeGreaterThan(0));
    expect(sa_waitForSession.mock.calls[0].arguments).toEqual([7]);

    unmount();
    expect(sa_leaveWaitingRoom.mock.calls[0].arguments).toEqual([7]);
  });

  it("goes to the table once a session opens", async () => {
    sa_waitForSession.mock.mockImplementation(async () => ({ ...initial, hasOpenSession: true }));
    render();

    await waitFor(() => expect(replace.mock.callCount()).toBe(1));
    expect(replace.mock.calls[0].arguments).toEqual(["/play/7"]);
  });

  it("follows the count as the heartbeat brings it back", async () => {
    sa_waitForSession.mock.mockImplementation(async () => ({ ...initial, waitingCount: 1 }));
    render();

    expect(await screen.findByText("1 person waiting")).toBeInTheDocument();
  });

  it("gives up without asking: deletes the waiting row, then goes home", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Give up" }));

    await waitFor(() => expect(push.mock.callCount()).toBe(1));
    expect(push.mock.calls[0].arguments).toEqual(["/home"]);
    expect(sa_leaveWaitingRoom.mock.calls[0].arguments).toEqual([7]);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks before a link leaves the room, and stays on Keep waiting", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("link", { name: "Storyteller" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Stop waiting?" });
    expect(within(dialog).getByText(/waiting room for Kildealg/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep waiting" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(push.mock.callCount()).toBe(0);
    expect(sa_leaveWaitingRoom.mock.callCount()).toBe(0);
  });

  it("deletes the waiting row before following the link on Leave", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("link", { name: "Storyteller" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(push.mock.callCount()).toBe(1));
    expect(push.mock.calls[0].arguments).toEqual(["/home"]);
    expect(sa_leaveWaitingRoom.mock.calls[0].arguments).toEqual([7]);
  });

  it("asks the browser to prompt before the tab is closed or reloaded", () => {
    render();
    const event = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves the row for the table to attach when a session opens", async () => {
    sa_waitForSession.mock.mockImplementation(async () => ({ ...initial, hasOpenSession: true }));
    const { unmount } = render();
    await waitFor(() => expect(replace.mock.callCount()).toBe(1));

    unmount();
    expect(sa_leaveWaitingRoom.mock.callCount()).toBe(0);
    // Nor does the guard hold up the way to the table.
    const event = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
