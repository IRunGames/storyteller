"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  NativeSelect,
  Table,
  Text,
  chakra,
} from "@chakra-ui/react";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type {
  AdminInvitation,
  InvitationStatus,
} from "@/app/(app)/(nav)/admin/invitations/actions";
import { LocalDate } from "@/components/dates/local-date";
import { CopyInviteLinkButton } from "@/components/invitations/copy-invite-link-button";
import { DeleteInvitationButton } from "./delete-invitation-button";
import { EditInvitationDialog } from "./edit-invitation-dialog";

// The table's features, at module scope as TanStack Table asks: a new object
// each render would rebuild every row model. Sorting by header and one
// search box across the text columns; the Kind and Status selects narrow the
// rows before they reach the table, which keeps them out of its state.
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime },
  filterFns: { includesString: filterFn_includesString },
});

const STATUS_PALETTE: Record<InvitationStatus, string> = {
  pending: "blue",
  accepted: "green",
  expired: "gray",
  revoked: "red",
};

// The columns the search box looks through: what an administrator would
// type to find an invitation.
const SEARCHABLE = new Set(["email", "target", "inviter", "acceptedBy"]);

type Props = {
  rows: AdminInvitation[];
  onChanged: (invitation: AdminInvitation) => void;
  onDeleted: (idInvitation: number) => void;
};

/**
 * Every invitation, as a table an administrator can search, sort by any
 * header and narrow by kind and status, with Copy link, Edit and Delete on
 * each row. TanStack Table works out the rows; Chakra's Table draws them,
 * so the list follows the theme like the rest of the app.
 */
export function InvitationsTable({ rows, onChanged, onDeleted }: Props) {
  const [kind, setKind] = useState<"" | AdminInvitation["kind"]>("");
  const [status, setStatus] = useState<"" | InvitationStatus>("");
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);

  const data = useMemo(
    () =>
      rows.filter(
        (row) => (kind === "" || row.kind === kind) && (status === "" || row.status === status),
      ),
    [rows, kind, status],
  );

  const columns = useMemo(() => {
    const helper = createColumnHelper<typeof features, AdminInvitation>();
    return helper.columns([
      helper.accessor("email", { header: "Email", sortFn: "alphanumeric" }),
      helper.accessor("kind", {
        header: "Kind",
        cell: (info) => (info.getValue() === "app" ? "App" : "Story"),
      }),
      helper.accessor("target", {
        header: "For",
        sortFn: "alphanumeric",
        cell: (info) => info.getValue() || "—",
      }),
      helper.accessor("inviter", { header: "Invited by", sortFn: "alphanumeric" }),
      helper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge colorPalette={STATUS_PALETTE[info.getValue()]} textTransform="capitalize">
            {info.getValue()}
          </Badge>
        ),
      }),
      helper.accessor("acceptedBy", {
        header: "Accepted by",
        sortFn: "alphanumeric",
        cell: (info) => info.getValue() ?? "—",
      }),
      helper.accessor("createdAt", {
        header: "Sent",
        sortFn: "datetime",
        cell: (info) => <LocalDate value={info.getValue()} />,
      }),
      helper.accessor("expiresAt", {
        header: "Expires",
        sortFn: "datetime",
        cell: (info) => <LocalDate value={info.getValue()} />,
      }),
      helper.display({
        id: "actions",
        header: () => <chakra.span srOnly>Actions</chakra.span>,
        cell: ({ row }) => (
          <HStack gap="0" justify="flex-end">
            {row.original.status === "pending" && (
              <CopyInviteLinkButton token={row.original.token} email={row.original.email} />
            )}
            <EditInvitationDialog invitation={row.original} onSaved={onChanged} />
            <DeleteInvitationButton
              invitation={row.original}
              onDeleted={() => onDeleted(row.original.idInvitation)}
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
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) => SEARCHABLE.has(column.id),
  });

  const visible = table.getRowModel().rows;
  const filtered = kind !== "" || status !== "" || globalFilter !== "";

  return (
    <Box>
      <HStack gap="3" mb="4" wrap="wrap">
        <Input
          type="search"
          aria-label="Search invitations"
          placeholder="Search email, story, type or person"
          maxW="sm"
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
        />
        <NativeSelect.Root w="auto">
          <NativeSelect.Field
            aria-label="Kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="">All kinds</option>
            <option value="app">App</option>
            <option value="story">Story</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <NativeSelect.Root w="auto">
          <NativeSelect.Field
            aria-label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </HStack>

      <Table.ScrollArea borderWidth="1px" rounded="md">
        <Table.Root size="sm" aria-label="Invitations">
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
          {filtered ? "No invitations match." : "No invitations yet."}
        </Text>
      )}
    </Box>
  );
}
