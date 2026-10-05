"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Link,
  Stack,
} from "@chakra-ui/react";
import { Maximize } from "lucide-react";
import type { ElementKind, StoryElement } from "@/lib/elements";
import type { StoryScene } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import {
  PREP_SESSIONS_PAGE_SIZE,
  type StoryCardData,
  type StorySession,
} from "@/lib/stories";
import { StorySessions } from "@/components/stories/story-sessions";
import {
  ELEMENT_COLUMNS,
  PREP_COLUMNS,
  type PrepColumnMode,
  type PrepColumnTitle,
} from "./prep-columns";
import { PrepAttachments } from "./prep-attachments";
import { PrepColumn } from "./prep-column";
import { PrepCreateDialog, type PrepCreating } from "./prep-create-dialog";
import { PrepElements } from "./prep-elements";
import { PrepScenes } from "./prep-scenes";

type Props = {
  story: StoryCardData;
  /** The first page of the story's sessions; the Timeline fetches the rest. */
  sessions: StorySession[];
  /** The first page of the story's scenes; the column fetches the rest. */
  scenes: StoryScene[];
  /** The first page of the story's elements of each kind; each column fetches the rest. */
  elements: Record<ElementKind, StoryElement[]>;
  /**
   * How many rows each column holds in all, for the number beside its
   * heading. A column left out shows no count.
   */
  counts: Partial<Record<PrepColumnTitle, number>>;
  /** The story_sessions, story_scenes and elements workflows, for the status pills. */
  sessionStatusOptions: StatusOption[];
  sceneStatusOptions: StatusOption[];
  elementStatusOptions: StatusOption[];
};

// The Attachments column's one pill over its search box. Not a status, but a
// pill like the status ones, so the column's filters read the same as its
// neighbours': on to begin with, outlined when switched off, and off leaves
// the story's cover out of the cards.
const COVERS_FILTER: StatusOption = {
  key: "COVER",
  label: "Covers",
  description: "Show the story's cover among its attachments",
  from: null,
};

const initialModes = Object.fromEntries(
  PREP_COLUMNS.map((column) => [column.title, "normal"]),
) as Record<PrepColumnTitle, PrepColumnMode>;

// The Prep Work page's body: the story's library, laid out as columns that
// run off the right and the bottom of the viewport. The board owns every
// column's mode because the modes constrain each other: two columns at two
// thirds of the width would not fit, so expanding one puts any other back,
// and a hidden column's button lives above the board rather than in it.
// The modes are page state only; they start over on every visit.
export function PrepBoard({
  story,
  sessions,
  scenes,
  elements,
  counts,
  sessionStatusOptions,
  sceneStatusOptions,
  elementStatusOptions,
}: Props) {
  const router = useRouter();
  const [modes, setModes] = useState(initialModes);
  // The Attachments column's + opens the link input and dropzone at the top of
  // the column, over the cards, and closes them again.
  const [addingAttachments, setAddingAttachments] = useState(false);
  // What the + of the Scenes or an element column has opened the dialog to
  // create, or null while it is shut.
  const [creating, setCreating] = useState<PrepCreating | null>(null);
  // Bumped for a column once something has been created in it, so it asks
  // the database again with whatever it is narrowed to; the counts come back
  // with the page through router.refresh().
  const [reloadKeys, setReloadKeys] = useState<Partial<Record<PrepColumnTitle, number>>>({});
  function created(title: PrepColumnTitle) {
    setCreating(null);
    setReloadKeys((current) => ({ ...current, [title]: (current[title] ?? 0) + 1 }));
    router.refresh();
  }
  // Where that column's adding controls are drawn: an empty box above its
  // filters, there only while they are open. The controls themselves stay
  // part of the attachments field, which owns the rows they add to and the
  // uploads in flight; it draws them into this box through a portal. A
  // callback ref into state, so the field re-renders once the box exists.
  const [attachmentAdderSlot, setAttachmentAdderSlot] =
    useState<HTMLDivElement | null>(null);
  // The Attachments column loads its own rows in the browser, so the page has
  // no count to hand down for it; the column reports one once it has them,
  // and again as rows are added or deleted there. Null until then, which
  // shows no count rather than a wrong one.
  const [attachmentCount, setAttachmentCount] = useState<number | null>(null);
  const shownCounts: Partial<Record<PrepColumnTitle, number>> =
    attachmentCount === null ? counts : { ...counts, Attachments: attachmentCount };

  function setMode(title: PrepColumnTitle, mode: PrepColumnMode) {
    setModes((current) => {
      const next = { ...current, [title]: mode };
      if (mode === "expanded") {
        for (const column of PREP_COLUMNS) {
          if (column.title !== title && next[column.title] === "expanded") {
            next[column.title] = "normal";
          }
        }
      }
      return next;
    });
  }

  // Which workflow each column's rows run through, for the status pills over
  // its search box. Every element column runs through the same one.
  const COLUMN_WORKFLOWS: Partial<Record<PrepColumnTitle, StatusOption[]>> = {
    Timeline: sessionStatusOptions,
    Scenes: sceneStatusOptions,
    Attachments: [COVERS_FILTER],
    ...Object.fromEntries(ELEMENT_COLUMNS.map((column) => [column.title, elementStatusOptions])),
  };

  const hidden = PREP_COLUMNS.filter(
    (column) => modes[column.title] === "hidden",
  );
  const visible = PREP_COLUMNS.filter(
    (column) => modes[column.title] !== "hidden",
  );

  return (
    <Stack flex="1" gap="4" py="6">
      {/* The title is the way back to the story, so it stays a link inside
          the one-line heading. */}
      {/* A hidden column's button sits on the heading's row, after the
          title, and the row wraps when there are more than fit beside it. */}
      <HStack gap="4" px="4" wrap="wrap" align="center">
        <Heading as="h1" size="2xl">
          Library (Game Prep) for{" "}
          <Link asChild>
            <NextLink href={`/stories/${story.idStory}`}>{story.title}</NextLink>
          </Link>
        </Heading>

        {hidden.length > 0 && (
          <HStack gap="2" wrap="wrap">
            {hidden.map((column) => (
              <Button
                key={column.title}
                aria-label={`Show ${column.title}`}
                variant="outline"
                size="sm"
                onClick={() => setMode(column.title, "normal")}
              >
                <Maximize />
                {column.title}
              </Button>
            ))}
          </HStack>
        )}
      </HStack>

      {/* The columns keep their width and overflow sideways, and each one
          runs as tall as its rows, so the page scrolls down past them. */}
      <Flex flex="1" overflowX="auto" align="stretch">
        {visible.map((column, index) => {
          const mode = modes[column.title] as Exclude<PrepColumnMode, "hidden">;
          return (
            <PrepColumn
              key={column.title}
              title={column.title}
              singular={column.singular}
              count={shownCounts[column.title] ?? null}
              statusOptions={COLUMN_WORKFLOWS[column.title]}
              filterLabel={
                column.title === "Attachments"
                  ? "Filter Attachments"
                  : undefined
              }
              mode={mode}
              width={column.width}
              expandable={column.expandable}
              creatable={column.creatable}
              bordered={index > 0}
              creating={
                column.title === "Attachments" ? addingAttachments : undefined
              }
              aboveFilters={
                column.title === "Attachments" && addingAttachments ? (
                  <Box
                    ref={setAttachmentAdderSlot}
                    data-testid="attachment-adder"
                  />
                ) : undefined
              }
              // Scenes are written on a page of their own, which comes back
              // here once saved. Creating rows is the next piece of work for
              // the element columns; their buttons are in place so the layout
              // is settled first.
              // Attachments add in place, at the top of their column; a scene
              // or an element is written in the dialog, which starts an
              // element as the kind of the column it was opened from.
              onCreate={() => {
                if (column.title === "Attachments") {
                  setAddingAttachments((open) => !open);
                } else if (column.title === "Scenes") {
                  setCreating({ type: "scene" });
                } else {
                  const elementColumn = ELEMENT_COLUMNS.find(
                    (candidate) => candidate.title === column.title,
                  );
                  if (elementColumn) setCreating({ type: "element", kind: elementColumn.kind });
                }
              }}
              onExpand={() => setMode(column.title, "expanded")}
              onShrink={() => setMode(column.title, "normal")}
              onHide={() => setMode(column.title, "hidden")}
            >
              {(filter) => {
                if (column.title === "Timeline") {
                  return (
                    <StorySessions
                      idStory={story.idStory}
                      initial={sessions}
                      pageSize={PREP_SESSIONS_PAGE_SIZE}
                      playerCount={story.playerCount}
                      filter={filter.query}
                      shownStatuses={filter.statuses}
                      statusOptions={sessionStatusOptions}
                      canEditStatus={story.isOwner}
                      showTitles
                    />
                  );
                }
                if (column.title === "Scenes") {
                  return (
                    <PrepScenes
                      idStory={story.idStory}
                      initial={scenes}
                      reloadKey={reloadKeys.Scenes ?? 0}
                      filter={filter.query}
                      shownStatuses={filter.statuses}
                      statusOptions={sceneStatusOptions}
                      canEdit={story.isOwner}
                    />
                  );
                }
                if (column.title === "Attachments") {
                  return (
                    <PrepAttachments
                      idStory={story.idStory}
                      filter={filter.query}
                      showCovers={filter.statuses.includes(COVERS_FILTER.key)}
                      showAdd={addingAttachments}
                      addTarget={attachmentAdderSlot}
                      onCountChange={setAttachmentCount}
                    />
                  );
                }
                const elementColumn = ELEMENT_COLUMNS.find(
                  (candidate) => candidate.title === column.title,
                );
                if (!elementColumn) return null;
                return (
                  <PrepElements
                    idStory={story.idStory}
                    kind={elementColumn.kind}
                    initial={elements[elementColumn.kind]}
                    reloadKey={reloadKeys[elementColumn.title] ?? 0}
                    filter={filter.query}
                    shownStatuses={filter.statuses}
                    statusOptions={elementStatusOptions}
                    canEdit={story.isOwner}
                  />
                );
              }}
            </PrepColumn>
          );
        })}
      </Flex>

      <PrepCreateDialog
        idStory={story.idStory}
        creating={creating}
        onClose={() => setCreating(null)}
        onSceneCreated={() => created("Scenes")}
        onElementCreated={(kind) => {
          const elementColumn = ELEMENT_COLUMNS.find((candidate) => candidate.kind === kind);
          if (elementColumn) created(elementColumn.title);
        }}
      />
    </Stack>
  );
}
