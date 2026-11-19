"use client";

import { useState } from "react";
import { sa_setStackWide } from "@/components/run/actions";
import { toaster } from "@/components/ui/toaster";
import { isStackWide, withStackWide } from "@/lib/scene-elements";

/**
 * The stacks the storyteller has widened to the whole play space, as the
 * storyteller's tables hold them: shown at once when the expand button is
 * pressed, written on the scene (sa_setStackWide) so every table draws them
 * the same, and put back with a word if the write is refused. `load` takes
 * the scene's own set when the table reads a space afresh.
 */
export function useWideStacks(
  idStory: number,
  idStoryScene: number | null,
  initial: readonly string[] | undefined,
): {
  wideTags: string[];
  load: (wideTags: readonly string[] | undefined) => void;
  isWide: (tag: string | null) => boolean;
  setWide: (tag: string | null, wide: boolean) => Promise<void>;
} {
  const [wideTags, setWideTags] = useState<string[]>([...(initial ?? [])]);

  async function setWide(tag: string | null, wide: boolean) {
    const before = wideTags;
    setWideTags((current) => withStackWide(current, tag, wide));
    // With no scene at the table there is nothing to write it on; the
    // stacks shown then are this page's alone.
    if (idStoryScene === null) return;
    const result = await sa_setStackWide(idStory, idStoryScene, { tag, wide });
    if (result.ok) {
      setWideTags(result.wideTags);
    } else {
      setWideTags(before);
      toaster.create({ title: result.error, type: "error" });
    }
  }

  return {
    wideTags,
    load: (next) => setWideTags([...(next ?? [])]),
    isWide: (tag) => isStackWide(wideTags, tag),
    setWide,
  };
}
