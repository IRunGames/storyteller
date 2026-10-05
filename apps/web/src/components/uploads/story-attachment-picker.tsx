"use client";

import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  Alert,
  Box,
  Button,
  Checkbox,
  Grid,
  Image,
  Input,
  InputGroup,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Search } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import {
  sa_listAttachments,
  sa_moveStoryAttachmentsToScene,
  sa_searchAttachments,
} from "./actions";

type Props = {
  /** The story whose own attachments are offered. */
  idStory: number;
  /** The scene they are added to. */
  idStoryScene: number;
  /** The ids that moved, once they have, so a list of the scene's can reload. */
  onAttached?: (ids: number[]) => void;
};

// The same pause the board's search boxes take, so a word asks once.
const SEARCH_DELAY_MS = 250;

// What can be moved: the story's own attachments that have a picture to show
// and are not its cover, which stays where it is. The action applies the
// same rule again.
const pickable = (rows: Attachment[]) =>
  rows.filter((row) => row.status === "READY" && !row.isCover && row.url !== null);

/**
 * A fold that offers a story's own attachments to one of its scenes. Closed
 * to begin with, and nothing is fetched until it is first opened: most visits
 * to a scene never want it.
 *
 * Opened, it lists the story's attachments that are not its cover, narrowed
 * by a search box that goes to the database (attachments.search_text, as the
 * board's Attachments column does). Any number can be ticked, and the button
 * under them moves the ticked ones onto the scene: they leave the story's
 * list and join the scene's.
 */
export function StoryAttachmentPicker({ idStory, idStoryScene, onAttached }: Props) {
  const [opened, setOpened] = useState(false);
  const [rows, setRows] = useState<Attachment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The ids the search matched; null shows every row.
  const [shownIds, setShownIds] = useState<ReadonlySet<number> | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [isMoving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      setRows(pickable(await sa_listAttachments("STORY", idStory)));
    } catch {
      setLoadError("Could not load the story's attachments.");
    }
  }

  function onValueChange(value: string[]) {
    if (value.includes("picker") && !opened) {
      setOpened(true);
      void load();
    }
  }

  // Which search is the latest, so a slow reply to an earlier one does not
  // land on top of what the box says now.
  const searchSeq = useRef(0);
  useEffect(() => {
    if (!opened) return;
    const needle = query.trim();
    const seq = ++searchSeq.current;
    if (needle === "") {
      const timer = setTimeout(() => setShownIds(null), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(async () => {
      try {
        const ids = await sa_searchAttachments("STORY", idStory, needle);
        if (seq === searchSeq.current) setShownIds(new Set(ids));
      } catch {
        // Leave the last results in place; the next keystroke tries again.
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [opened, idStory, query]);

  function toggle(id: number, checked: boolean) {
    setNotice(null);
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onAdd() {
    const ids = [...selected];
    setMoving(true);
    setMoveError(null);
    setNotice(null);
    try {
      const result = await sa_moveStoryAttachmentsToScene(idStoryScene, ids);
      if (!result.ok) {
        setMoveError(result.error);
        return;
      }
      const moved = new Set(result.moved);
      setRows((current) => current?.filter((row) => !moved.has(row.idAttachment)) ?? current);
      setSelected(new Set());
      // A row that changed since the list loaded stays put; say how many did go.
      setNotice(
        result.moved.length === ids.length
          ? `Added ${ids.length} to this scene.`
          : `Added ${result.moved.length} of ${ids.length}; the rest had changed and stayed with the story.`,
      );
      if (result.moved.length > 0) onAttached?.(result.moved);
    } catch {
      setMoveError("Could not add them to the scene.");
    } finally {
      setMoving(false);
    }
  }

  const shown = rows?.filter((row) => shownIds === null || shownIds.has(row.idAttachment)) ?? [];

  return (
    <Accordion.Root
      collapsible
      size="sm"
      variant="enclosed"
      onValueChange={(details) => onValueChange(details.value)}
    >
      <Accordion.Item value="picker">
        <Accordion.ItemTrigger>
          <Text flex="1" textStyle="sm">
            Add from the story&apos;s attachments
          </Text>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>
        <Accordion.ItemContent>
          <Accordion.ItemBody>
            <Stack gap="3">
              {loadError ? (
                <Alert.Root role="alert" status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{loadError}</Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              ) : rows === null ? (
                <Grid templateColumns="repeat(3, 1fr)" gap="2">
                  <Skeleton h="16" />
                  <Skeleton h="16" />
                  <Skeleton h="16" />
                </Grid>
              ) : rows.length === 0 ? (
                <Text textStyle="sm" color="fg.muted">
                  The story has no other attachments to add.
                </Text>
              ) : (
                <>
                  <InputGroup startElement={<Search size={14} />}>
                    <Input
                      type="search"
                      size="sm"
                      aria-label="Search the story's attachments"
                      placeholder="Search the story's attachments"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </InputGroup>

                  {shown.length === 0 ? (
                    <Text textStyle="sm" color="fg.muted">
                      No matches.
                    </Text>
                  ) : (
                    <Grid
                      as="ul"
                      listStyleType="none"
                      templateColumns="repeat(auto-fill, minmax(6rem, 1fr))"
                      gap="2"
                    >
                      {shown.map((row) => {
                        const name = row.fileName ?? row.url!;
                        return (
                          <Box as="li" key={row.idAttachment}>
                            <Checkbox.Root
                              checked={selected.has(row.idAttachment)}
                              onCheckedChange={(details) =>
                                toggle(row.idAttachment, details.checked === true)
                              }
                              display="flex"
                              flexDirection="column"
                              alignItems="stretch"
                              gap="1"
                              position="relative"
                              cursor="pointer"
                            >
                              <Checkbox.HiddenInput />
                              {/* Decoration: the label under it names the file. */}
                              <Image
                                src={row.url!}
                                alt=""
                                h="16"
                                w="full"
                                objectFit="cover"
                                rounded="sm"
                              />
                              <Checkbox.Control position="absolute" top="1" left="1" bg="bg" />
                              <Checkbox.Label textStyle="xs" color="fg.muted" truncate>
                                {name}
                              </Checkbox.Label>
                            </Checkbox.Root>
                          </Box>
                        );
                      })}
                    </Grid>
                  )}
                </>
              )}

              {moveError && (
                <Alert.Root role="alert" status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{moveError}</Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              )}
              {notice && (
                <Text role="status" textStyle="sm" color="fg.muted">
                  {notice}
                </Text>
              )}

              {rows !== null && rows.length > 0 && (
                <Box>
                  <Button
                    size="sm"
                    onClick={onAdd}
                    disabled={selected.size === 0}
                    loading={isMoving}
                  >
                    {selected.size === 0
                      ? "Add to this scene"
                      : `Add ${selected.size} to this scene`}
                  </Button>
                </Box>
              )}
            </Stack>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}
