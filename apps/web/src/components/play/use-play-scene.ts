"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyStoryEvent, type PlayScene } from "@/lib/play-scene";
import type { SceneText } from "@/lib/scenes";
import type { StoryEvent } from "@/lib/realtime/events";
import { sa_getPlayScene } from "@/app/(app)/play/[id]/actions";
import { useStoryChannel, type ChannelState } from "./use-story-channel";

/**
 * The scene the players' table shows, kept up to date from the story's
 * state topic. It starts from what the page loaded, applies each message
 * as it comes (applyStoryEvent), and loads the scene afresh whenever a
 * message says more changed than it can absorb, and on every connection,
 * since a message may have gone by while it was not listening.
 */
export function usePlayScene(
  idStory: number,
  initial: PlayScene,
): { scene: PlayScene; channel: ChannelState; setSceneText: (text: SceneText) => void } {
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

  const onEvent = useCallback(
    (event: StoryEvent) => {
      const { scene: next, refetch } = applyStoryEvent(sceneRef.current, event);
      if (refetch) {
        void reload();
      } else if (next !== sceneRef.current) {
        setScene(next);
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

  return { scene, channel, setSceneText };
}
