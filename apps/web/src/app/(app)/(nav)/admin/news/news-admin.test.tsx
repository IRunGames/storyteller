import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import { Toaster, toaster } from "@/components/ui/toaster";
import type { AdminNews } from "./actions";

const row = (over: Partial<AdminNews>): AdminNews => ({
  idNews: 1,
  title: "Maps come to the table",
  body: "Draw on a picture before the players see it.",
  startsAt: new Date("2026-10-01T00:00:00Z"),
  expiresAt: null,
  isArchived: false,
  status: "live",
  author: "Admin",
  createdAt: new Date("2026-10-01T12:00:00Z"),
  ...over,
});

const rows = [
  row({}),
  row({
    idNews: 2,
    title: "Favorites on the home page",
    body: "Heart a story and it rises.",
    author: "Storyteller",
    expiresAt: new Date("2026-12-01T00:00:00Z"),
    createdAt: new Date("2026-10-03T12:00:00Z"),
  }),
  row({
    idNews: 3,
    title: "Chat at the table",
    body: "Talk while you play.",
    status: "scheduled",
    startsAt: new Date("2099-01-01T00:00:00Z"),
    createdAt: new Date("2026-10-02T12:00:00Z"),
  }),
];

const sa_createNews = mock.fn(async (input: { title: string }) => ({
  ok: true,
  news: row({ idNews: 9, title: input.title, createdAt: new Date("2026-11-01T12:00:00Z") }),
}));
const sa_updateNews = mock.fn(
  async (idNews: number, input: { title: string; archived: boolean }) => ({
    ok: true,
    news: row({
      ...rows.find((r) => r.idNews === idNews),
      title: input.title,
      isArchived: input.archived,
      status: input.archived ? "archived" : "live",
    }),
  }),
);
const sa_setNewsArchived = mock.fn(async (idNews: number, archived: boolean) => ({
  ok: true,
  news: row({
    ...rows.find((r) => r.idNews === idNews),
    isArchived: archived,
    status: archived ? "archived" : "live",
  }),
}));
const sa_deleteNews = mock.fn(async () => ({ ok: true }));

let NewsAdmin: typeof import("./news-admin").NewsAdmin;

/** The titles down the table, in the order shown. */
function titles() {
  const table = screen.getByRole("table", { name: "News" });
  const [, body] = within(table).getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((tr) => within(tr).getAllByRole("cell")[0].firstElementChild?.textContent);
}

function rowOf(title: string) {
  return screen.getByText(title).closest("tr") as HTMLElement;
}

describe("NewsAdmin", () => {
  before(async () => {
    mock.module("./actions", {
      namedExports: { sa_createNews, sa_updateNews, sa_setNewsArchived, sa_deleteNews },
    });
    ({ NewsAdmin } = await import("./news-admin"));
  });

  beforeEach(() => {
    for (const fn of [sa_createNews, sa_updateNews, sa_setNewsArchived, sa_deleteNews]) {
      fn.mock.resetCalls();
    }
    renderWithProviders(
      <>
        <NewsAdmin initial={rows} />
        <Toaster />
      </>,
    );
  });

  afterEach(() => toaster.remove());

  it("lists every item, newest posted first", () => {
    expect(titles()).toEqual([
      "Favorites on the home page",
      "Chat at the table",
      "Maps come to the table",
    ]);
  });

  it("says each item's status and when it lapses, in UTC days", () => {
    const favorites = rowOf("Favorites on the home page");
    expect(within(favorites).getByText("Live")).toBeInTheDocument();
    expect(within(favorites).getByText("Dec 1, 2026")).toBeInTheDocument();
    expect(within(rowOf("Maps come to the table")).getByText("Never")).toBeInTheDocument();
    expect(within(rowOf("Chat at the table")).getByText("Scheduled")).toBeInTheDocument();
  });

  it("narrows the list by title, news or author", async () => {
    const u = userEvent.setup();
    const search = screen.getByRole("searchbox", { name: "Search news" });
    await u.type(search, "chat");
    expect(titles()).toEqual(["Chat at the table"]);

    await u.clear(search);
    await u.type(search, "heart a story");
    expect(titles()).toEqual(["Favorites on the home page"]);

    await u.clear(search);
    await u.type(search, "storyteller");
    expect(titles()).toEqual(["Favorites on the home page"]);

    await u.clear(search);
    await u.type(search, "nothing like it");
    expect(screen.getByText("No news matches.")).toBeInTheDocument();
  });

  it("sorts by a header", async () => {
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Title" }));
    expect(titles()).toEqual([
      "Chat at the table",
      "Favorites on the home page",
      "Maps come to the table",
    ]);
  });

  it("posts a new item and puts it at the top", async () => {
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "New news item" }));
    const dialog = await screen.findByRole("dialog", { name: "New news item" });
    // Nothing is posted archived, so a new item has no switch.
    expect(within(dialog).queryByRole("switch", { name: "Archived" })).toBeNull();
    await u.type(within(dialog).getByRole("textbox", { name: "Title" }), "Dice rolls");
    await u.type(within(dialog).getByRole("textbox", { name: "News" }), "Roll from the pill.");
    await u.click(within(dialog).getByRole("button", { name: "Post" }));

    await waitFor(() => expect(sa_createNews.mock.callCount()).toBe(1));
    expect(sa_createNews.mock.calls[0].arguments[0]).toMatchObject({
      title: "Dice rolls",
      body: "Roll from the pill.",
      expiresOn: "",
    });
    await waitFor(() => expect(titles()[0]).toBe("Dice rolls"));
    expect(await screen.findByText("Dice rolls has been posted.")).toBeInTheDocument();
  });

  it("edits an item from its pencil, filled in with what it has", async () => {
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Edit Maps come to the table" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit news item" });
    const title = within(dialog).getByRole("textbox", { name: "Title" });
    expect(title).toHaveValue("Maps come to the table");
    expect(within(dialog).getByLabelText("Starts on")).toHaveValue("2026-10-01");

    await u.clear(title);
    await u.type(title, "Maps and fog");
    await u.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sa_updateNews.mock.callCount()).toBe(1));
    expect(sa_updateNews.mock.calls[0].arguments[0]).toBe(1);
    await waitFor(() => expect(titles()).toContain("Maps and fog"));
  });

  it("archives an item, and restores it", async () => {
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Archive Chat at the table" }));
    await waitFor(() => expect(sa_setNewsArchived.mock.callCount()).toBe(1));
    expect(sa_setNewsArchived.mock.calls[0].arguments).toEqual([3, true]);
    expect(await within(rowOf("Chat at the table")).findByText("Archived")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Restore Chat at the table" }));
    await waitFor(() => expect(sa_setNewsArchived.mock.callCount()).toBe(2));
    expect(sa_setNewsArchived.mock.calls[1].arguments).toEqual([3, false]);
  });

  it("archives an item from its edit, by the switch", async () => {
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Edit Chat at the table" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit news item" });
    const archived = within(dialog).getByRole("switch", { name: "Archived" });
    expect(archived).not.toBeChecked();

    await u.click(archived);
    await u.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sa_updateNews.mock.callCount()).toBe(1));
    expect(sa_updateNews.mock.calls[0].arguments).toEqual([
      3,
      expect.objectContaining({ title: "Chat at the table", archived: true }),
    ]);
    expect(await within(rowOf("Chat at the table")).findByText("Archived")).toBeInTheDocument();
  });

  it("deletes an item once confirmed", async () => {
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Delete Chat at the table" }));
    const dialog = await screen.findByRole("dialog");
    await u.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(sa_deleteNews.mock.callCount()).toBe(1));
    expect(sa_deleteNews.mock.calls[0].arguments).toEqual([3]);
    await waitFor(() =>
      expect(titles()).toEqual(["Favorites on the home page", "Maps come to the table"]),
    );
  });
});
