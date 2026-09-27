"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Button, Flex, Heading, HStack, Link, List, Stack, Text } from "@chakra-ui/react";
import { Maximize2 } from "lucide-react";
import { matchesFilter } from "@/lib/filter-text";
import type { StoryScene } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { PREP_SESSIONS_PAGE_SIZE, type StoryCardData, type StorySession } from "@/lib/stories";
import { StorySessions } from "@/components/stories/story-sessions";
import { PREP_COLUMNS, type PrepColumnMode, type PrepColumnTitle } from "./prep-columns";
import { PrepColumn } from "./prep-column";
import { PrepScenes } from "./prep-scenes";

type Props = {
  story: StoryCardData;
  /** The first page of the story's sessions; the Timeline fetches the rest. */
  sessions: StorySession[];
  /** The first page of the story's scenes; the column fetches the rest. */
  scenes: StoryScene[];
  /**
   * How many rows each column that has real ones holds in all, for the number
   * beside its heading. A column still on stand-ins is left out and shows no
   * count rather than counting its stand-ins.
   */
  counts: Partial<Record<PrepColumnTitle, number>>;
  /** The story_sessions and story_scenes workflows, for the status pills. */
  sessionStatusOptions: StatusOption[];
  sceneStatusOptions: StatusOption[];
};

// Until each column has its own rows, a few lines stand where they will go.
const PLACEHOLDERS: Record<Exclude<PrepColumnTitle, "Timeline" | "Scenes">, string[]> = {
  Characters: ["The innkeeper", "The magistrate", "The stranger"],
  Enemies: ["Wolves", "The cult", "The dragon"],
  Resources: ["Regional map", "House rules", "Loot tables"],
};

// The stand-in rows, filtered like the real ones will be.
function PlaceholderRows({ lines, query }: { lines: readonly string[]; query: string }) {
  const shown = lines.filter((line) => matchesFilter(line, query));
  if (shown.length === 0) return <Text color="fg.muted">No matches.</Text>;
  return (
    <List.Root listStyleType="none" gap="2">
      {shown.map((line) => (
        <List.Item key={line}>
          <Text color="fg.muted">{line}</Text>
        </List.Item>
      ))}
    </List.Root>
  );
}

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
  counts,
  sessionStatusOptions,
  sceneStatusOptions,
}: Props) {
  const [modes, setModes] = useState(initialModes);

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
  // its search box. A column still on stand-in rows has none.
  const COLUMN_WORKFLOWS: Partial<Record<PrepColumnTitle, StatusOption[]>> = {
    Timeline: sessionStatusOptions,
    Scenes: sceneStatusOptions,
  };

  const hidden = PREP_COLUMNS.filter((column) => modes[column.title] === "hidden");
  const visible = PREP_COLUMNS.filter((column) => modes[column.title] !== "hidden");

  return (
    <Stack flex="1" gap="4" py="6">
      {/* The title is the way back to the story, so it stays a link inside
          the one-line heading. */}
      <Heading as="h1" size="2xl" px="4">
        Preparing{" "}
        <Link asChild>
          <NextLink href={`/stories/${story.idStory}`}>{story.title}</NextLink>
        </Link>
      </Heading>

      {hidden.length > 0 && (
        <HStack gap="2" px="4" wrap="wrap">
          {hidden.map((column) => (
            <Button
              key={column.title}
              aria-label={`Show ${column.title}`}
              variant="outline"
              size="sm"
              onClick={() => setMode(column.title, "normal")}
            >
              <Maximize2 />
              {column.title}
            </Button>
          ))}
        </HStack>
      )}

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
              count={counts[column.title] ?? null}
              statusOptions={COLUMN_WORKFLOWS[column.title]}
              mode={mode}
              width={column.width}
              expandable={column.expandable}
              creatable={column.creatable}
              bordered={index > 0}
              // Creating rows is the next piece of work; the buttons are in
              // place so the layout is settled first.
              onCreate={() => {}}
              onExpand={() => setMode(column.title, "expanded")}
              onContract={() => setMode(column.title, mode === "expanded" ? "normal" : "hidden")}
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
                      filter={filter.query}
                      shownStatuses={filter.statuses}
                      statusOptions={sceneStatusOptions}
                      canEdit={story.isOwner}
                    />
                  );
                }
                return <PlaceholderRows lines={PLACEHOLDERS[column.title]} query={filter.query} />;
              }}
            </PrepColumn>
          );
        })}
      </Flex>
    </Stack>
  );
}
