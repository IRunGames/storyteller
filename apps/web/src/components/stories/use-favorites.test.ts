import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { StoryCardData } from "@/lib/stories";

type SetFavoriteResult = { ok: true; isFavorite: boolean } | { ok: false; error: string };
const sa_setFavorite = mock.fn(
  async (_idStory: number, isFavorite: boolean): Promise<SetFavoriteResult> => ({
    ok: true,
    isFavorite,
  }),
);
let useFavorites: typeof import("./use-favorites").useFavorites;

const story = { idStory: 7, title: "Seven", isFavorite: false } as StoryCardData;

describe("useFavorites", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/stories/actions", { namedExports: { sa_setFavorite } });
    ({ useFavorites } = await import("./use-favorites"));
  });

  beforeEach(() => {
    sa_setFavorite.mock.resetCalls();
    sa_setFavorite.mock.mockImplementation(async (_id, isFavorite) => ({ ok: true, isFavorite }));
  });

  it("flips the story at once, saves, and is pending until the answer", async () => {
    const flips: [number, boolean][] = [];
    const { result } = renderHook(() =>
      useFavorites((s, isFavorite) => flips.push([s.idStory, isFavorite])),
    );
    act(() => result.current.toggle(story, true));
    expect(flips).toEqual([[7, true]]);
    expect(result.current.pending.has(7)).toBe(true);
    await waitFor(() => expect(result.current.pending.has(7)).toBe(false));
    expect(sa_setFavorite.mock.calls[0].arguments).toEqual([7, true]);
    expect(flips).toEqual([[7, true]]);
  });

  it("flips the story back when the save is refused or fails", async () => {
    sa_setFavorite.mock.mockImplementationOnce(async () => ({ ok: false, error: "No." }));
    const flips: [number, boolean][] = [];
    const { result } = renderHook(() =>
      useFavorites((s, isFavorite) => flips.push([s.idStory, isFavorite])),
    );
    act(() => result.current.toggle(story, true));
    await waitFor(() =>
      expect(flips).toEqual([
        [7, true],
        [7, false],
      ]),
    );
  });

  it("ignores a second press while the first save is out", async () => {
    let settle!: () => void;
    sa_setFavorite.mock.mockImplementationOnce(
      () => new Promise((resolve) => (settle = () => resolve({ ok: true, isFavorite: true }))),
    );
    const flips: boolean[] = [];
    const { result } = renderHook(() => useFavorites((_s, isFavorite) => flips.push(isFavorite)));
    act(() => result.current.toggle(story, true));
    act(() => result.current.toggle(story, false));
    expect(flips).toEqual([true]);
    expect(sa_setFavorite.mock.callCount()).toBe(1);
    await act(async () => settle());
  });
});
