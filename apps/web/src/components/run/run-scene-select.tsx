"use client";

import { useState } from "react";
import { Box, Button, chakra, HStack, Menu, Portal, Text } from "@chakra-ui/react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { RunPlaySpace, RunScene } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { sa_listRunScenes, sa_loadRunScene } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { RunNewSceneDialog } from "./run-new-scene-dialog";

type Props = {
  idStory: number;
  /** The scene the table is on, or null for none. */
  scene: RunScene | null;
  /** Whether a session is being played; with none there is no table to put a scene on. */
  hasSession: boolean;
  /** The story_scenes workflow, for each scene's status as a word. */
  statusOptions: StatusOption[];
  /** The play space for the scene the table has just moved to. */
  onLoaded: (space: RunPlaySpace) => void;
};

/**
 * The scene selector beside the session in the storyteller's header: the
 * scene the table is on, and a menu of Create new scene and the story's ten
 * most recently touched scenes with their status, fetched as it opens.
 *
 * Choosing a scene puts the table on it (sa_loadRunScene): a pending one
 * becomes active, and an active or complete one is loaded as it is. A
 * complete scene stays complete, so the table shows it as finished, under
 * its overlay, with nothing to add or take away. Choosing it does not
 * reopen it; the scene's status chip beside this selector does, if the
 * storyteller moves it back.
 */
export function RunSceneSelect({ idStory, scene, hasSession, statusOptions, onLoaded }: Props) {
  const [scenes, setScenes] = useState<RunScene[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [isLoading, setLoading] = useState(false);

  const statusLabel = (status: string) =>
    statusOptions.find((option) => option.key === status)?.label ?? status;

  async function list() {
    setScenes(null);
    try {
      setScenes(await sa_listRunScenes(idStory));
    } catch {
      // Create new scene is still on offer with nothing listed.
      setScenes([]);
    }
  }

  async function load(target: RunScene) {
    setLoading(true);
    try {
      const result = await sa_loadRunScene(idStory, target.idStoryScene);
      if (result.ok) {
        onLoaded(result.space);
      } else {
        toaster.create({ title: result.error, type: "error" });
      }
    } catch {
      toaster.create({ title: "The scene could not be loaded. Try again.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Shrinks with the header's left side, so the button inside can. */}
      <Box display="inline-flex" minW="0" flexShrink="1">
        <Menu.Root
          positioning={{ placement: "bottom-start" }}
          onOpenChange={(details) => {
            if (details.open) void list();
          }}
          onSelect={(details) => {
            if (details.value === "new") {
              setCreating(true);
              return;
            }
            const chosen = scenes?.find((row) => String(row.idStoryScene) === details.value);
            if (chosen) void load(chosen);
          }}
        >
          <Menu.Trigger asChild>
            {/* Shrinks with the header's left side (Chakra's button does
                  not by default), its title truncating, so a narrow window
                  shortens the scene's name rather than cutting the button. */}
            <Button
              size="sm"
              variant="ghost"
              minW="0"
              flexShrink="1"
              overflow="hidden"
              justifyContent="flex-start"
              disabled={!hasSession}
              loading={isLoading}
              title={hasSession ? undefined : "Start a session to choose a scene"}
            >
              <chakra.span color="fg.muted" flexShrink="0">
                Scene:
              </chakra.span>{" "}
              <chakra.span truncate minW="0">
                {scene?.title ?? "None"}
              </chakra.span>
              <ChevronDown />
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="xs">
                <Menu.Item value="new">
                  <Plus />
                  Create new scene
                </Menu.Item>
                <Menu.Separator />
                {scenes === null ? (
                  <Text px="2" py="1" textStyle="sm" color="fg.muted">
                    Loading…
                  </Text>
                ) : scenes.length === 0 ? (
                  <Text px="2" py="1" textStyle="sm" color="fg.muted">
                    No scenes yet.
                  </Text>
                ) : (
                  scenes.map((row) => {
                    // The scene the table is on stands out in the list, with
                    // a tick, the weight and a tint, and aria-current for a
                    // screen reader. A space the tick's width keeps every
                    // other title in line with it.
                    const isCurrent = row.idStoryScene === scene?.idStoryScene;
                    return (
                      <Menu.Item
                        key={row.idStoryScene}
                        value={String(row.idStoryScene)}
                        aria-current={isCurrent ? "true" : undefined}
                        bg={isCurrent ? "bg.muted" : undefined}
                        fontWeight={isCurrent ? "semibold" : undefined}
                      >
                        <HStack justify="space-between" gap="4" w="full" minW="0">
                          <HStack gap="2" minW="0">
                            <chakra.span boxSize="4" flexShrink="0" color="colorPalette.fg">
                              {isCurrent && <Check size={16} />}
                            </chakra.span>
                            <Text truncate>{row.title}</Text>
                          </HStack>
                          <Text textStyle="xs" fontWeight="normal" color="fg.muted" flexShrink="0">
                            {statusLabel(row.status)}
                          </Text>
                        </HStack>
                      </Menu.Item>
                    );
                  })
                )}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Box>

      <RunNewSceneDialog
        idStory={idStory}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={onLoaded}
      />
    </>
  );
}
