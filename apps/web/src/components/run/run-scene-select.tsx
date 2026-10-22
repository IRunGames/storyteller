"use client";

import { useId, useState } from "react";
import {
  Box,
  Button,
  chakra,
  HStack,
  IconButton,
  Menu,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Check, ChevronDown, ExternalLink, Plus } from "lucide-react";
import { scenePreviewPath } from "@/lib/scenes";
import type { RunPlaySpace, RunScene } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import {
  sa_listRunScenes,
  sa_loadRunScene,
  type CreateRunSceneResult,
} from "@/app/(app)/run/[id]/actions";
import type { RunSceneValues } from "@/lib/scene-schemas";
import { toaster } from "@/components/ui/toaster";
import { RunNewSceneDialog } from "./run-new-scene-dialog";

type Props = {
  idStory: number;
  /** The scene the table is on, or null for none. */
  scene: RunScene | null;
  /**
   * Whether a session is being played. With none there is no table to put
   * a scene on, so the listed scenes cannot be chosen, though a new one can
   * still be made.
   */
  hasSession: boolean;
  /** The story_scenes workflow, for each scene's status as a word. */
  statusOptions: StatusOption[];
  /** The play space for the scene the table has just moved to. */
  onLoaded: (space: RunPlaySpace) => void;
  /**
   * What choosing a listed scene does, when it is not putting the table on
   * it: the live-edit page goes to that scene's own page, leaving the
   * session alone. Given, the scenes can be chosen with or without a session.
   */
  onChoose?: (scene: RunScene) => void;
  /** What Create new scene writes with, when not sa_createRunScene; see RunNewSceneDialog. */
  create?: (idStory: number, values: RunSceneValues) => Promise<CreateRunSceneResult>;
};

/**
 * The scene selector in the storyteller's header, beside the session: a
 * button that says only Scene, with the scene the table is on in its
 * tooltip and its accessible name, and a menu of Create new scene and the
 * story's ten most recently touched scenes with their status, and under each
 * title the sitting it was played in, fetched as it opens. The scene's title
 * itself stands in the play space.
 *
 * Choosing a scene puts the table on it (sa_loadRunScene): a pending one
 * becomes active, and an active or complete one is loaded as it is. A
 * complete scene stays complete, so the table shows it as finished, under
 * its overlay, with nothing to add or take away. Choosing it does not
 * reopen it; the scene's status chip beside this selector does, if the
 * storyteller moves it back. With no session being played, the scenes are
 * listed but cannot be chosen; Create new scene still makes one, pending
 * and in no sitting, and the play space shows it to be prepared.
 *
 * The live-edit page uses the same selector with its own onChoose and
 * create, so choosing or making a scene there opens it to edit and leaves
 * the session where it was.
 *
 * At the end of each scene's row, an external-link icon, as a player pill's
 * link carries, opens the scene's preview (/preview/scene/[id]) in a new
 * tab: the scene as the players would see
 * it, with nothing to press, for looking something up without moving the
 * table. It stands beside the item rather than inside it, so pressing it
 * is not choosing the scene.
 */
export function RunSceneSelect({
  idStory,
  scene,
  hasSession,
  statusOptions,
  onLoaded,
  onChoose,
  create,
}: Props) {
  const [scenes, setScenes] = useState<RunScene[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [isLoading, setLoading] = useState(false);
  // Tooltip and menu each look their trigger up by id; sharing one keeps the
  // menu from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const current = scene?.title ?? "None";
  // Whether a listed scene can be chosen: the run page needs a session to
  // put it on; a page with its own onChoose does not.
  const canChoose = hasSession || onChoose !== undefined;

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
      {/* A little room on the left, so the selector stands apart from the
          session's chip rather than running on from it. */}
      <Box display="inline-flex" flexShrink="0" ms="2">
        <Menu.Root
          ids={{ trigger: triggerId }}
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
            if (!chosen) return;
            if (onChoose) onChoose(chosen);
            else void load(chosen);
          }}
        >
          <Tooltip.Root
            openDelay={200}
            positioning={{ placement: "top" }}
            ids={{ trigger: triggerId }}
          >
            <Tooltip.Trigger asChild>
              <Menu.Trigger asChild>
                {/* Only the word; the scene's title is the tooltip's and the
                    accessible name's, and the play space shows it in full.
                    Open with no session too, for Create new scene. */}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Scene: ${current}`}
                  loading={isLoading}
                >
                  Scene
                  <ChevronDown />
                </Button>
              </Menu.Trigger>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>{current}</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
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
                      <HStack key={row.idStoryScene} gap="1" pe="1">
                        <Menu.Item
                          value={String(row.idStoryScene)}
                          disabled={!canChoose}
                          title={canChoose ? undefined : "Start a session to choose a scene"}
                          flex="1"
                          minW="0"
                          aria-current={isCurrent ? "true" : undefined}
                          bg={isCurrent ? "bg.muted" : undefined}
                          fontWeight={isCurrent ? "semibold" : undefined}
                        >
                          <HStack justify="space-between" gap="4" w="full" minW="0">
                            <HStack gap="2" minW="0">
                              <chakra.span boxSize="4" flexShrink="0" color="colorPalette.fg">
                                {isCurrent && <Check size={16} />}
                              </chakra.span>
                              {/* The sitting under the title, when it has
                                  one, in the status's small muted type. */}
                              <Stack gap="0" minW="0">
                                <Text truncate>{row.title}</Text>
                                {row.sessionHeading && (
                                  <Text
                                    textStyle="xs"
                                    fontWeight="normal"
                                    color="fg.muted"
                                    truncate
                                  >
                                    {row.sessionHeading}
                                  </Text>
                                )}
                              </Stack>
                            </HStack>
                            <Text
                              textStyle="xs"
                              fontWeight="normal"
                              color="fg.muted"
                              flexShrink="0"
                            >
                              {statusLabel(row.status)}
                            </Text>
                          </HStack>
                        </Menu.Item>
                        <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                          <Tooltip.Trigger asChild>
                            <IconButton asChild size="xs" variant="ghost" rounded="full">
                              <a
                                href={scenePreviewPath(row.idStoryScene)}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Preview ${row.title}`}
                              >
                                <ExternalLink />
                              </a>
                            </IconButton>
                          </Tooltip.Trigger>
                          <Portal>
                            <Tooltip.Positioner>
                              <Tooltip.Content>Preview in a new tab</Tooltip.Content>
                            </Tooltip.Positioner>
                          </Portal>
                        </Tooltip.Root>
                      </HStack>
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
        create={create}
      />
    </>
  );
}
