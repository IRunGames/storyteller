"use client";

import NextLink from "next/link";
import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SessionNeighbour } from "@/app/(app)/(nav)/stories/actions";
import { sessionHeading } from "@/lib/stories";

/**
 * One of the two arrows beside a session page's heading: left to the
 * session opened before this one, right to the one opened after, each a
 * link to that session's page with its heading as the tooltip. Where there
 * is no such session the arrow stays, disabled, so the heading sits in the
 * same place on every session; its name says which way there is nothing.
 * The same shape as the scene preview's chevrons (SceneChevron).
 */
export function SessionNeighbourChevron({
  direction,
  session,
}: {
  direction: "previous" | "next";
  session: SessionNeighbour | null;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  if (!session) {
    const none = direction === "previous" ? "No earlier session" : "No later session";
    return (
      <IconButton aria-label={none} title={none} size="sm" variant="ghost" rounded="full" disabled>
        <Icon />
      </IconButton>
    );
  }
  const heading = sessionHeading(session);
  const name = `${direction === "previous" ? "Previous" : "Next"} session: ${heading}`;
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton asChild size="sm" variant="ghost" rounded="full">
          <NextLink href={`/sessions/${session.idStorySession}`} aria-label={name}>
            <Icon />
          </NextLink>
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{heading}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
