"use client";

import { useState } from "react";
import { NativeSelect } from "@chakra-ui/react";
import type { SceneSessionOption } from "@/lib/scenes";
import { sa_setLiveSceneSession } from "@/app/(app)/scenes/[id]/live/actions";
import { toaster } from "@/components/ui/toaster";

// How many of the story's sittings the select offers, newest first.
const LIVE_SESSIONS_LIST_SIZE = 10;

type Props = {
  idStory: number;
  idStoryScene: number;
  /** The story's sittings, oldest first, as the edit page's Session select lists them. */
  sessions: SceneSessionOption[];
  /** The sitting the scene was played in as the page loaded, or null for none. */
  initial: number | null;
  /** The scene is complete: it was played somewhere, so Not played yet is not offered. */
  locked: boolean;
};

/**
 * The session in the live-edit page's header, where the run page names the
 * session being played: a select of the story's sittings, as the edit
 * page's Session field is, saved the moment one is chosen
 * (sa_setLiveSceneSession). It changes at once and goes back if the action
 * refuses. Not played yet is there to choose until the scene is complete.
 *
 * Only the ten most recent sittings are offered, newest first, since a scene
 * being prepared is almost always for one of them. The one the scene was
 * already played in stays on the list, at its foot, when it is older than
 * those, so the select can still show it.
 */
export function LiveSessionSelect({ idStory, idStoryScene, sessions, initial, locked }: Props) {
  const [value, setValue] = useState<number | null>(initial);
  // Reversed and cut after the labels are made, so each keeps the number its
  // place among all of them gives it, as the Timeline numbers it.
  const recent = sessions.toReversed().slice(0, LIVE_SESSIONS_LIST_SIZE);
  const older = sessions.find(
    (session) =>
      session.idStorySession === initial &&
      !recent.some((shown) => shown.idStorySession === initial),
  );
  const offered = older ? [...recent, older] : recent;

  async function choose(next: number | null) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    try {
      const result = await sa_setLiveSceneSession(idStory, idStoryScene, next);
      if (result.ok) return;
      setValue(previous);
      toaster.create({ title: result.error, type: "error" });
    } catch {
      setValue(previous);
      toaster.create({ title: "The session could not be changed. Try again.", type: "error" });
    }
  }

  return (
    <NativeSelect.Root size="sm" w="auto" minW="0" maxW="full">
      <NativeSelect.Field
        aria-label="Session"
        // "" is Not played yet, as on the edit page.
        value={value === null ? "" : String(value)}
        onChange={(event) =>
          void choose(event.target.value === "" ? null : Number(event.target.value))
        }
      >
        <option value="" disabled={locked}>
          Not played yet
        </option>
        {offered.map((session) => (
          <option key={session.idStorySession} value={session.idStorySession}>
            {session.label}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}
