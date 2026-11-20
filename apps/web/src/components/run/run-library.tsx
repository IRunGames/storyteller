"use client";

import { useState } from "react";
import { Box, IconButton, Input, InputGroup, Portal, Stack, Tabs, Tooltip } from "@chakra-ui/react";
import { Plus, Search, X } from "lucide-react";
import type { ElementSort } from "@/lib/elements";
import { SEARCH_DELAY_MS } from "@/lib/search";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { elementIdOf, type LibraryItem, type RunLibrarySource } from "@/lib/scene-elements";
import { RUN_LIBRARY_TABS, RUN_LIST_SIZE, type AttachmentSort } from "@/lib/run";
import { sa_listStoryElements } from "@/components/prep/actions";
import { sa_listSceneLibraryElements } from "@/components/elements/actions";
import { RunElementInfoPopover } from "./run-element-info-popover";
import { RunNewElementPopover } from "./run-new-element-popover";
import { useSceneItemsContext } from "@/components/table-shell/scene-items-context";
import { RunAttachments } from "./run-library-attachments";
import { LibraryList } from "./run-library-list";

type Props = {
  idStory: number;
  /** The scene the table is on, whose attachments the Scene switch shows; null for none. */
  idStoryScene: number | null;
  /**
   * The tab in view. The table holds it rather than the library, because
   * the sort menu beside the table's Library heading offers the sorts for
   * whichever tab is showing.
   */
  tab: RunLibrarySource;
  onTabChange: (tab: RunLibrarySource) => void;
  /** The Attachments tab's order, from the table's sort menu. */
  attachmentSort: AttachmentSort;
  /** The element tabs' order, from the same menu. */
  elementSort: ElementSort;
  /**
   * The All / Scene only switch: the element tabs list only the elements
   * linked to the scene. Ignored with no scene at the table.
   */
  sceneOnly: boolean;
  /** Called with an element when its arrow is pressed, to put it in the play space. */
  onAdd: (item: LibraryItem) => void;
  /** The footer's In select: the stack a tab's + files the new element under. */
  stackTag: string | null;
  /** The scene's stacks, in order, for the info popover's stacks menu. */
  sceneStacks: string[];
  /**
   * The scene is complete: nothing may go into it or come out of it, so the
   * arrows, the element tabs' + and Remove from scene are left out.
   */
  locked: boolean;
  /** The scene's cover has changed from here: its url, or null for none. */
  onSceneCoverChange: (url: string | null) => void;
  /**
   * Bumped by the page when it changes the scene's pictures somewhere other
   * than this library, such as the scene editor's Pictures or the play
   * space's cover icon, so the Attachments tab reads them again rather than
   * showing a cover that has gone.
   */
  attachmentsVersion?: number;
};

/**
 * The storyteller's library at the table: one search box over a tab for the
 * story's attachments and one for each kind of element, each listing the
 * first RUN_LIST_SIZE matches with an arrow that puts the item in the play
 * space. An element also has an info button, whose popover shows everything
 * about it: the same panel a pill's opens (RunElementInfoPopover), with the
 * scene's part only for an element in the scene; what is changed there, and
 * what a tab's + makes, goes to the play space through the table's
 * SceneItemsProvider. With Scene only on, the element tabs
 * list only the scene's elements (sa_listSceneLibraryElements) and the
 * Attachments tab the scene's own attachments; with All, the story's.
 *
 * The search is the Prep Work board's: it goes to the database, against each
 * table's search_text, after the same pause, rather than matching what the
 * list happens to show. One box serves every tab, so what the storyteller
 * typed still holds when they look under another one. Only the tab in view
 * asks for anything. The element tabs list in the order the table's sort
 * menu holds for them, asked of the database since a tab shows only the
 * first page; the Attachments tab sorts its rows itself (RunAttachments).
 *
 * The Attachments tab lists the story's pictures, or with Scene only the
 * ones the scene uses; with no scene at the table there is only the story's.
 * The + adds to whichever is showing. The list itself is RunAttachments,
 * below.
 */
export function RunLibrary({
  idStory,
  idStoryScene,
  tab,
  onTabChange,
  attachmentSort,
  elementSort,
  sceneOnly,
  onAdd,
  stackTag,
  sceneStacks,
  locked,
  onSceneCoverChange,
  attachmentsVersion = 0,
}: Props) {
  const { put } = useSceneItemsContext();
  const [query, setQuery] = useState("");
  // An element tab's matches; null while it is loading.
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  // Whether the +'s link input and dropzone are showing.
  const [adding, setAdding] = useState(false);
  // Bumped when an attachment moves between the story and the scene, so the
  // list loads again without it.
  const [moves, setMoves] = useState(0);
  // Bumped when an element is made from a tab's + or edited from its info
  // popover, so the tab lists it as it now is.
  const [created, setCreated] = useState(0);

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

  // A keystroke waits out the pause; a change of tab or sort asks at once.
  // The Attachments tab searches for itself; see RunAttachments.
  useDebouncedSearch(
    async () => {
      if (tab === "ATTACHMENT") return null;
      try {
        return await loadElements(idStory, onlyScene, tab, needle, elementSort);
      } catch {
        // A failed load shows an empty list rather than Loading… for ever;
        // the next keystroke tries again.
        setItems((current) => current ?? []);
        return null;
      }
    },
    {
      key: `${idStory}|${onlyScene}|${tab}|${needle}|${created}|${elementSort}`,
      typed: needle,
      delay: SEARCH_DELAY_MS,
      enabled: tab !== "ATTACHMENT",
      onResult: (found) => found && setItems(found),
    },
  );

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
          onTabChange(details.value as RunLibrarySource);
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
                  key={`${holder.kind}:${holder.idExternal}:${moves}:${attachmentsVersion}`}
                  kind={holder.kind}
                  idExternal={holder.idExternal}
                  idStoryScene={idStoryScene}
                  locked={locked}
                  needle={needle}
                  sort={attachmentSort}
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
                    sceneStacks={sceneStacks}
                    // Edited in the scene or in the story: its name, title
                    // or kind may have changed, so the tab lists afresh: it
                    // may now be elsewhere in it, or under another tab.
                    onChanged={() => setCreated((count) => count + 1)}
                    onRemovedFromScene={() => {
                      // Out of the scene, so out of a list of the scene's; an
                      // element in it twice comes back when the list is read.
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
            so the element tabs have no +. While the attachments' input is
            open the + is a close button, since pressing it again is how
            the input goes away. */}
        <Box position="absolute" bottom="2" right="2">
          {tab === "ATTACHMENT" ? (
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                <IconButton
                  aria-label={adding ? "Close" : "New attachment"}
                  aria-expanded={adding}
                  size="md"
                  rounded="full"
                  boxShadow="md"
                  onClick={() => setAdding((open) => !open)}
                >
                  {adding ? <X /> : <Plus />}
                </IconButton>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>{adding ? "Close" : "New attachment"}</Tooltip.Content>
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
                  put(item);
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
 * The first RUN_LIST_SIZE of a kind's elements that match, in the sort
 * asked for, as play items: the story's, or with `idStoryScene` only those
 * linked to that scene.
 */
async function loadElements(
  idStory: number,
  idStoryScene: number | null,
  kind: Exclude<RunLibrarySource, "ATTACHMENT">,
  needle: string,
  sort: ElementSort,
): Promise<LibraryItem[]> {
  // sa_listStoryElements pages by ELEMENTS_PAGE_SIZE, which is RUN_LIST_SIZE,
  // so its first page is the list.
  const elements =
    idStoryScene === null
      ? await sa_listStoryElements(idStory, kind, 0, needle, undefined, sort)
      : await sa_listSceneLibraryElements(idStory, idStoryScene, kind, needle, sort);
  return elements.slice(0, RUN_LIST_SIZE).map((element) => ({
    key: `${kind}:${element.idElement}`,
    kind,
    label: element.name,
    detail: element.title,
    imageUrl: null,
  }));
}
