"use client";

import { Flex, Text } from "@chakra-ui/react";
import { SCENE_LOCKED_STATUS, SCENE_PENDING_STATUS } from "@/lib/scenes";

/**
 * What covers a scene that is not being played, over the whole space: the
 * players' table (PlaySpace) and the display table (PassiveTable) alike.
 * Nothing for a scene in play.
 *
 * A pending scene is not being played yet, so the players wait. A complete
 * scene the storyteller has gone back to is the record of what was played:
 * the same overlay the storyteller's table puts up, so the players see it is
 * not being played and press nothing in it (the actions refuse too). Either
 * lets the pointer through, so what is under it can still be read; the
 * space keeps it from being changed. It lifts when the storyteller makes
 * the scene active, which comes over the topic as a change of scene.
 */
export function SceneStateOverlay({ status }: { status: string | undefined }) {
  if (status === SCENE_PENDING_STATUS) {
    return (
      <Flex
        position="absolute"
        inset="0"
        direction="column"
        align="center"
        justify="center"
        bg="blackAlpha.600"
        pointerEvents="none"
        data-testid="scene-pending-overlay"
      >
        <Text fontSize="5xl" fontWeight="bold" letterSpacing="widest" color="white">
          PENDING
        </Text>
        <Text fontSize="xl" letterSpacing="wider" color="white">
          Please Stand By
        </Text>
      </Flex>
    );
  }
  if (status === SCENE_LOCKED_STATUS) {
    return (
      <Flex
        position="absolute"
        inset="0"
        align="center"
        justify="center"
        bg="blackAlpha.600"
        pointerEvents="none"
        data-testid="scene-complete-overlay"
      >
        <Text fontSize="5xl" fontWeight="bold" letterSpacing="widest" color="white">
          COMPLETE
        </Text>
      </Flex>
    );
  }
  return null;
}
