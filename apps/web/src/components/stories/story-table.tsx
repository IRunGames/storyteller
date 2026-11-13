"use client";

import { useMemo } from "react";
import { Badge, Button, IconButton, Portal, Stack, Table, Text, Tooltip } from "@chakra-ui/react";
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Heart } from "lucide-react";
import {
  formatPlayerCount,
  formatSessionCount,
  formatSessionLength,
  systemLabel,
  type StoryCardData,
} from "@/lib/stories";
import { StoryTitleMenu } from "./story-title-menu";

// Sorting alone, with no sorted row model: the rows arrive sorted and paged
// from the server (sa_listMyStoryPage), so the table keeps the sort state and
// draws the arrows, and nothing sorts the rows again in the browser. Each
// column's id is the sort key the action takes.
const features = tableFeatures({ rowSortingFeature });

type Props = {
  stories: StoryCardData[];
  /** The sort, held by the page: none for the page's own order, touched last first. */
  sorting: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
  /** Called with the story and the state the user asked for. */
  onToggleFavorite: (story: StoryCardData, isFavorite: boolean) => void;
  /** Ids whose favorite toggle is in flight; their hearts are disabled. */
  pendingFavorites: ReadonlySet<number>;
};

/**
 * The Stories page's List view: a row per story with the title menu
 * (StoryTitleMenu) and the system under it, its status, whether it is a
 * favorite, and how many players, how many sessions and how long its
 * finished sessions were played for. Every header sorts, on the server.
 */
export function StoryTable({
  stories,
  sorting,
  onSortingChange,
  onToggleFavorite,
  pendingFavorites,
}: Props) {
  const columns = useMemo(() => {
    const helper = createColumnHelper<typeof features, StoryCardData>();
    return helper.columns([
      helper.accessor("title", {
        id: "title",
        header: "Story",
        cell: (info) => {
          const story = info.row.original;
          const system = systemLabel(story);
          return (
            <Stack gap="0" minW="0" maxW="md">
              <StoryTitleMenu
                idStory={story.idStory}
                title={story.title}
                isStoryteller={story.isOwner}
                buildSceneId={story.buildSceneId}
                as="h3"
                size="sm"
                fontWeight="medium"
              />
              {system && (
                <Text textStyle="xs" color="fg.muted" truncate>
                  {system}
                </Text>
              )}
              {!story.isOwner && story.storytellerName && (
                <Text textStyle="xs" color="fg.muted" truncate>
                  Storyteller: {story.storytellerName}
                </Text>
              )}
            </Stack>
          );
        },
      }),
      helper.accessor("isActive", {
        id: "status",
        header: "Status",
        cell: (info) =>
          info.getValue() ? (
            <Badge size="sm" colorPalette="green" variant="subtle">
              Active
            </Badge>
          ) : (
            <Badge size="sm">Inactive</Badge>
          ),
      }),
      helper.accessor("isFavorite", {
        id: "favorite",
        header: "Favorite",
        cell: (info) => (
          <FavoriteButton
            story={info.row.original}
            pending={pendingFavorites.has(info.row.original.idStory)}
            onToggle={onToggleFavorite}
          />
        ),
      }),
      helper.accessor("playerCount", {
        id: "players",
        header: "Players",
        cell: (info) => (
          <Text as="span" aria-label={formatPlayerCount(info.getValue())}>
            {info.getValue()}
          </Text>
        ),
      }),
      helper.accessor("sessionCount", {
        id: "sessions",
        header: "Sessions",
        cell: (info) => (
          <Text as="span" aria-label={formatSessionCount(info.getValue())}>
            {info.getValue()}
          </Text>
        ),
      }),
      helper.accessor("playMinutes", {
        id: "played",
        header: "Played",
        cell: (info) =>
          info.getValue() > 0 ? (
            formatSessionLength(info.getValue())
          ) : (
            <Text as="span" color="fg.subtle">
              —
            </Text>
          ),
      }),
    ]);
  }, [onToggleFavorite, pendingFavorites]);

  const table = useTable({
    features,
    columns,
    data: stories,
    state: { sorting },
    onSortingChange,
    // A column stays sorted one way or the other once pressed; a third
    // press does not fall back to no order.
    enableSortingRemoval: false,
  });

  // The numbers line up at the end of their columns.
  const numeric = new Set(["players", "sessions", "played"]);

  return (
    <Table.ScrollArea borderWidth="1px" rounded="md">
      <Table.Root size="sm" aria-label="Stories">
        <Table.Header>
          {table.getHeaderGroups().map((group) => (
            <Table.Row key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <Table.ColumnHeader
                    key={header.id}
                    textAlign={numeric.has(header.column.id) ? "end" : undefined}
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                    }
                  >
                    {/* A button, so the sort is reachable from the keyboard;
                        the header cell carries aria-sort. */}
                    <Button
                      variant="plain"
                      size="xs"
                      px="0"
                      fontWeight="semibold"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                      {sorted === "asc" ? (
                        <ArrowUp />
                      ) : sorted === "desc" ? (
                        <ArrowDown />
                      ) : (
                        <ArrowUpDown opacity={0.4} />
                      )}
                    </Button>
                  </Table.ColumnHeader>
                );
              })}
            </Table.Row>
          ))}
        </Table.Header>
        <Table.Body>
          {table.getRowModel().rows.map((row) => (
            <Table.Row key={row.id} aria-label={row.original.title}>
              {row.getAllCells().map((cell) => (
                <Table.Cell
                  key={cell.id}
                  textAlign={numeric.has(cell.column.id) ? "end" : undefined}
                  whiteSpace={cell.column.id === "played" ? "nowrap" : undefined}
                >
                  <table.FlexRender cell={cell} />
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}

/**
 * The card's heart on a row: aria-disabled rather than disabled while its
 * toggle is in flight, so a keyboard user keeps their place.
 */
function FavoriteButton({
  story,
  pending,
  onToggle,
}: {
  story: StoryCardData;
  pending: boolean;
  onToggle: (story: StoryCardData, isFavorite: boolean) => void;
}) {
  const label = story.isFavorite ? "Remove from Favorites" : "Add to Favorites";
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          type="button"
          aria-label={label}
          aria-pressed={story.isFavorite}
          variant="ghost"
          size="xs"
          rounded="full"
          color={story.isFavorite ? "red.fg" : "fg.muted"}
          aria-disabled={pending}
          opacity={pending ? "0.6" : undefined}
          cursor={pending ? "not-allowed" : undefined}
          onClick={() => {
            if (pending) return;
            onToggle(story, !story.isFavorite);
          }}
        >
          <Heart fill={story.isFavorite ? "currentColor" : "none"} />
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
