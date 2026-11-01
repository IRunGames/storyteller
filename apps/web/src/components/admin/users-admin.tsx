"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  sa_listUsers,
  type AdminUser,
  type UserListPage,
  type UserTypeOption,
} from "@/app/(app)/(nav)/admin/users/actions";
import { LocalDate } from "@/components/dates/local-date";
import {
  USER_PAGE_SIZES,
  type UserListQuery,
  type UserPageSize,
  type UserSortKey,
} from "@/lib/user-list-schemas";
import { USER_STATUSES, type UserStatus } from "@/lib/user-types";

/** How long the search box waits after the last keystroke before asking the server. */
export const USER_SEARCH_DELAY_MS = 500;

// Sorting alone, with no sorted row model: the rows arrive sorted and paged
// from the server, so the table keeps the sort state and draws the arrows,
// and nothing sorts the page again in the browser.
const features = tableFeatures({ rowSortingFeature });

const STATUS_LABEL: Record<UserStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  guest: "Guest",
};
const STATUS_PALETTE: Record<UserStatus, string> = {
  active: "green",
  inactive: "gray",
  guest: "blue",
};

const DEFAULT_SORT: SortingState = [{ id: "createdAt", desc: true }];

type Props = {
  /** Every account type, for the Type filters. */
  types: UserTypeOption[];
  /** The first page, loaded by the page with the default query. */
  initial: UserListPage;
};

/**
 * One quick filter: a pressed pill shows its rows, an unpressed one hides
 * them. aria-pressed says which, as the table's panel toggles do.
 */
function FilterPill({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      size="xs"
      rounded="full"
      variant={pressed ? "solid" : "outline"}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {children}
    </Button>
  );
}

/**
 * The body of the administrators' Users page: quick filters for status and
 * type above a search box and the table, with paging under it. Everything
 * the table shows comes from sa_listUsers; the browser only holds the query
 * and the page it was last sent. The page it opened with came with the
 * page, so the first render asks for nothing; every change to the query
 * after that asks again, the search half a second after the last keystroke
 * and the rest at once.
 */
export function UsersAdmin({ types, initial }: Props) {
  const [search, setSearch] = useState("");
  const [needle, setNeedle] = useState("");
  const [statuses, setStatuses] = useState<UserStatus[]>([...USER_STATUSES]);
  const [idUserTypes, setIdUserTypes] = useState<number[]>(() =>
    types.map((type) => type.idUserType),
  );
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<UserPageSize>(25);
  const [listed, setListed] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // The search waits for the typing to stop, so a name is one query rather
  // than one per letter. A new search starts from the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setNeedle(search.trim());
      setPage(0);
    }, USER_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const sort = sorting[0] ?? DEFAULT_SORT[0];
  const query: UserListQuery = useMemo(
    () => ({
      search: needle,
      statuses,
      idUserTypes,
      sortBy: sort.id as UserSortKey,
      sortDesc: sort.desc,
      page,
      pageSize,
    }),
    [needle, statuses, idUserTypes, sort.id, sort.desc, page, pageSize],
  );
  // The query as a string, so the effect runs when it changes and not on
  // every render that rebuilds it; and the string it opened with, whose
  // answer the page already has.
  const key = JSON.stringify(query);
  const openedWith = useRef(key);
  const seq = useRef(0);

  useEffect(() => {
    if (key === openedWith.current) {
      setListed(initial);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    setFailed(false);
    sa_listUsers(JSON.parse(key))
      .then(
        (next) => {
          if (mine === seq.current) setListed(next);
        },
        () => {
          // The last page stays up; the next change asks again.
          if (mine === seq.current) setFailed(true);
        },
      )
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [key, initial]);

  // The lists keep their canonical order whichever pill was pressed last, so
  // the query reads the same for the same choice.
  function toggleStatus(status: UserStatus) {
    setStatuses((current) =>
      USER_STATUSES.filter((s) => (s === status ? !current.includes(s) : current.includes(s))),
    );
    setPage(0);
  }
  function toggleType(idUserType: number) {
    setIdUserTypes((current) =>
      types
        .map((type) => type.idUserType)
        .filter((id) => (id === idUserType ? !current.includes(id) : current.includes(id))),
    );
    setPage(0);
  }

  const columns = useMemo(() => {
    const helper = createColumnHelper<typeof features, AdminUser>();
    return helper.columns([
      helper.accessor("name", {
        header: "Name",
        cell: (info) => (
          <Stack gap="0">
            <Text>{info.getValue()}</Text>
            {info.row.original.nickName && (
              <Text textStyle="xs" color="fg.muted">
                {info.row.original.nickName}
              </Text>
            )}
          </Stack>
        ),
      }),
      helper.accessor("email", { header: "Email" }),
      helper.accessor("userTypeName", { header: "Type" }),
      helper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge colorPalette={STATUS_PALETTE[info.getValue()]}>
            {STATUS_LABEL[info.getValue()]}
          </Badge>
        ),
      }),
      helper.accessor("createdAt", {
        header: "Joined",
        cell: (info) => <LocalDate value={info.getValue()} />,
      }),
      helper.accessor("lastLogin", {
        header: "Last login",
        cell: (info) => <LocalDate value={info.getValue()} />,
      }),
      helper.accessor("hoursPlayed", {
        header: "Hours",
        cell: (info) => info.getValue().toFixed(1),
      }),
    ]);
  }, []);

  const table = useTable({
    features,
    columns,
    data: listed.rows,
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPage(0);
    },
    // A column stays sorted one way or the other; a third press does not
    // fall back to no order, which the server would read as the default.
    enableSortingRemoval: false,
  });

  const first = listed.total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(listed.total, (page + 1) * pageSize);
  const pageCount = Math.max(1, Math.ceil(listed.total / pageSize));

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="2xl">Users</Heading>
        <Text color="fg.muted">
          Every account on Storyteller. Unpress a status or a type to hide it.
        </Text>
      </Stack>

      <Stack gap="3">
        <HStack gap="2" wrap="wrap" role="group" aria-label="Status">
          <Text textStyle="sm" fontWeight="semibold" color="fg.muted" w="12">
            Status
          </Text>
          {USER_STATUSES.map((status) => (
            <FilterPill
              key={status}
              pressed={statuses.includes(status)}
              onToggle={() => toggleStatus(status)}
            >
              {STATUS_LABEL[status]}
            </FilterPill>
          ))}
        </HStack>
        <HStack gap="2" wrap="wrap" role="group" aria-label="Type">
          <Text textStyle="sm" fontWeight="semibold" color="fg.muted" w="12">
            Type
          </Text>
          {types.map((type) => (
            <FilterPill
              key={type.idUserType}
              pressed={idUserTypes.includes(type.idUserType)}
              onToggle={() => toggleType(type.idUserType)}
            >
              {type.label}
            </FilterPill>
          ))}
        </HStack>
      </Stack>

      <Input
        type="search"
        aria-label="Search users"
        placeholder="Search name, nickname or email"
        maxW="sm"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {failed && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              The users could not be loaded. Change something to try again.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <Box opacity={loading ? 0.6 : 1} transition="opacity 0.15s" aria-busy={loading}>
        <Table.ScrollArea borderWidth="1px" rounded="md">
          <Table.Root size="sm" aria-label="Users">
            <Table.Header>
              {table.getHeaderGroups().map((group) => (
                <Table.Row key={group.id}>
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
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
                        {/* A button, so the sort is reachable from the
                            keyboard; the header cell carries aria-sort. */}
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
      </Box>

      {listed.total === 0 && !loading && <Text color="fg.muted">No users match.</Text>}

      <HStack gap="3" wrap="wrap" justify="space-between">
        <Text textStyle="sm" color="fg.muted">
          {first}–{last} of {listed.total}
        </Text>
        <HStack gap="2">
          <NativeSelect.Root size="sm" w="auto">
            <NativeSelect.Field
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as UserPageSize);
                setPage(0);
              }}
            >
              {USER_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <Text textStyle="sm" color="fg.muted">
            Page {page + 1} of {pageCount}
          </Text>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </HStack>
      </HStack>
    </Stack>
  );
}
