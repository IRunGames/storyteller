import { useState } from "react";
import { sa_setFavorite } from "./actions";
import { useLatest } from "@/hooks/use-latest";
import type { StoryCardData } from "@/lib/stories";

/**
 * The hearts of a list of story cards. `flip` is how the list shows a story
 * as a favorite or not: the heart turns at once, the save goes to
 * sa_setFavorite, and a refusal flips it back. A story whose save is still
 * out is in `pending`, and a second press on it does nothing, so the list
 * never shows a state the server has not been asked for. Which lists a flip
 * touches is the caller's: My Stories moves the story into or out of its
 * Favorites section, the home page's Favorites block takes the card away.
 */
export function useFavorites(flip: (story: StoryCardData, isFavorite: boolean) => void) {
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const flipRef = useLatest(flip);

  function toggle(story: StoryCardData, isFavorite: boolean) {
    if (pending.has(story.idStory)) return;
    setPending((current) => new Set(current).add(story.idStory));
    flipRef.current(story, isFavorite);
    void (async () => {
      try {
        const result = await sa_setFavorite(story.idStory, isFavorite);
        if (!result.ok) throw new Error(result.error);
      } catch {
        flipRef.current(story, !isFavorite);
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(story.idStory);
          return next;
        });
      }
    })();
  }

  return { pending, toggle };
}
