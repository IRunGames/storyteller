"use client";

import { useState } from "react";
import { Grid, Heading, Stack, Text } from "@chakra-ui/react";
import type { NewsItem } from "@/lib/news";
import { NewsCard } from "./news-card";

type Props = {
  /** What the page found unread for the caller, newest first. */
  items: NewsItem[];
};

// The News block at the top of the home page. It owns only which cards are
// still showing: a card reports that it has been read (see NewsCard for the
// two ways that happens) and is taken out of the list. The heading id is
// fixed because the page has one News section; it is what aria-labelledby
// names.
export function NewsSection({ items }: Props) {
  const [visible, setVisible] = useState(items);
  const headingId = "news-heading";

  function onDismiss(item: NewsItem) {
    setVisible((current) => current.filter((i) => i.idNews !== item.idNews));
  }

  return (
    <Stack as="section" aria-labelledby={headingId} gap="4">
      <Heading id={headingId} size="xl">
        News
      </Heading>
      {visible.length === 0 && <Text color="fg.muted">Nothing to report.</Text>}
      <Grid templateColumns={{ base: "1fr", md: "repeat(3, minmax(0, 1fr))" }} gap="4">
        {visible.map((item) => (
          <NewsCard key={item.idNews} item={item} onDismiss={onDismiss} />
        ))}
      </Grid>
    </Stack>
  );
}
