"use client";

import { Accordion, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { StorySceneDetail } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { SceneDetail } from "@/components/prep/scene-info-popover";
import { StatusPill } from "@/components/status/status-pill";

type Props = {
  /**
   * The session's scenes in the order they were played, each as its own
   * panel loads it. The storyteller's alone: sa_getStorySession gives
   * nobody else any, so for anyone else this is not drawn.
   */
  scenes: StorySceneDetail[];
  sceneStatusOptions: StatusOption[];
  /** The scene_elements workflow, for the pills in each scene's Elements fold. */
  elementStatusOptions: StatusOption[];
};

/**
 * The session page's scenes, one fold each, in the same accordion the
 * session panel folds its notes into and with the scene panel's body
 * (SceneDetail) inside, so a scene reads here exactly as it does from its
 * info button. Numbered as they were played, as the panel's list numbers
 * them. Read only, like that list: a scene is moved on the board where it
 * lives, and its attachments are added from its own panel.
 */
export function SessionScenesAccordion({
  scenes,
  sceneStatusOptions,
  elementStatusOptions,
}: Props) {
  if (scenes.length === 0) return null;
  return (
    <Stack gap="3">
      <Heading as="h2" size="md">
        Scenes ({scenes.length})
      </Heading>
      <Accordion.Root collapsible multiple size="sm" variant="enclosed">
        {scenes.map((scene, index) => (
          <Accordion.Item key={scene.idStoryScene} value={String(scene.idStoryScene)}>
            <Accordion.ItemTrigger>
              <HStack flex="1" justify="space-between" gap="2">
                <Text textStyle="sm">
                  {index + 1}. {scene.title}
                </Text>
                <StatusPill
                  table="story_scenes"
                  id={scene.idStoryScene}
                  status={scene.status}
                  options={sceneStatusOptions}
                />
              </HStack>
              <Accordion.ItemIndicator />
            </Accordion.ItemTrigger>
            <Accordion.ItemContent>
              <Accordion.ItemBody>
                <SceneDetail
                  detail={scene}
                  statusOptions={sceneStatusOptions}
                  elementStatusOptions={elementStatusOptions}
                  canEdit={false}
                  onStatusChanged={() => {}}
                />
              </Accordion.ItemBody>
            </Accordion.ItemContent>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </Stack>
  );
}
