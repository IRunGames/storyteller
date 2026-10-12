"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  Box,
  HStack,
  IconButton,
  Image,
  Input,
  InputGroup,
  List,
  Portal,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ArrowLeft, ArrowRight, Plus, Search } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import { ELEMENT_SEARCH_DELAY_MS } from "@/lib/elements";
import {
  attachmentLabel,
  elementIdOf,
  RUN_LIBRARY_TABS,
  RUN_LIST_SIZE,
  type ElementDetail,
  type PlayItem,
  type RunLibrarySource,
} from "@/lib/run";
import { sa_listStoryElements } from "@/app/(app)/(nav)/libraries/actions";
import { sa_listSceneLibraryElements } from "@/app/(app)/run/[id]/actions";
import {
  sa_moveSceneAttachmentsToStory,
  sa_moveStoryAttachmentsToScene,
  sa_moveStoryAttachmentToSceneCover,
  sa_searchAttachments,
} from "@/components/uploads/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { AttachmentListField } from "@/components/uploads/attachment-list-field";
import { AttachmentCoverButton } from "@/components/uploads/attachment-cover-button";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { AttachmentTagsPopover } from "@/components/uploads/attachment-tags-popover";
import { RunElementInfoPopover } from "./run-element-info-popover";
import { RunNewElementPopover } from "./run-new-element-popover";

type Props = {
  idStory: number;
  /** The scene the table is on, whose attachments the Scene switch shows; null for none. */
  idStoryScene: number | null;
  /**
   * The All / Scene only switch: the element tabs list only the elements
   * linked to the scene. Ignored with no scene at the table.
   */
  sceneOnly: boolean;
  /** Called with an element when its arrow is pressed, to put it in the play space. */
  onAdd: (item: PlayItem) => void;
  /** An element has been taken out of the scene from its info popover; its id. */
  onRemovedFromScene: (idElement: number) => void;
  /** An element made from a tab's +, already linked to the scene, for the play space. */
  onCreated: (item: PlayItem) => void;
  /** An element's picture changed from its info popover, for its pill if it is in play. */
  onImageChange: (idElement: number, imageUrl: string | null) => void;
  /** An element edited from its info popover, as it now is, for its pill if it is in play. */
  onElementEdited: (element: ElementDetail) => void;
  /** An element in the scene edited from its info popover, as its pill now is. */
  onItemChange: (item: PlayItem) => void;
  /** An element's status in the scene moved from its info popover; its item's key. */
  onSceneStatusChange: (key: string, status: string) => void;
  /** The footer's In select: the stack a tab's + files the new element under. */
  stackTag: string | null;
  /**
   * The scene is complete: nothing may go into it or come out of it, so the
   * arrows, the element tabs' + and Remove from scene are left out.
   */
  locked: boolean;
  /** The scene's cover has changed from here: its url, or null for none. */
  onSceneCoverChange: (url: string | null) => void;
};

/** Whose attachments the Attachments tab lists: the story's own, or the scene's. */
type AttachmentsOf = "STORY" | "STORY_SCENE";

/**
 * The storyteller's library at the table: one search box over a tab for the
 * story's attachments and one for each kind of element, each listing the
 * first RUN_LIST_SIZE matches with an arrow that puts the item in the play
 * space. An element also has an info button, whose popover shows everything
 * about it: the same panel a pill's opens (RunElementInfoPopover), with the
 * scene's part only for an element in the scene. With Scene only on, the element tabs
 * list only the scene's elements (sa_listSceneLibraryElements) and the
 * Attachments tab the scene's own attachments; with All, the story's.
 *
 * The search is the Prep Work board's: it goes to the database, against each
 * table's search_text, after the same pause, rather than matching what the
 * list happens to show. One box serves every tab, so what the storyteller
 * typed still holds when they look under another one. Only the tab in view
 * asks for anything.
 *
 * The Attachments tab lists the story's own attachments, or with Scene only
 * the scene's; with no scene at the table there is only the story's. The +
 * adds to whichever is showing. The list itself is RunAttachments, below.
 */
export function RunLibrary({
  idStory,
  idStoryScene,
  sceneOnly,
  onAdd,
  onRemovedFromScene,
  onCreated,
  onImageChange,
  onElementEdited,
  onItemChange,
  onSceneStatusChange,
  stackTag,
  locked,
  onSceneCoverChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<RunLibrarySource>("ATTACHMENT");
  // An element tab's matches; null while it is loading.
  const [items, setItems] = useState<PlayItem[] | null>(null);
  // Whether the +'s link input and dropzone are showing.
  const [adding, setAdding] = useState(false);
  // Bumped when an attachment moves between the story and the scene, so the
  // list loads again without it.
  const [moves, setMoves] = useState(0);
  // Bumped when an element is made from a tab's + or edited from its info
  // popover, so the tab lists it as it now is.
  const [created, setCreated] = useState(0);

  // The latest request, so a slow reply for an earlier query or tab does not
  // land on top of what the panel shows now.
  const seq = useRef(0);
  // The query the last request was made with, so a keystroke waits out the
  // pause and a change of tab asks at once.
  const lastNeedle = useRef("");

  const needle = query.trim();
  // The scene the element tabs are narrowed to, or null for the whole story.
  const onlyScene = sceneOnly ? idStoryScene : null;

  // The Attachments tab follows the same switch: the scene's own attachments
  // with Scene only, the story's otherwise. onlyScene is null with no scene
  // at the table, so the table moving off a scene falls back to the story's
  // rather than showing nothing.
  const holder =
    onlyScene !== null
      ? { kind: "STORY_SCENE" as const, idExternal: onlyScene }
      : { kind: "STORY" as const, idExternal: idStory };

  useEffect(() => {
    // The Attachments tab searches for itself; see RunAttachments.
    if (tab === "ATTACHMENT") return;
    const mine = ++seq.current;
    const delay = needle === lastNeedle.current ? 0 : ELEMENT_SEARCH_DELAY_MS;
    lastNeedle.current = needle;

    const timer = setTimeout(async () => {
      try {
        const found = await loadElements(idStory, onlyScene, tab, needle);
        if (mine === seq.current) setItems(found);
      } catch {
        // Leave the last results in place; the next keystroke tries again.
        if (mine === seq.current) setItems((current) => current ?? []);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [idStory, onlyScene, tab, needle, created]);

  return (
    // flex 1 and minH 0 down to the tab panel, which is what scrolls: each
    // level must be allowed to be shorter than its content, or the list
    // grows the panel instead of scrolling inside it.
    <Stack gap="3" flex="1" minH="0">
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
        // The tab's + floats at its bottom right corner, over the list.
        position="relative"
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
          // Room at the foot of the list, so the floating + never covers
          // its last row once it has scrolled to the end.
          <Tabs.Content key={source} value={source} flex="1" minH="0" overflowY="auto" pb="14">
            {source === "ATTACHMENT" ? (
              <Stack gap="3">
                {/* Keyed by whose they are, so a switch starts from that
                    holder's own rows and search rather than the last one's. */}
                <RunAttachments
                  key={`${holder.kind}:${holder.idExternal}:${moves}`}
                  kind={holder.kind}
                  idExternal={holder.idExternal}
                  idStoryScene={idStoryScene}
                  locked={locked}
                  needle={needle}
                  showAdd={adding}
                  onSceneCoverChange={onSceneCoverChange}
                  onMoved={() => setMoves((count) => count + 1)}
                />
              </Stack>
            ) : (
              <LibraryList
                items={items}
                filtered={needle !== ""}
                onAdd={locked ? undefined : onAdd}
                renderActions={(item) => (
                  <RunElementInfoPopover
                    idStory={idStory}
                    idElement={elementIdOf(item)}
                    label={item.label}
                    idStoryScene={idStoryScene}
                    placement="right-start"
                    locked={locked}
                    onSceneStatusChange={(status) => onSceneStatusChange(item.key, status)}
                    onItemChange={(changed) => {
                      onItemChange(changed);
                      // Edited in the scene: the tab lists afresh, as below.
                      setCreated((count) => count + 1);
                    }}
                    onImageChange={(imageUrl) => onImageChange(elementIdOf(item), imageUrl)}
                    onEdited={(element) => {
                      onElementEdited(element);
                      // Its name, title or kind may have changed, so the
                      // tab lists afresh: it may now be elsewhere in it, or
                      // under another tab.
                      setCreated((count) => count + 1);
                    }}
                    onRemovedFromScene={() => {
                      onRemovedFromScene(elementIdOf(item));
                      // Out of the scene, so out of a list of the scene's.
                      if (onlyScene !== null) {
                        setItems((current) =>
                          current ? current.filter((each) => each.key !== item.key) : current,
                        );
                      }
                    }}
                  />
                )}
              />
            )}
          </Tabs.Content>
        ))}
        {/* One + for the tab in view, round and solid at the bottom right,
            each making what its tab lists the way it is made elsewhere:
            the Attachments tab opens the attachments field's link input
            and dropzone above the list, as the board's column does; an
            element tab opens the stack's form in a popover, starting on
            the tab's kind, and the element is linked to the scene and put
            in the play space. With no scene there is nothing to link to,
            so the element tabs have no +. */}
        <Box position="absolute" bottom="2" right="2">
          {tab === "ATTACHMENT" ? (
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                <IconButton
                  aria-label="New attachment"
                  aria-expanded={adding}
                  size="md"
                  rounded="full"
                  boxShadow="md"
                  onClick={() => setAdding((open) => !open)}
                >
                  <Plus />
                </IconButton>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>New attachment</Tooltip.Content>
                </Tooltip.Positioner>
              </Portal>
            </Tooltip.Root>
          ) : (
            idStoryScene !== null &&
            !locked && (
              <RunNewElementPopover
                key={tab}
                idStory={idStory}
                idStoryScene={idStoryScene}
                tag={stackTag}
                title="the scene"
                kind={tab}
                floating
                onCreated={(item) => {
                  onCreated(item);
                  setCreated((count) => count + 1);
                }}
              />
            )
          )}
        </Box>
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
 *
 * The story's own cover is left out of the story's list: it is the
 * picture on the story's card, not material for the table.
 *
 * An attachment's arrow moves it between the story and the scene the table
 * is on: from the story's list to the scene (sa_moveStoryAttachmentsToScene)
 * and from the scene's back to the story (sa_moveSceneAttachmentsToStory),
 * so the storyteller files what a scene needs as it comes up. With no scene
 * at the table a story attachment has nowhere to go and shows no arrow.
 *
 * At the table, a scene's cover is the picture behind the play space. So
 * while the table is on a scene, Cover on one of the story's attachments
 * does not make it the story's cover: it moves it to the scene and makes it
 * the scene's (sa_moveStoryAttachmentToSceneCover). Cover on the scene's
 * attachments is the plain toggle, and the play space follows it.
 */
function RunAttachments({
  kind,
  idExternal,
  idStoryScene,
  locked,
  needle,
  showAdd,
  onSceneCoverChange,
  onMoved,
}: {
  kind: AttachmentsOf;
  idExternal: number;
  idStoryScene: number | null;
  /** The scene is complete: no attachment moves into it or out of it. */
  locked: boolean;
  needle: string;
  showAdd: boolean;
  onSceneCoverChange: (url: string | null) => void;
  onMoved: () => void;
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
      hideCovers={kind === "STORY"}
      renderRows={({ rows, hasLoaded, setTags, setCover }) => {
        const shown = rows.slice(0, RUN_LIST_SIZE);
        const byKey = new Map(shown.map((row) => [`ATTACHMENT:${row.idAttachment}`, row]));

        const movesToScene = (row: Attachment) =>
          kind === "STORY" && idStoryScene !== null && !locked && !row.isCover;

        // Every way the cover is changed from here: the button, the tags
        // popover and the full-size preview's.
        async function changeCover(row: Attachment, isCover: boolean): Promise<boolean> {
          if (isCover && movesToScene(row)) {
            try {
              const result = await sa_moveStoryAttachmentToSceneCover(
                idStoryScene!,
                row.idAttachment,
              );
              if (!result.ok) {
                toaster.create({ title: result.error, type: "error" });
                return false;
              }
              onSceneCoverChange(result.url);
              onMoved();
              toaster.create({ title: "Moved to the scene as its cover", type: "success" });
              return true;
            } catch {
              toaster.create({
                title: "The cover could not be changed. Try again.",
                type: "error",
              });
              return false;
            }
          }
          const ok = await setCover(row.idAttachment, isCover);
          if (ok && kind === "STORY_SCENE") onSceneCoverChange(isCover ? row.url : null);
          return ok;
        }

        // The arrow: to the scene from the story's list, back from the scene's.
        async function move(row: Attachment) {
          try {
            const result =
              kind === "STORY"
                ? await sa_moveStoryAttachmentsToScene(idStoryScene!, [row.idAttachment])
                : await sa_moveSceneAttachmentsToStory(idExternal, [row.idAttachment]);
            if (!result.ok) {
              toaster.create({ title: result.error, type: "error" });
              return;
            }
            if (!result.moved.includes(row.idAttachment)) {
              toaster.create({ title: "That attachment could not be moved.", type: "error" });
              return;
            }
            // The scene's cover goes back to the story as a plain attachment.
            if (kind === "STORY_SCENE" && row.isCover) onSceneCoverChange(null);
            onMoved();
          } catch {
            toaster.create({
              title: "The attachment could not be moved. Try again.",
              type: "error",
            });
          }
        }

        return (
          <LibraryList
            items={hasLoaded ? shown.map(attachmentItem) : null}
            filtered={needle !== ""}
            renderArrow={(item) => {
              const row = byKey.get(item.key);
              // Only a finished attachment moves, and a story's only to a scene.
              if (!row || row.status !== "READY" || locked) return null;
              if (kind === "STORY" && idStoryScene === null) return null;
              return kind === "STORY" ? (
                <PrepIconButton
                  label={`Move ${item.label} to the scene`}
                  onClick={() => void move(row)}
                >
                  <ArrowRight />
                </PrepIconButton>
              ) : (
                <PrepIconButton
                  label={`Move ${item.label} to the story`}
                  onClick={() => void move(row)}
                >
                  <ArrowLeft />
                </PrepIconButton>
              );
            }}
            editTagsFor={(item) => {
              const row = byKey.get(item.key);
              if (!row) return undefined;
              return {
                canCover: row.status === "READY",
                onTagsChange: (tags) => setTags(row.idAttachment, tags),
                onCoverChange: (isCover) => changeCover(row, isCover),
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
                    onCoverChange={(isCover) => changeCover(row, isCover)}
                  />
                  {row.status === "READY" && (
                    <AttachmentCoverButton
                      compact
                      label={item.label}
                      isCover={row.isCover}
                      onToggle={() => void changeCover(row, !row.isCover)}
                      hint={
                        movesToScene(row)
                          ? "Move to the scene and make it the scene's cover"
                          : undefined
                      }
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
  renderArrow,
  renderActions,
  editTagsFor,
}: {
  items: PlayItem[] | null;
  filtered: boolean;
  /** An element's arrow, which puts it in the play space. */
  onAdd?: (item: PlayItem) => void;
  /** In place of the element's arrow: an attachment's, which moves it. */
  renderArrow?: (item: PlayItem) => ReactNode;
  /**
   * Controls drawn before an item's arrow: an element's info button, an
   * attachment's tags and Cover.
   */
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
            {renderArrow
              ? renderArrow(item)
              : onAdd && (
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

/**
 * The first RUN_LIST_SIZE of a kind's elements that match, as play items:
 * the story's, or with `idStoryScene` only those linked to that scene.
 */
async function loadElements(
  idStory: number,
  idStoryScene: number | null,
  kind: Exclude<RunLibrarySource, "ATTACHMENT">,
  needle: string,
): Promise<PlayItem[]> {
  // sa_listStoryElements pages by ELEMENTS_PAGE_SIZE, which is RUN_LIST_SIZE,
  // so its first page is the list.
  const elements =
    idStoryScene === null
      ? await sa_listStoryElements(idStory, kind, 0, needle)
      : await sa_listSceneLibraryElements(idStory, idStoryScene, kind, needle);
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
