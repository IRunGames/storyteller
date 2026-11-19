"use client";

import { useMemo, useState } from "react";
import { Badge, Box, Button, HStack, Input, Table, Text, chakra } from "@chakra-ui/react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { LocalDate } from "@/components/dates/local-date";
import { formatDayUtc } from "@/lib/dates";
import type { AdminNews, NewsStatus } from "./actions";
import { ArchiveNewsButton } from "./archive-news-button";
import { DeleteNewsButton } from "./delete-news-button";
import { NewsDialog } from "./news-dialog";

// The table's features, at module scope as TanStack Table asks: a new object
// each render would rebuild every row model. Sorting by header only; the
// search box narrows the rows before they reach the table, since it also
// looks through the news itself, which is not a column of its own.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime },
});

const STATUS: Record<NewsStatus, { label: string; palette: string }> = {
  scheduled: { label: "Scheduled", palette: "blue" },
  live: { label: "Live", palette: "green" },
  expired: { label: "Expired", palette: "gray" },
  archived: { label: "Archived", palette: "orange" },
};

type Props = {
  rows: AdminNews[];
  onChanged: (news: AdminNews) => void;
  onDeleted: (idNews: number) => void;
};

/**
 * Every news item, as a table an administrator can search and sort by any
 * header, newest posted first until they do, with Edit, Archive and Delete
 * on each row. The start and expiry are UTC days, written as the home
 * page's card and the dialog write them; when it was posted is a moment,
 * written in the reader's own zone. TanStack Table works out the rows;
 * Chakra's Table draws them, so the list follows the theme.
 */
export function NewsTable({ rows, onChanged, onDeleted }: Props) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);

  const needle = search.trim().toLowerCase();
  const data = useMemo(
    () =>
      needle
        ? rows.filter((row) =>
            [row.title, row.body, row.author].some((text) => text.toLowerCase().includes(needle)),
          )
        : rows,
    [rows, needle],
  );

  const columns = useMemo(() => {
    const helper = createColumnHelper<typeof features, AdminNews>();
    return helper.columns([
      helper.accessor("title", {
        header: "Title",
        sortFn: "alphanumeric",
        // The news under its title, one line of it, so a row can be told
        // from its neighbours without opening it.
        cell: ({ row }) => (
          <>
            <Text fontWeight="medium">{row.original.title}</Text>
            <Text color="fg.muted" lineClamp={1} maxW="md">
              {row.original.body}
            </Text>
          </>
        ),
      }),
      helper.accessor("status", {
        header: "Status",
        sortFn: "alphanumeric",
        cell: (info) => (
          <Badge colorPalette={STATUS[info.getValue()].palette}>
            {STATUS[info.getValue()].label}
          </Badge>
        ),
      }),
      helper.accessor("startsAt", {
        header: "Starts",
        sortFn: "datetime",
        cell: (info) => formatDayUtc(info.getValue()),
      }),
      // An item that never lapses sorts as the latest expiry there could be.
      helper.accessor((row) => row.expiresAt?.getTime() ?? Infinity, {
        id: "expiresAt",
        header: "Expires",
        sortFn: "datetime",
        cell: ({ row }) =>
          row.original.expiresAt ? formatDayUtc(row.original.expiresAt) : "Never",
      }),
      helper.accessor("author", { header: "Posted by", sortFn: "alphanumeric" }),
      helper.accessor("createdAt", {
        header: "Posted",
        sortFn: "datetime",
        cell: (info) => <LocalDate value={info.getValue()} />,
      }),
      helper.display({
        id: "actions",
        header: () => <chakra.span srOnly>Actions</chakra.span>,
        cell: ({ row }) => (
          <HStack gap="0" justify="flex-end">
            <NewsDialog item={row.original} onSaved={onChanged} />
            <ArchiveNewsButton item={row.original} onChanged={onChanged} />
            <DeleteNewsButton
              item={row.original}
              onDeleted={() => onDeleted(row.original.idNews)}
            />
          </HStack>
        ),
      }),
    ]);
  }, [onChanged, onDeleted]);

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const visible = table.getRowModel().rows;

  return (
    <Box>
      <HStack gap="3" mb="4">
        <Input
          type="search"
          aria-label="Search news"
          placeholder="Search title, news or who posted it"
          maxW="sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </HStack>

      <Table.ScrollArea borderWidth="1px" rounded="md">
        <Table.Root size="sm" aria-label="News">
          <Table.Header>
            {table.getHeaderGroups().map((group) => (
              <Table.Row key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort() && header.column.id !== "actions";
                  return (
                    <Table.ColumnHeader
                      key={header.id}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        // A button, so the sort is reachable from the
                        // keyboard; the header cell carries aria-sort.
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
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </Table.ColumnHeader>
                  );
                })}
              </Table.Row>
            ))}
          </Table.Header>
          <Table.Body>
            {visible.map((row) => (
              <Table.Row key={row.id}>
                {row.getAllCells().map((cell) => (
                  <Table.Cell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>

      {visible.length === 0 && (
        <Text color="fg.muted" mt="4">
          {needle ? "No news matches." : "No news yet."}
        </Text>
      )}
    </Box>
  );
}
