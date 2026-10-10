"use client";

import { ClientOnly } from "@chakra-ui/react";
import { formatDateTime, formatDateTimeUtc, formatDay, formatDayUtc } from "@/lib/dates";

type Props = {
  value: Date;
  /** The time of day as well as the day. */
  withTime?: boolean;
};

/**
 * A day, or a day and a time with `withTime`, written in the reader's own
 * time zone.
 *
 * Which day a moment falls on depends on where the reader is, and the server
 * cannot know that, so this follows the same rule as the theme menu: what the
 * server cannot know is rendered inside ClientOnly. The fallback is the same
 * date in UTC rather than a skeleton, so the row is never blank or a different
 * width — it is already a date, and it is corrected on mount.
 *
 * The machine-readable value goes in dateTime, which is always the instant
 * itself whichever way it is being shown.
 */
export function LocalDate({ value, withTime = false }: Props) {
  const [local, utc] = withTime ? [formatDateTime, formatDateTimeUtc] : [formatDay, formatDayUtc];
  return (
    <time dateTime={value.toISOString()}>
      <ClientOnly fallback={utc(value)}>{() => local(value)}</ClientOnly>
    </time>
  );
}
