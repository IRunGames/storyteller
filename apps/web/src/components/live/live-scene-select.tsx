"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Combobox,
  createListCollection,
  HStack,
  Menu,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ChevronDown, Plus } from "lucide-react";
import type { RunScene } from "@/lib/run";
import { SCENE_SEARCH_DELAY_MS, type SceneSessionOption } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { sa_createLiveScene } from "@/app/(app)/run/[id]/actions";
import { sa_searchLiveScenes } from "@/app/(app)/scenes/[id]/live/actions";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { StatusPills } from "@/components/status/status-search";
import { RunNewSceneDialog } from "@/components/run/run-new-scene-dialog";

type Props = {
  idStory: number;
  /** The scene the page is on, marked in the list. */
  scene: RunScene;
  /** The story's sittings, oldest first, for the Sessions filter. */
  sessions: SceneSessionOption[];
  /** The story_scenes workflow, for the pills and each scene's status. */
  statusOptions: StatusOption[];
  /** A scene was chosen, or made with the +: the page goes to it. */
  onChoose: (idStoryScene: number) => void;
};

/**
 * The scene selector in the live-edit page's header. The statuses as pills
 * on top, as the library's columns have them over their search boxes, all on
 * to start with; under them a Sessions filter, a box to type a scene's name
 * into, and a + beside it that makes a new one (RunNewSceneDialog with
 * sa_createLiveScene) and goes to it.
 *
 * What is typed, the pills and the sessions chosen go to the database
 * together (sa_searchLiveScenes), a moment after the last change, as the
 * board's Scenes column searches. The scenes in no session, the ones still
 * being prepared, which is what this page is mostly for, are always listed;
 * each session chosen adds the scenes played in it. With none chosen, where
 * it starts, it is the unplayed ones alone. Each scene shows its status, and
 * under its title the sitting it was played in.
 */
export function LiveSceneSelect({ idStory, scene, sessions, statusOptions, onChoose }: Props) {
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState(() => statusOptions.map((option) => option.key));
  const [chosenSessions, setChosenSessions] = useState<number[]>([]);
  const [scenes, setScenes] = useState<RunScene[]>([]);
  const [creating, setCreating] = useState(false);
  // Which search is the latest: a slow reply to an earlier one must not land
  // on top of the results for what the controls say now.
  const searchSeq = useRef(0);
  // The Sessions button's tooltip and menu look their trigger up by id.
  const sessionsTriggerId = useId();

  const statusKey = statuses.join(",");
  const sessionKey = chosenSessions.join(",");
  useEffect(() => {
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const found = await sa_searchLiveScenes(idStory, {
          query,
          statuses: statusKey === "" ? [] : statusKey.split(","),
          sessions: sessionKey === "" ? [] : sessionKey.split(",").map(Number),
        });
        if (seq === searchSeq.current) setScenes(found);
      } catch {
        // Leave the last results in place; the next change tries again.
      }
    }, SCENE_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [idStory, query, statusKey, sessionKey]);

  const collection = useMemo(
    () =>
      createListCollection({
        items: scenes,
        itemToString: (item) => item.title,
        itemToValue: (item) => String(item.idStoryScene),
      }),
    [scenes],
  );

  const statusLabel = (status: string) =>
    statusOptions.find((option) => option.key === status)?.label ?? status;

  // Newest first, as the header's session select lists them.
  const newestFirst = sessions.toReversed();
  const chosenCount = chosenSessions.length;
  const sessionsSummary =
    chosenCount === 0
      ? "Showing scenes in no session"
      : `Showing scenes in no session and in ${chosenCount} ${chosenCount === 1 ? "session" : "sessions"}`;

  function toggleSession(idStorySession: number, checked: boolean) {
    setChosenSessions((current) =>
      checked
        ? // In the story's order, so the selection never depends on the
          // order things were clicked in.
          sessions
            .map((session) => session.idStorySession)
            .filter((id) => id === idStorySession || current.includes(id))
        : current.filter((id) => id !== idStorySession),
    );
  }

  return (
    <>
      <Stack gap="1" align="center" py="1">
        <StatusPills
          label="Scenes"
          options={statusOptions}
          value={statuses}
          onChange={setStatuses}
        />
        <HStack gap="1">
          <Menu.Root
            ids={{ trigger: sessionsTriggerId }}
            closeOnSelect={false}
            positioning={{ placement: "bottom-start" }}
          >
            <Tooltip.Root
              openDelay={200}
              positioning={{ placement: "top" }}
              ids={{ trigger: sessionsTriggerId }}
            >
              <Tooltip.Trigger asChild>
                <Menu.Trigger asChild>
                  {/* The count is on the button, 0 included, so how the
                      list is narrowed shows without opening it. */}
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Sessions: ${chosenCount} selected`}
                  >
                    Sessions
                    <Badge size="xs" variant={chosenCount === 0 ? "outline" : "solid"}>
                      {chosenCount}
                    </Badge>
                    <ChevronDown />
                  </Button>
                </Menu.Trigger>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>{sessionsSummary}</Tooltip.Content>
                </Tooltip.Positioner>
              </Portal>
            </Tooltip.Root>
            <Portal>
              <Menu.Positioner>
                <Menu.Content minW="xs" maxH="80vh" overflowY="auto">
                  {newestFirst.length === 0 ? (
                    <Text px="2" py="1" textStyle="sm" color="fg.muted">
                      No sessions yet.
                    </Text>
                  ) : (
                    newestFirst.map((session) => (
                      <Menu.CheckboxItem
                        key={session.idStorySession}
                        value={String(session.idStorySession)}
                        checked={chosenSessions.includes(session.idStorySession)}
                        onCheckedChange={(checked) =>
                          toggleSession(session.idStorySession, checked)
                        }
                      >
                        {session.label}
                        <Menu.ItemIndicator />
                      </Menu.CheckboxItem>
                    ))
                  )}
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>

          <Combobox.Root
            collection={collection}
            size="xs"
            w="xs"
            openOnClick
            // The list is the database's answer to what is typed, so the
            // combobox leaves the narrowing to it.
            onInputValueChange={(details) => setQuery(details.inputValue)}
            onValueChange={(details) => {
              const [value] = details.value;
              if (value !== undefined && Number(value) !== scene.idStoryScene) {
                onChoose(Number(value));
              }
            }}
          >
            <Combobox.Control>
              <Combobox.Input aria-label="Scene" placeholder={scene.title} />
              <Combobox.IndicatorGroup>
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            <Portal>
              <Combobox.Positioner>
                <Combobox.Content maxH="80vh" overflowY="auto">
                  <Combobox.Empty>No scenes match.</Combobox.Empty>
                  {collection.items.map((row) => {
                    const isCurrent = row.idStoryScene === scene.idStoryScene;
                    return (
                      <Combobox.Item
                        key={row.idStoryScene}
                        item={row}
                        aria-current={isCurrent ? "true" : undefined}
                        fontWeight={isCurrent ? "semibold" : undefined}
                      >
                        <HStack justify="space-between" gap="4" w="full" minW="0">
                          <Stack gap="0" minW="0">
                            <Text truncate>{row.title}</Text>
                            {row.sessionHeading && (
                              <Text textStyle="xs" fontWeight="normal" color="fg.muted" truncate>
                                {row.sessionHeading}
                              </Text>
                            )}
                          </Stack>
                          <Text textStyle="xs" fontWeight="normal" color="fg.muted" flexShrink="0">
                            {statusLabel(row.status)}
                          </Text>
                        </HStack>
                      </Combobox.Item>
                    );
                  })}
                </Combobox.Content>
              </Combobox.Positioner>
            </Portal>
          </Combobox.Root>

          <PrepIconButton label="New scene" onClick={() => setCreating(true)}>
            <Plus />
          </PrepIconButton>
        </HStack>
      </Stack>

      <RunNewSceneDialog
        idStory={idStory}
        open={creating}
        onClose={() => setCreating(false)}
        create={sa_createLiveScene}
        onCreated={(space) => {
          if (space.scene) onChoose(space.scene.idStoryScene);
        }}
      />
    </>
  );
}
