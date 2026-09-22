import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { NewsItem } from "@/lib/news";

const item: NewsItem = {
  idNews: 7,
  title: "First headline",
  startsAt: new Date("2026-09-21T12:00:00Z"),
  body: "The whole story, which is longer than the preview shows.",
};

// The card imports its server action itself, so the module is mocked before
// the dynamic import below loads it.
const sa_markNewsRead = mock.fn(async (_ids: number[]) => ({ ok: true as const }));

let NewsCard: typeof import("./news-card").NewsCard;

describe("NewsCard", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/home/actions", { namedExports: { sa_markNewsRead } });
    ({ NewsCard } = await import("./news-card"));
  });

  beforeEach(() => {
    sa_markNewsRead.mock.resetCalls();
  });

  it("shows the title, date and body, and marks nothing just for being seen", () => {
    renderWithProviders(<NewsCard item={item} onDismiss={() => {}} />);

    const card = screen.getByRole("article", { name: "First headline" });
    expect(within(card).getByRole("button", { name: "First headline" })).toBeInTheDocument();
    expect(within(card).getByText("Sep 21, 2026")).toBeInTheDocument();
    expect(within(card).getByText(item.body)).toBeInTheDocument();
    expect(sa_markNewsRead.mock.callCount()).toBe(0);
  });

  it("opens the story from its title, marks it read at once, and dismisses on close", async () => {
    const user = userEvent.setup();
    const onDismiss = mock.fn<(i: NewsItem) => void>();
    renderWithProviders(<NewsCard item={item} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "First headline" }));

    const dialog = await screen.findByRole("dialog", { name: "First headline" });
    expect(dialog).toHaveTextContent(item.body);
    await waitFor(() => expect(sa_markNewsRead.mock.callCount()).toBe(1));
    expect(sa_markNewsRead.mock.calls[0].arguments).toEqual([[7]]);
    // Still on screen while it is being read.
    expect(onDismiss.mock.callCount()).toBe(0);

    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(onDismiss.mock.callCount()).toBe(1));
    expect(onDismiss.mock.calls[0].arguments[0]).toEqual(item);
  });

  it("opens the story from a click anywhere on the card, full screen", async () => {
    const user = userEvent.setup();
    const onDismiss = mock.fn<(i: NewsItem) => void>();
    renderWithProviders(<NewsCard item={item} onDismiss={onDismiss} />);

    await user.click(screen.getByText(item.body));

    const dialog = await screen.findByRole("dialog", { name: "First headline" });
    // Chakra stamps the size on the content, which is what fills the screen.
    expect(within(dialog).getByText(item.body)).toBeInTheDocument();
    await waitFor(() => expect(sa_markNewsRead.mock.callCount()).toBe(1));

    // A click inside the story must not bounce back to the card and reopen it.
    await user.click(within(dialog).getByText(item.body));
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onDismiss.mock.callCount()).toBe(1);
  });

  it("marks and dismisses from the close icon, with a tooltip, without opening the story", async () => {
    const user = userEvent.setup();
    const onDismiss = mock.fn<(i: NewsItem) => void>();
    renderWithProviders(<NewsCard item={item} onDismiss={onDismiss} />);

    const close = screen.getByRole("button", { name: "Close First headline" });
    await user.hover(close);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Mark as read");
    await user.click(close);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(sa_markNewsRead.mock.callCount()).toBe(1));
    expect(sa_markNewsRead.mock.calls[0].arguments).toEqual([[7]]);
    expect(onDismiss.mock.callCount()).toBe(1);
  });

  it("still dismisses when the server call fails", async () => {
    const user = userEvent.setup();
    sa_markNewsRead.mock.mockImplementationOnce(async () => {
      throw new Error("nope");
    });
    const onDismiss = mock.fn<(i: NewsItem) => void>();
    renderWithProviders(<NewsCard item={item} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Close First headline" }));

    // The worst case is the item coming back next visit; keeping it on
    // screen now would only fight the user.
    await waitFor(() => expect(sa_markNewsRead.mock.callCount()).toBe(1));
    expect(onDismiss.mock.callCount()).toBe(1);
  });
});
