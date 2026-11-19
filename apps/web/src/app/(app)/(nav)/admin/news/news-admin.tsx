"use client";

import { useCallback, useState } from "react";
import { Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { AdminNews } from "./actions";
import { NewsDialog } from "./news-dialog";
import { NewsTable } from "./news-table";

/**
 * The body of the administrators' News page: the New news item button above
 * the table of every item. The rows live here so a new, edited, archived or
 * deleted item shows at once without reloading the list.
 */
export function NewsAdmin({ initial }: { initial: AdminNews[] }) {
  const [rows, setRows] = useState(initial);

  // Stable, since the table's columns are memoised on them.
  const onChanged = useCallback(
    (changed: AdminNews) =>
      setRows((current) => current.map((row) => (row.idNews === changed.idNews ? changed : row))),
    [],
  );
  const onDeleted = useCallback(
    (idNews: number) => setRows((current) => current.filter((row) => row.idNews !== idNews)),
    [],
  );

  return (
    <Stack gap="6">
      <HStack justify="space-between" align="flex-start" gap="4">
        <Stack gap="1">
          <Heading size="2xl">News</Heading>
          <Text color="fg.muted">
            The announcements on everyone&apos;s home page: what to post, when it shows, and what to
            take down.
          </Text>
        </Stack>
        <NewsDialog onSaved={(news) => setRows((current) => [news, ...current])} />
      </HStack>

      <NewsTable rows={rows} onChanged={onChanged} onDeleted={onDeleted} />
    </Stack>
  );
}
