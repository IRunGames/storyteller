import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { PlayerMatch, StoryPlayer } from "@/lib/stories";

const hermione: PlayerMatch = {
  idUser: "u-hermione",
  name: "Hermione",
  email: "hermione.granger@example.com",
  image: null,
};
const harry: PlayerMatch = {
  idUser: "u-harry",
  name: "Harry",
  email: "harry.potter@example.com",
  image: null,
};

// The popover imports its server actions itself, so the module is mocked
// before the dynamic import below loads it.
const sa_searchPlayers = mock.fn<(idStory: number, query: string) => Promise<PlayerMatch[]>>(
  async () => [],
);
const sa_addStoryPlayers = mock.fn<(idStory: number, ids: string[]) => Promise<StoryPlayer[]>>(
  async () => [],
);

let InvitePlayersPopover: typeof import("./invite-players-popover").InvitePlayersPopover;

async function openPopover(onInvited = mock.fn<(added: StoryPlayer[]) => void>()) {
  const u = userEvent.setup();
  renderWithProviders(
    <>
      <InvitePlayersPopover idStory={7} onInvited={onInvited} />
      <Toaster />
    </>,
  );
  await u.click(screen.getByRole("button", { name: "Invite Players" }));
  const dialog = await screen.findByRole("dialog", { name: "Invite players" });
  // The popover moves focus into itself a beat after the dialog appears; under
  // jsdom it lands on the content element. A test that starts typing before
  // then loses whatever it types after the move, so wait for it.
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  return { u, dialog, onInvited };
}

describe("InvitePlayersPopover", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", {
      namedExports: { sa_searchPlayers, sa_addStoryPlayers },
    });
    ({ InvitePlayersPopover } = await import("./invite-players-popover"));
  });

  beforeEach(() => {
    sa_searchPlayers.mock.resetCalls();
    sa_searchPlayers.mock.mockImplementation(async () => []);
    sa_addStoryPlayers.mock.resetCalls();
    sa_addStoryPlayers.mock.mockImplementation(async () => []);
  });

  afterEach(() => {
    toaster.remove();
  });

  it("opens with a search box, a disabled Save and a Cancel", async () => {
    const { dialog } = await openPopover();

    expect(within(dialog).getByRole("searchbox", { name: "Search players" })).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(sa_searchPlayers.mock.callCount()).toBe(0);
  });

  it("searches what was typed and lists the matches with their email", async () => {
    sa_searchPlayers.mock.mockImplementation(async () => [hermione, harry]);
    const { u, dialog } = await openPopover();

    await u.type(within(dialog).getByRole("searchbox", { name: "Search players" }), "h");

    await waitFor(() => expect(sa_searchPlayers.mock.callCount()).toBe(1));
    expect(sa_searchPlayers.mock.calls[0].arguments).toEqual([7, "h"]);
    const boxes = await within(dialog).findAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(within(dialog).getByRole("checkbox", { name: /Hermione/ })).not.toBeChecked();
    expect(within(dialog).getByText("hermione.granger@example.com")).toBeInTheDocument();
  });

  it("does not search an empty or blank box, and clears the matches when it empties", async () => {
    sa_searchPlayers.mock.mockImplementation(async () => [hermione]);
    const { u, dialog } = await openPopover();
    const box = within(dialog).getByRole("searchbox", { name: "Search players" });

    await u.type(box, "   ");
    // Long enough for the debounce to have fired had it been going to.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(sa_searchPlayers.mock.callCount()).toBe(0);

    await u.clear(box);
    await u.type(box, "her");
    await within(dialog).findByRole("checkbox", { name: /Hermione/ });

    await u.clear(box);
    await waitFor(() =>
      expect(within(dialog).queryByRole("checkbox", { name: /Hermione/ })).not.toBeInTheDocument(),
    );
    expect(sa_searchPlayers.mock.callCount()).toBe(1);
  });

  it("says so when nothing matches", async () => {
    const { u, dialog } = await openPopover();

    await u.type(within(dialog).getByRole("searchbox", { name: "Search players" }), "zz");

    expect(await within(dialog).findByText("No one matches.")).toBeInTheDocument();
  });

  it("keeps a selection across searches and saves the chosen ids", async () => {
    sa_searchPlayers.mock.mockImplementation(async (_idStory, query) =>
      query === "her" ? [hermione] : [harry],
    );
    sa_addStoryPlayers.mock.mockImplementation(async () => [
      { idUser: hermione.idUser, name: hermione.name, image: null },
      { idUser: harry.idUser, name: harry.name, image: null },
    ]);
    const { u, dialog, onInvited } = await openPopover();
    const box = within(dialog).getByRole("searchbox", { name: "Search players" });

    await u.type(box, "her");
    await u.click(await within(dialog).findByRole("checkbox", { name: /Hermione/ }));
    expect(within(dialog).getByRole("checkbox", { name: /Hermione/ })).toBeChecked();

    await u.clear(box);
    await u.type(box, "har");
    await u.click(await within(dialog).findByRole("checkbox", { name: /Harry/ }));

    // Hermione is no longer listed but is still chosen, and the summary
    // line says so.
    expect(within(dialog).queryByRole("checkbox", { name: /Hermione/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Inviting: Hermione, Harry")).toBeInTheDocument();

    await u.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sa_addStoryPlayers.mock.callCount()).toBe(1));
    expect(sa_addStoryPlayers.mock.calls[0].arguments).toEqual([
      7,
      [hermione.idUser, harry.idUser],
    ]);
    expect(onInvited.mock.callCount()).toBe(1);
    expect(onInvited.mock.calls[0].arguments[0]).toHaveLength(2);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Invite players" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Invited 2 players.")).toBeInTheDocument();
  });

  it("unchecking a match drops it from the selection", async () => {
    sa_searchPlayers.mock.mockImplementation(async () => [hermione]);
    const { u, dialog } = await openPopover();

    await u.type(within(dialog).getByRole("searchbox", { name: "Search players" }), "her");
    const box = await within(dialog).findByRole("checkbox", { name: /Hermione/ });
    await u.click(box);
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    await u.click(box);

    expect(within(dialog).queryByText(/Inviting:/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("cancel closes without saving and forgets the search and selection", async () => {
    sa_searchPlayers.mock.mockImplementation(async () => [hermione]);
    const { u, dialog } = await openPopover();

    await u.type(within(dialog).getByRole("searchbox", { name: "Search players" }), "her");
    await u.click(await within(dialog).findByRole("checkbox", { name: /Hermione/ }));
    await u.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Invite players" })).not.toBeInTheDocument(),
    );
    expect(sa_addStoryPlayers.mock.callCount()).toBe(0);

    await u.click(screen.getByRole("button", { name: "Invite Players" }));
    const reopened = await screen.findByRole("dialog", { name: "Invite players" });
    expect(within(reopened).getByRole("searchbox", { name: "Search players" })).toHaveValue("");
    expect(within(reopened).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(reopened).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("keeps the popover open with an inline error when saving fails", async () => {
    sa_searchPlayers.mock.mockImplementation(async () => [hermione]);
    sa_addStoryPlayers.mock.mockImplementation(async () => {
      throw new Error("boom");
    });
    const { u, dialog, onInvited } = await openPopover();

    await u.type(within(dialog).getByRole("searchbox", { name: "Search players" }), "her");
    await u.click(await within(dialog).findByRole("checkbox", { name: /Hermione/ }));
    await u.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not invite the players. Please try again.",
    );
    expect(onInvited.mock.callCount()).toBe(0);
    expect(within(dialog).getByRole("checkbox", { name: /Hermione/ })).toBeChecked();
  });
});
