"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  Box,
  HStack,
  Image,
  Input,
  InputGroup,
  List,
  SegmentGroup,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { ArrowRight, Plus, Search } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import { ELEMENT_SEARCH_DELAY_MS } from "@/lib/elements";
import {
  attachmentLabel,
  RUN_LIBRARY_TABS,
  RUN_LIST_SIZE,
  type PlayItem,
  type RunLibrarySource,
} from "@/lib/run";
import { sa_listStoryElements } from "@/app/(app)/(nav)/libraries/actions";
import { sa_searchAttachments } from "@/components/uploads/actions";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { AttachmentListField } from "@/components/uploads/attachment-list-field";
import { AttachmentCoverButton } from "@/components/uploads/attachment-cover-button";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { AttachmentTagsPopover } from "@/components/uploads/attachment-tags-popover";

type Props = {
  idStory: number;
  /** The scene the table is on, whose attachments the Scene switch shows; null for none. */
  idStoryScene: number | null;
  /** Called with an item when its arrow is pressed, to put it in the play space. */
  onAdd: (item: PlayItem) => void;
};

/** Whose attachments the Attachments tab lists: the story's own, or the scene's. */
type AttachmentsOf = "STORY" | "STORY_SCENE";

/**
 * The storyteller's library at the table: one search box over a tab for the
 * story's attachments and one for each kind of element, each listing the
 * first RUN_LIST_SIZE matches with an arrow that puts the item in the play
 * space.
 *
 * The search is the Prep Work board's: it goes to the database, against each
 * table's search_text, after the same pause, rather than matching what the
 * list happens to show. One box serves every tab, so what the storyteller
 * typed still holds when they look under another one. Only the tab in view
 * asks for anything.
 *
 * The Attachments tab switches between the story's own attachments and the
 * scene's, Story on the left and Scene on the right; with no scene at the
 * table there is only the story's. The + adds to whichever is showing. The
 * list itself is RunAttachments, below.
 */
export function RunLibrary({ idStory, idStoryScene, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<RunLibrarySource>("ATTACHMENT");
  // An element tab's matches; null while it is loading.
  const [items, setItems] = useState<PlayItem[] | null>(null);
  const [attachmentsOf, setAttachmentsOf] = useState<AttachmentsOf>("STORY");
  // Whether the +'s link input and dropzone are showing.
  const [adding, setAdding] = useState(false);

  // The latest request, so a slow reply for an earlier query or tab does not
  // land on top of what the panel shows now.
  const seq = useRef(0);
  // The query the last request was made with, so a keystroke waits out the
  // pause and a change of tab asks at once.
  const lastNeedle = useRef("");

  const needle = query.trim();

  // The scene's, only while there is a scene to show; the story's otherwise,
  // so the table moving off a scene falls back rather than showing nothing.
  const holder =
    attachmentsOf === "STORY_SCENE" && idStoryScene !== null
      ? { kind: "STORY_SCENE" as const, idExternal: idStoryScene }
      : { kind: "STORY" as const, idExternal: idStory };

  useEffect(() => {
    // The Attachments tab searches for itself; see RunAttachments.
    if (tab === "ATTACHMENT") return;
    const mine = ++seq.current;
    const delay = needle === lastNeedle.current ? 0 : ELEMENT_SEARCH_DELAY_MS;
    lastNeedle.current = needle;

    const timer = setTimeout(async () => {
      try {
        const found = await loadElements(idStory, tab, needle);
        if (mine === seq.current) setItems(found);
      } catch {
        // Leave the last results in place; the next keystroke tries again.
        if (mine === seq.current) setItems((current) => current ?? []);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [idStory, tab, needle]);

  return (
    <Stack gap="3" h="full" minH="0">
      <InputGroup startElement={<Search size={14} />}>
        <Input
          type="search"
          size="sm"
          aria-label="Search the library"
          placeholder="Search the library"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>

      <Tabs.Root
        value={tab}
        onValueChange={(details) => {
          setItems(null);
          setTab(details.value as RunLibrarySource);
        }}
        size="sm"
        variant="line"
        lazyMount
        unmountOnExit
        display="flex"
        flexDirection="column"
        flex="1"
        minH="0"
      >
        {/* Six tabs do not fit a narrow panel, so the row scrolls sideways
            rather than wrapping onto a second line. */}
        <Tabs.List overflowX="auto" flexShrink="0">
          {RUN_LIBRARY_TABS.map(({ source, title }) => (
            <Tabs.Trigger key={source} value={source} flexShrink="0">
              {title}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {RUN_LIBRARY_TABS.map(({ source }) => (
          <Tabs.Content key={source} value={source} flex="1" minH="0" overflowY="auto">
            {source === "ATTACHMENT" ? (
              <Stack gap="3">
                <HStack justify="space-between">
                  <SegmentGroup.Root
                    size="xs"
                    aria-label="Whose attachments"
                    value={holder.kind}
                    onValueChange={(details) => setAttachmentsOf(details.value as AttachmentsOf)}
                  >
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Items
                      items={[
                        { value: "STORY", label: "Story" },
                        { value: "STORY_SCENE", label: "Scene", disabled: idStoryScene === null },
                      ]}
                    />
                  </SegmentGroup.Root>
                  <PrepIconButton
                    label="New attachment"
                    onClick={() => setAdding((open) => !open)}
                    expanded={adding}
                  >
                    <Plus />
                  </PrepIconButton>
                </HStack>
                {/* Keyed by whose they are, so a switch starts from that
                    holder's own rows and search rather than the last one's. */}
                <RunAttachments
                  key={`${holder.kind}:${holder.idExternal}`}
                  kind={holder.kind}
                  idExternal={holder.idExternal}
                  needle={needle}
                  showAdd={adding}
                  onAdd={onAdd}
                />
              </Stack>
            ) : (
              <LibraryList items={items} filtered={needle !== ""} onAdd={onAdd} />
            )}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </Stack>
  );
}

/**
 * The Attachments tab's list, for the story or for a scene: the board's
 * Attachments column made compact. It is AttachmentListField throughout,
 * drawn through its renderRows: the field loads the attachments, runs every
 * upload, applies the search (keeping one added since the search ran) and
 * holds the tags and the cover, and this lists its rows one to a line with
 * the card's own tags popover and Cover button beside each. So an attachment
 * added, tagged or made the cover here shows at once, as on its card. The
 * + opens the field's link input and dropzone; the field stays mounted with
 * the + closed, so an upload in flight carries on.
 *
 * The search narrows the rows by the ids it returns, as the column's does;
 * a story or scene holds at most MAX_ATTACHMENTS of them.
 */
function RunAttachments({
  kind,
  idExternal,
  needle,
  showAdd,
  onAdd,
}: {
  kind: AttachmentsOf;
  idExternal: number;
  needle: string;
  showAdd: boolean;
  onAdd: (item: PlayItem) => void;
}) {
  // The ids the search matched, or null with nothing typed.
  const [matchedIds, setMatchedIds] = useState<ReadonlySet<number> | null>(null);

  const seq = useRef(0);
  // Empty at first, so a query already typed when this mounts asks at once
  // rather than after the pause.
  const lastNeedle = useRef("");

  useEffect(() => {
    const mine = ++seq.current;
    const delay = needle === lastNeedle.current ? 0 : ELEMENT_SEARCH_DELAY_MS;
    lastNeedle.current = needle;
    const timer = setTimeout(async () => {
      try {
        const ids =
          needle === "" ? null : new Set(await sa_searchAttachments(kind, idExternal, needle));
        if (mine === seq.current) setMatchedIds(ids);
      } catch {
        // Leave the last results in place; the next keystroke tries again.
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [kind, idExternal, needle]);

  return (
    <AttachmentListField
      kind={kind}
      idExternal={idExternal}
      showAdd={showAdd}
      shownIds={matchedIds}
      renderRows={({ rows, hasLoaded, setTags, setCover }) => {
        const shown = rows.slice(0, RUN_LIST_SIZE);
        const byKey = new Map(shown.map((row) => [`ATTACHMENT:${row.idAttachment}`, row]));
        return (
          <LibraryList
            items={hasLoaded ? shown.map(attachmentItem) : null}
            filtered={needle !== ""}
            onAdd={onAdd}
            editTagsFor={(item) => {
              const row = byKey.get(item.key);
              if (!row) return undefined;
              return {
                canCover: row.status === "READY",
                onTagsChange: (tags) => setTags(row.idAttachment, tags),
                onCoverChange: (isCover) => setCover(row.idAttachment, isCover),
              };
            }}
            renderActions={(item) => {
              const row = byKey.get(item.key);
              if (!row) return null;
              return (
                <>
                  <AttachmentTagsPopover
                    label={item.label}
                    tags={row.tags}
                    isCover={row.isCover}
                    canCover={row.status === "READY"}
                    onTagsChange={(tags) => setTags(row.idAttachment, tags)}
                    onCoverChange={(isCover) => setCover(row.idAttachment, isCover)}
                  />
                  {row.status === "READY" && (
                    <AttachmentCoverButton
                      compact
                      label={item.label}
                      isCover={row.isCover}
                      onToggle={() => void setCover(row.idAttachment, !row.isCover)}
                    />
                  )}
                </>
              );
            }}
          />
        );
      }}
    />
  );
}

function LibraryList({
  items,
  filtered,
  onAdd,
  renderActions,
  editTagsFor,
}: {
  items: PlayItem[] | null;
  filtered: boolean;
  onAdd: (item: PlayItem) => void;
  /** Controls drawn before an item's arrow: the attachments' tags and Cover. */
  renderActions?: (item: PlayItem) => ReactNode;
  /** An attachment's tag handlers, so its full-size preview edits them too. */
  editTagsFor?: (item: PlayItem) => ComponentProps<typeof AttachmentPreview>["editTags"];
}) {
  if (items === null) return <Text color="fg.muted">Loading…</Text>;
  if (items.length === 0) {
    return <Text color="fg.muted">{filtered ? "No matches." : "Nothing here yet."}</Text>;
  }

  return (
    // Full width: inside the attachments field the list sits in a column that
    // does not stretch its children, and at its content's width a long name
    // would push the controls out of the panel instead of truncating.
    <List.Root listStyleType="none" gap="2" w="full">
      {items.map((item) => (
        <List.Item key={item.key}>
          <HStack gap="2" align="center">
            {item.imageUrl &&
              (item.attachment ? (
                // An attachment's picture opens full size with its tags, the
                // same preview its card on the library page opens.
                <Box boxSize="8" flexShrink="0" rounded="sm" overflow="hidden" bg="bg.muted">
                  <AttachmentPreview
                    url={item.imageUrl}
                    label={item.label}
                    tags={item.attachment.tags}
                    isCover={item.attachment.isCover}
                    editTags={editTagsFor?.(item)}
                  />
                </Box>
              ) : (
                // Decoration beside the name, which says what it is.
                <Image src={item.imageUrl} alt="" boxSize="8" rounded="sm" objectFit="cover" />
              ))}
            <Stack gap="0" flex="1" minW="0">
              <Text fontWeight="medium" truncate>
                {item.label}
              </Text>
              {item.detail && (
                <Text fontSize="sm" color="fg.muted" truncate>
                  {item.detail}
                </Text>
              )}
            </Stack>
            {renderActions?.(item)}
            {/* An attachment with no picture yet has nothing to put in play. */}
            {(item.kind !== "ATTACHMENT" || item.imageUrl !== null) && (
              <PrepIconButton
                label={`Add ${item.label} to the play space`}
                onClick={() => onAdd(item)}
              >
                <ArrowRight />
              </PrepIconButton>
            )}
          </HStack>
        </List.Item>
      ))}
    </List.Root>
  );
}

/** The first RUN_LIST_SIZE of a kind's elements that match, as play items. */
async function loadElements(
  idStory: number,
  kind: Exclude<RunLibrarySource, "ATTACHMENT">,
  needle: string,
): Promise<PlayItem[]> {
  // The action pages by ELEMENTS_PAGE_SIZE, which is RUN_LIST_SIZE, so the
  // first page is the list.
  const elements = await sa_listStoryElements(idStory, kind, 0, needle);
  return elements.slice(0, RUN_LIST_SIZE).map((element) => ({
    key: `${kind}:${element.idElement}`,
    kind,
    label: element.name,
    detail: element.title,
    imageUrl: null,
  }));
}

/**
 * One attachment as a library item. A row with no address yet says what is
 * happening to it in place of a picture, as its card does.
 */
function attachmentItem(row: Attachment): PlayItem {
  return {
    key: `ATTACHMENT:${row.idAttachment}`,
    kind: "ATTACHMENT",
    label: attachmentLabel(row),
    detail: row.url !== null ? null : row.status === "ERROR" ? "Upload failed" : "Uploading…",
    imageUrl: row.url,
    attachment: { tags: row.tags, isCover: row.isCover },
  };
}
