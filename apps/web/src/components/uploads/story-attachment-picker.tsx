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
import { ATTACH_HOLDER_NOUNS, type AttachHolderKind, type Attachment } from "@/lib/attachments";
import { sa_attachToHolder, sa_listAttachments, sa_searchAttachments } from "./actions";

type Props = {
  /** The story whose own attachments are offered. */
  idStory: number;
  /** What they are added to: a scene, or an element's link to one. */
  holder: { kind: AttachHolderKind; idExternal: number };
  /** The ids now attached, once they are, so a list of the scene's can reload. */
  onAttached?: (ids: number[]) => void;
  /**
   * Open from the start, listing at once: for a holder that shows the fold
   * only once a + has been pressed, such as the element panel's Other
   * images, where a second press to open it would be one too many.
   */
  defaultOpen?: boolean;
};

// The same pause the board's search boxes take, so a word asks once.
const SEARCH_DELAY_MS = 250;

// What can be attached: the story's pictures that have something to show.
// The action applies the same rule again.
const pickable = (rows: Attachment[]) =>
  rows.filter((row) => row.status === "READY" && row.url !== null);

/**
 * A fold that offers a story's own attachments to one of its holders: a
 * scene, on the prep board, or an element's link to a scene, in the run
 * page's element panel. Closed to begin with unless `defaultOpen`, and
 * nothing is fetched until it is first opened: most visits to a scene never
 * want it.
 *
 * Opened, it lists the story's pictures, narrowed by a search box that goes
 * to the database (attachments.search_text, as the board's Attachments
 * column does). Any number can be ticked, and the button under them attaches
 * the ticked ones to the holder: the holder gets a use of each, and they
 * stay the story's.
 */
export function StoryAttachmentPicker({ idStory, holder, onAttached, defaultOpen = false }: Props) {
  const noun = ATTACH_HOLDER_NOUNS[holder.kind];
  const [opened, setOpened] = useState(defaultOpen);
  const [rows, setRows] = useState<Attachment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The ids the search matched; null shows every row.
  const [shownIds, setShownIds] = useState<ReadonlySet<number> | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [isMoving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Fetched once the fold is first opened, which for `defaultOpen` is as
  // this mounts; a fold closed and opened again keeps what it had.
  useEffect(() => {
    if (!opened) return;
    let live = true;
    sa_listAttachments("STORY", idStory)
      .then((rows) => live && setRows(pickable(rows)))
      .catch(() => live && setLoadError("Could not load the story's attachments."));
    return () => {
      live = false;
    };
  }, [opened, idStory]);

  function onValueChange(value: string[]) {
    if (value.includes("picker")) setOpened(true);
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
      const result = await sa_attachToHolder(holder.kind, holder.idExternal, ids);
      if (!result.ok) {
        setMoveError(result.error);
        return;
      }
      const attached = new Set(result.attached);
      setRows((current) => current?.filter((row) => !attached.has(row.idAttachment)) ?? current);
      setSelected(new Set());
      // A row that changed since the list loaded, or that the holder had
      // already, is left alone; say how many did go.
      setNotice(
        result.attached.length === ids.length
          ? `Added ${ids.length} to this ${noun}.`
          : `Added ${result.attached.length} of ${ids.length}; the rest had changed or were in the ${noun} already.`,
      );
      if (result.attached.length > 0) onAttached?.(result.attached);
    } catch {
      setMoveError(`Could not add them to the ${noun}.`);
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
      defaultValue={defaultOpen ? ["picker"] : []}
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
                      ? `Add to this ${noun}`
                      : `Add ${selected.size} to this ${noun}`}
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
