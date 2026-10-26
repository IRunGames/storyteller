import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import { SESSIONS_PAGE_SIZE, type SessionForEdit, type StorySession } from "@/lib/stories";

function sessions(count: number, from = 1): StorySession[] {
  return Array.from({ length: count }, (_, i) => ({
    idStorySession: from + i,
    number: from + i,
    title: `Session ${from + i} title`,
    status: "DONE",
    startedAt: new Date(`2026-03-${String(20 - i).padStart(2, "0")}T19:00:00Z`),
    length: 90 + i * 30,
    playerCount: 3,
  }));
}

// The component imports its server action itself, so the module is mocked
// before the dynamic import below loads it.
const sa_listStorySessions = mock.fn<
  (idStory: number, offset: number, limit?: number) => Promise<StorySession[]>
>(async () => []);

// The storyteller's controls: the edit panel's read and save, the bin, and
// moving a scene in or out of the session.
const forEdit = (idStorySession: number): SessionForEdit => ({
  idStorySession,
  idStory: 7,
  status: "OPEN",
  values: { title: "Kildealg", summary: "", notes: "", lingeringQuestions: "" },
  scenes: [
    { idStoryScene: 40, title: "The docks", status: "ACTIVE", idStorySession },
    { idStoryScene: 41, title: "The vault", status: "COMPLETE", idStorySession },
    { idStoryScene: 42, title: "The abbey", status: "PENDING", idStorySession: null },
  ],
});
const sa_getSessionForEdit = mock.fn(async (id: number) => forEdit(id));
const sa_updateStorySession = mock.fn(async (_id: number, values: { title: string | null }) => ({
  ok: true as const,
  title: values.title,
}));
const sa_deleteStorySession = mock.fn(async (_id: number) => ({ ok: true as const }));
const sa_setLiveSceneSession = mock.fn(
  async (_story: number, _scene: number, idStorySession: number | null) => ({
    ok: true as const,
    idStorySession,
  }),
);

// Counts the stand-in field's mounts, so a test can see it remount.
let pictureLoads = 0;

let StorySessions: typeof import("./story-sessions").StorySessions;

describe("StorySessions", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: {
        sa_listStorySessions,
        sa_getStorySession: async () => null,
        sa_getSessionForEdit,
        sa_updateStorySession,
        sa_deleteStorySession,
      },
    });
    mock.module("@/app/(app)/scenes/[id]/live/actions", {
      namedExports: { sa_setLiveSceneSession },
    });
    // The panel's cover pictures are the scene form's two pieces, each with
    // a test file of its own; these stand-ins show which holder each was
    // given, and let the picker report an attach.
    mock.module("@/components/uploads/attachment-list-field", {
      namedExports: {
        AttachmentListField: ({
          kind,
          idExternal,
          showAdd,
        }: {
          kind: string;
          idExternal: number;
          showAdd?: boolean;
        }) => (
          <p>
            Pictures of {kind} {idExternal} (load {++pictureLoads}){showAdd ? ", adding" : ""}
          </p>
        ),
      },
    });
    mock.module("@/components/uploads/story-attachment-picker", {
      namedExports: {
        StoryAttachmentPicker: ({
          idStory,
          holder,
          onAttached,
        }: {
          idStory: number;
          holder: { kind: string; idExternal: number };
          onAttached?: (ids: number[]) => void;
        }) => (
          <button type="button" onClick={() => onAttached?.([99])}>
            Pick from story {idStory} for {holder.kind} {holder.idExternal}
          </button>
        ),
      },
    });
    ({ StorySessions } = await import("./story-sessions"));
  });

  beforeEach(() => {
    sa_listStorySessions.mock.resetCalls();
    sa_listStorySessions.mock.mockImplementation(async () => []);
    sa_updateStorySession.mock.resetCalls();
    sa_deleteStorySession.mock.resetCalls();
    sa_setLiveSceneSession.mock.resetCalls();
    toaster.remove();
  });

  it("lists each session's date and length in hours", () => {
    renderWithProviders(<StorySessions idStory={7} initial={sessions(2)} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Mar 20, 2026")).toBeInTheDocument();
    expect(within(items[0]).getByText("1.5 hours")).toBeInTheDocument();
    expect(within(items[1]).getByText("Mar 19, 2026")).toBeInTheDocument();
    expect(within(items[1]).getByText("2 hours")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("shows how many came to each session, its own count, when asked to", () => {
    const [first, second] = sessions(2);
    const { unmount } = renderWithProviders(
      <StorySessions
        idStory={7}
        initial={[
          { ...first, playerCount: 3 },
          { ...second, playerCount: 1 },
        ]}
        showPlayers
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("3 players")).toBeInTheDocument();
    expect(within(items[1]).getByText("1 player")).toBeInTheDocument();
    unmount();

    renderWithProviders(<StorySessions idStory={7} initial={sessions(1)} />);
    expect(screen.queryByText(/players?$/)).not.toBeInTheDocument();
  });

  it("keeps only the rows whose text matches the filter, and says so when none do", () => {
    const rows = [{ ...sessions(1)[0], status: "OPEN", length: null }, ...sessions(2, 2)];
    const { rerender } = renderWithProviders(
      <StorySessions idStory={7} initial={rows} showPlayers filter="progress" />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("In progress")).toBeInTheDocument();

    rerender(<StorySessions idStory={7} initial={rows} showPlayers filter="2 hours" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("2 hours")).toBeInTheDocument();

    rerender(<StorySessions idStory={7} initial={rows} showPlayers filter="3 players" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    rerender(<StorySessions idStory={7} initial={rows} showPlayers filter="nothing" />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("keeps the More button while a filter hides every loaded row", () => {
    renderWithProviders(
      <StorySessions idStory={7} initial={sessions(SESSIONS_PAGE_SIZE)} filter="nothing" />,
    );

    expect(screen.getByText("No matches.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("leads each row with its number and title only when asked, and searches them then", () => {
    const { unmount } = renderWithProviders(<StorySessions idStory={7} initial={sessions(2)} />);
    expect(screen.queryByText("1. Session 1 title")).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<StorySessions idStory={7} initial={sessions(2)} showTitles />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("1. Session 1 title")).toBeInTheDocument();
    expect(within(items[1]).getByText("2. Session 2 title")).toBeInTheDocument();
  });

  it("falls back to the number alone for an untitled session", () => {
    renderWithProviders(
      <StorySessions idStory={7} initial={[{ ...sessions(1)[0], title: null }]} showTitles />,
    );
    expect(screen.getByText("Session 1")).toBeInTheDocument();
  });

  it("matches the filter against the title only while it is shown", () => {
    const { rerender } = renderWithProviders(
      <StorySessions idStory={7} initial={sessions(2)} filter="2 title" />,
    );
    expect(screen.getByText("No matches.")).toBeInTheDocument();

    rerender(<StorySessions idStory={7} initial={sessions(2)} filter="2 title" showTitles />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("2. Session 2 title")).toBeInTheDocument();
  });

  it("shows the status instead of a length for a session that is not done", () => {
    renderWithProviders(
      <StorySessions
        idStory={7}
        initial={[
          { ...sessions(1)[0], status: "OPEN", length: null },
          { ...sessions(1, 2)[0], status: "SUSPENDED", length: null },
          { ...sessions(1, 3)[0], status: "RESUMED", length: null },
        ]}
      />,
    );

    // A resumed session is being played just like an open one, so it reads
    // the same.
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("In progress")).toBeInTheDocument();
    expect(within(items[1]).getByText("Suspended")).toBeInTheDocument();
    expect(within(items[2]).getByText("In progress")).toBeInTheDocument();
    expect(screen.queryByText(/hour/)).not.toBeInTheDocument();
  });

  it("says so when there are no sessions yet", () => {
    renderWithProviders(<StorySessions idStory={7} initial={[]} />);

    expect(screen.getByText("No sessions yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("loads the next five after a full page, until a short page comes back", async () => {
    const user = userEvent.setup();
    sa_listStorySessions.mock.mockImplementation(async (_idStory, offset) =>
      offset === SESSIONS_PAGE_SIZE ? sessions(2, SESSIONS_PAGE_SIZE + 1) : [],
    );
    renderWithProviders(<StorySessions idStory={7} initial={sessions(SESSIONS_PAGE_SIZE)} />);

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() => expect(sa_listStorySessions.mock.callCount()).toBe(1));
    expect(sa_listStorySessions.mock.calls[0].arguments).toEqual([
      7,
      SESSIONS_PAGE_SIZE,
      SESSIONS_PAGE_SIZE,
    ]);
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(SESSIONS_PAGE_SIZE + 2),
    );
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("keeps the More button when a full page comes back", async () => {
    const user = userEvent.setup();
    sa_listStorySessions.mock.mockImplementation(async (_idStory, offset) =>
      sessions(SESSIONS_PAGE_SIZE, offset + 1),
    );
    renderWithProviders(<StorySessions idStory={7} initial={sessions(SESSIONS_PAGE_SIZE)} />);

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(SESSIONS_PAGE_SIZE * 2),
    );
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More" }));
    await waitFor(() => expect(sa_listStorySessions.mock.callCount()).toBe(2));
    expect(sa_listStorySessions.mock.calls[1].arguments).toEqual([
      7,
      SESSIONS_PAGE_SIZE * 2,
      SESSIONS_PAGE_SIZE,
    ]);
  });

  it("leaves the list and the button alone when loading more fails", async () => {
    const user = userEvent.setup();
    sa_listStorySessions.mock.mockImplementation(async () => {
      throw new Error("offline");
    });
    renderWithProviders(<StorySessions idStory={7} initial={sessions(SESSIONS_PAGE_SIZE)} />);

    await user.click(screen.getByRole("button", { name: "More" }));

    await waitFor(() => expect(sa_listStorySessions.mock.callCount()).toBe(1));
    expect(screen.getAllByRole("listitem")).toHaveLength(SESSIONS_PAGE_SIZE);
    await waitFor(() => expect(screen.getByRole("button", { name: "More" })).toBeEnabled());
  });

  describe("the storyteller's controls", () => {
    // The first row's session as the controls name it.
    const rowsWith = (status: string) => [{ ...sessions(1)[0], status }, ...sessions(1, 2)];

    it("has none for anyone who may not manage the sessions", () => {
      renderWithProviders(<StorySessions idStory={7} initial={sessions(1)} showTitles />);
      expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
    });

    it("opens the edit panel under its row and saves the session from it", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <StorySessions idStory={7} initial={rowsWith("OPEN")} canManage showTitles />
          <Toaster />
        </>,
      );

      const [first] = screen.getAllByRole("listitem");
      const pencil = within(first).getByRole("button", { name: "Edit 1. Session 1 title" });
      await user.click(pencil);
      expect(pencil).toHaveAttribute("aria-expanded", "true");

      const title = await within(first).findByRole("textbox", { name: /^Title/ });
      expect(title).toHaveValue("Kildealg");
      await user.clear(title);
      await user.type(title, "The long night");
      await user.click(within(first).getByRole("button", { name: "Save session" }));

      await waitFor(() => expect(sa_updateStorySession.mock.callCount()).toBe(1));
      expect(sa_updateStorySession.mock.calls[0].arguments).toEqual([
        1,
        { title: "The long night", summary: "", notes: "", lingeringQuestions: "" },
      ]);
      // Closed, and the row's heading follows the new title.
      expect(await within(first).findByText("1. The long night")).toBeInTheDocument();
      expect(within(first).queryByRole("textbox", { name: /^Title/ })).not.toBeInTheDocument();
    });

    it("takes a scene out of the session and puts another in, from the panel, at once", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <StorySessions idStory={7} initial={rowsWith("OPEN")} canManage showTitles />
          <Toaster />
        </>,
      );

      const [first] = screen.getAllByRole("listitem");
      await user.click(within(first).getByRole("button", { name: /^Edit / }));
      const scenes = await within(first).findByRole("list", { name: "Scenes in this session" });
      expect(within(scenes).getByText("The docks")).toBeInTheDocument();

      // A complete scene keeps its session, so its − does nothing.
      await user.click(
        within(scenes).getByRole("button", { name: "A complete scene keeps its session" }),
      );
      expect(sa_setLiveSceneSession.mock.callCount()).toBe(0);

      await user.click(
        within(scenes).getByRole("button", { name: "Remove The docks from this session" }),
      );
      await waitFor(() => expect(sa_setLiveSceneSession.mock.callCount()).toBe(1));
      expect(sa_setLiveSceneSession.mock.calls[0].arguments).toEqual([7, 40, null]);
      await waitFor(() => expect(within(scenes).queryByText("The docks")).not.toBeInTheDocument());

      await user.selectOptions(
        within(first).getByRole("combobox", { name: "Add a scene to this session" }),
        "The abbey",
      );
      await waitFor(() => expect(sa_setLiveSceneSession.mock.callCount()).toBe(2));
      expect(sa_setLiveSceneSession.mock.calls[1].arguments).toEqual([7, 42, 1]);
      expect(await within(scenes).findByText("The abbey")).toBeInTheDocument();
    });

    it("offers the session's cover from an upload, a link or the story's pictures", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <StorySessions idStory={7} initial={rowsWith("OPEN")} canManage showTitles />,
      );

      const [first] = screen.getAllByRole("listitem");
      await user.click(within(first).getByRole("button", { name: /^Edit / }));
      expect(
        await within(first).findByRole("heading", { name: "Cover image" }),
      ).toBeInTheDocument();
      const field = () => within(first).getByText(/^Pictures of STORY_SESSION 1 /);
      // The link input and dropzone wait for the +; the story's pictures do not.
      expect(field()).not.toHaveTextContent("adding");
      const add = within(first).getByRole("button", { name: "Add a cover image" });
      expect(add).toHaveAttribute("aria-expanded", "false");
      await user.click(add);
      expect(add).toHaveAttribute("aria-expanded", "true");
      expect(field()).toHaveTextContent("adding");
      await user.click(add);
      expect(field()).not.toHaveTextContent("adding");

      // What the picker attaches shows in the field, which loads again.
      const before = within(first).getByText(/^Pictures of STORY_SESSION 1 /).textContent;
      await user.click(
        within(first).getByRole("button", { name: "Pick from story 7 for STORY_SESSION 1" }),
      );
      await waitFor(() =>
        expect(within(first).getByText(/^Pictures of STORY_SESSION 1 /).textContent).not.toBe(
          before,
        ),
      );
    });

    it("deletes a session once asked, and takes its row away", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <StorySessions idStory={7} initial={rowsWith("OPEN")} canManage showTitles />
          <Toaster />
        </>,
      );

      await user.click(screen.getByRole("button", { name: "Delete 1. Session 1 title" }));
      const ask = await screen.findByRole("dialog", { name: "Delete 1. Session 1 title?" });
      // Cancel at the start, the action at the end.
      const [cancel, remove] = within(ask).getAllByRole("button");
      expect(cancel).toHaveTextContent("Cancel");
      expect(remove).toHaveTextContent("Delete");
      expect(sa_deleteStorySession.mock.callCount()).toBe(0);

      await user.click(remove);
      await waitFor(() => expect(sa_deleteStorySession.mock.calls[0]?.arguments).toEqual([1]));
      await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
      expect(screen.queryByText("1. Session 1 title")).not.toBeInTheDocument();
    });

    it("deletes a DONE session once asked, saying its scenes lose their link to it", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <StorySessions idStory={7} initial={rowsWith("DONE")} canManage showTitles />
          <Toaster />
        </>,
      );

      const bin = screen.getByRole("button", { name: "Delete 1. Session 1 title" });
      expect(bin).not.toHaveAttribute("aria-disabled");
      await user.click(bin);
      const ask = await screen.findByRole("dialog", { name: "Delete 1. Session 1 title?" });
      expect(ask).toHaveTextContent("each loses its link to this session");
      expect(ask).toHaveTextContent("the record of who came to it");
      expect(ask).toHaveTextContent("It cannot be undone.");
      expect(sa_deleteStorySession.mock.callCount()).toBe(0);

      await user.click(within(ask).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(sa_deleteStorySession.mock.calls[0]?.arguments).toEqual([1]));
      await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    });

    it("puts a session just made at the top, with its edit panel open", async () => {
      const made: StorySession = {
        ...sessions(1, 9)[0],
        title: "Oct 22, 2026 session",
        status: "OPEN",
        length: null,
        playerCount: 0,
      };
      const { rerender } = renderWithProviders(
        <StorySessions idStory={7} initial={sessions(2)} canManage showTitles />,
      );

      rerender(
        <StorySessions idStory={7} initial={sessions(2)} canManage showTitles created={made} />,
      );

      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(3);
      expect(within(items[0]).getByText("9. Oct 22, 2026 session")).toBeInTheDocument();
      expect(await within(items[0]).findByRole("textbox", { name: /^Title/ })).toBeInTheDocument();
    });
  });
});
