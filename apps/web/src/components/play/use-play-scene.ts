"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyStoryEvent, type PlayScene } from "@/lib/play-scene";
import type { SceneText } from "@/lib/scenes";
import type { StoryEvent } from "@/lib/realtime/events";
import { sa_getPlayScene } from "@/app/(app)/play/[id]/actions";
import { useStoryChannel, type ChannelState } from "./use-story-channel";

/** A pulse about one element of the scene the table is on, as it came over the topic. */
export type ScenePulseEvent = Extract<StoryEvent, { type: "scene_element.custom" }>;

/**
 * The scene the players' table shows, kept up to date from the story's
 * state topic. It starts from what the page loaded, applies each message
 * as it comes (applyStoryEvent), and loads the scene afresh whenever a
 * message says more changed than it can absorb, and on every connection,
 * since a message may have gone by while it was not listening. A pulse
 * (scene_element.custom) changes nothing held; one about the scene the
 * table is on is handed to `onPulse` for the table to act on.
 */
export function usePlayScene(
  idStory: number,
  initial: PlayScene,
  onPulse?: (event: ScenePulseEvent) => void,
): {
  scene: PlayScene;
  channel: ChannelState;
  setSceneText: (text: SceneText) => void;
  setElementNotes: (idElement: number, notes: string | null) => void;
  setElementStatus: (idElement: number, status: string) => void;
} {
  const [scene, setScene] = useState(initial);
  // A new story under the same table starts from that story's scene. Set
  // during render, the way React asks for state that follows a prop, so no
  // frame shows the old story's scene.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setScene(initial);
  }
  // The latest scene for the message handler, which the channel holds
  // across renders and would otherwise apply events to a stale one. Kept
  // current in an effect, as the hooks rule asks; a message always arrives
  // after the render that changed it.
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  });
  // Only the newest reload's answer is kept, so two in flight cannot land
  // out of order and leave the older scene showing.
  const reloads = useRef(0);

  const reload = useCallback(async () => {
    const number = ++reloads.current;
    const next = await sa_getPlayScene(idStory);
    if (next && number === reloads.current) setScene(next);
  }, [idStory]);

  // The latest onPulse, held the way the scene is, so the channel's handler
  // never calls a stale one.
  const onPulseRef = useRef(onPulse);
  useEffect(() => {
    onPulseRef.current = onPulse;
  });

  const onEvent = useCallback(
    (event: StoryEvent) => {
      const { scene: next, refetch } = applyStoryEvent(sceneRef.current, event);
      if (refetch) {
        void reload();
      } else if (next !== sceneRef.current) {
        setScene(next);
      }
      if (
        event.type === "scene_element.custom" &&
        event.idStoryScene === sceneRef.current.scene?.idStoryScene
      ) {
        onPulseRef.current?.(event);
      }
    },
    [reload],
  );

  const channel = useStoryChannel(idStory, onEvent, () => void reload());

  // The scene's text as the panel just saved it, kept at once rather than
  // waiting for the topic to say the scene changed.
  const setSceneText = useCallback(
    (text: SceneText) =>
      setScene((current) =>
        current.scene ? { ...current, scene: { ...current.scene, text } } : current,
      ),
    [],
  );

  // An element's notes as a pill's popover just saved them, the same way;
  // the topic's copy of the element, when it comes, says the same.
  const setElementNotes = useCallback(
    (idElement: number, notes: string | null) =>
      setScene((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.element.idElement === idElement
            ? { ...item, element: { ...item.element, notes } }
            : item,
        ),
      })),
    [],
  );

  // A link's status as a pill just moved it (a card untapped), the same way.
  const setElementStatus = useCallback(
    (idElement: number, status: string) =>
      setScene((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.element.idElement === idElement
            ? { ...item, sceneElement: { ...item.sceneElement, status } }
            : item,
        ),
      })),
    [],
  );

  return { scene, channel, setSceneText, setElementNotes, setElementStatus };
}
