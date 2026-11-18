import { before, describe, it, mock } from "node:test";
import { expect } from "expect";

import { renderWithProviders } from "@/test/render";
import type { JoinStory } from "./actions";

// The story a link names, as the page's action would answer it; the url
// carries a quote and a parenthesis, the two characters that would end a
// CSS url("…") early if they reached it unescaped.
const story: JoinStory = {
  idStory: 7,
  title: "Fixture story",
  imageUrl: 'https://x.test/a").jpg',
  isFull: false,
  isAtTable: false,
};
const sa_getJoinStory = mock.fn(async (_code: string) => story);

let JoinPage: typeof import("./page").default;

describe("JoinPage", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ push: mock.fn(), refresh: mock.fn() }),
        notFound: () => {
          throw new Error("notFound");
        },
        redirect: () => {
          throw new Error("redirect");
        },
      },
    });
    mock.module("./actions", {
      namedExports: { sa_getJoinStory, sa_joinAsGuest: mock.fn(), sa_joinByLink: mock.fn() },
    });
    mock.module("@/lib/require-session", { namedExports: { getSession: async () => null } });
    ({ default: JoinPage } = await import("./page"));
  });

  it("paints the story's picture behind the form with its url escaped", async () => {
    const page = await JoinPage({ params: Promise.resolve({ code: "AbCdEfGhIjKl" }) });
    const { container } = renderWithProviders(page);

    const painted = container.querySelector<HTMLElement>("[aria-hidden]");
    expect(painted?.style.backgroundImage).toBe('url("https://x.test/a%22).jpg")');
  });
});
