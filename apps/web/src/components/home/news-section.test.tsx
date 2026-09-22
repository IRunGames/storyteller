import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";
import type { NewsItem } from "@/lib/news";

const items: NewsItem[] = [
  { idNews: 1, title: "First headline", startsAt: new Date("2026-09-21T12:00:00Z"), body: "First body." },
  { idNews: 2, title: "Second headline", startsAt: new Date("2026-09-14T12:00:00Z"), body: "Second body." },
  { idNews: 3, title: "Third headline", startsAt: new Date("2026-09-07T12:00:00Z"), body: "Third body." },
];

// The cards import their server action themselves, so the module is mocked
// before the dynamic import below loads them.
const sa_markNewsRead = mock.fn(async (_ids: number[]) => ({ ok: true as const }));

let NewsSection: typeof import("./news-section").NewsSection;

describe("NewsSection", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/home/actions", { namedExports: { sa_markNewsRead } });
    ({ NewsSection } = await import("./news-section"));
  });

  beforeEach(() => {
    sa_markNewsRead.mock.resetCalls();
  });

  it("is a titled region with one article per item, in the order given", () => {
    renderWithProviders(<NewsSection items={items} />);

    const region = screen.getByRole("region", { name: "News" });
    const articles = within(region).getAllByRole("article");
    expect(articles.map((a) => a.getAttribute("aria-label"))).toEqual([
      "First headline",
      "Second headline",
      "Third headline",
    ]);
    // Being shown is not being read.
    expect(sa_markNewsRead.mock.callCount()).toBe(0);
  });

  it("says so when there is nothing to report", () => {
    renderWithProviders(<NewsSection items={[]} />);

    expect(screen.getByRole("region", { name: "News" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to report.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("takes a card away once it has been read, and the others stay", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewsSection items={items} />);

    await user.click(screen.getByRole("button", { name: "Close Second headline" }));

    expect(screen.queryByRole("article", { name: "Second headline" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await waitFor(() => expect(sa_markNewsRead.mock.callCount()).toBe(1));

    await user.click(screen.getByRole("button", { name: "Close First headline" }));
    await user.click(screen.getByRole("button", { name: "Close Third headline" }));
    expect(screen.getByText("Nothing to report.")).toBeInTheDocument();
  });
});
