"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { Box, Grid, Heading, HStack, Link, Text } from "@chakra-ui/react";
import { NavActions } from "@/components/nav/nav-actions";

type Props = {
  /** The story being played, shown after the app's name. */
  title?: string;
  /**
   * The session at the table, shown after the title: its heading, or null
   * for "None" when no session is being played. Left out on the screens
   * that come before the table, where there is no session to speak of.
   */
  session?: string | null;
  /** What sits in the middle of the header; the table puts its panel toggles here. */
  center?: ReactNode;
  /** What follows the session on the left; the storyteller's table puts its scene selector here. */
  afterSession?: ReactNode;
};

// The header every /play/[id] and /run/[id] screen draws in place of the menu
// bar: the tables, the waiting room and the screen that says a story cannot
// be played. With no menu bar here, the name is the way back to the home
// page. Three columns with equal outer ones, so whatever is in the middle
// stays centred on the window however wide the two sides are.
//
// The outer columns are minmax(0, 1fr) rather than 1fr, whose minimum is its
// content: on a narrow window a long title and session would otherwise hold
// the left column wide and run under the toggles in the middle. At zero
// minimum the left side gives way instead, its items truncating in turn.
export function PlayHeader({ title, session, center, afterSession }: Props) {
  return (
    <Grid
      as="header"
      templateColumns="minmax(0, 1fr) auto minmax(0, 1fr)"
      alignItems="center"
      gap="4"
      minH="16"
      px="4"
      borderBottomWidth="1px"
      bg="bg.subtle"
    >
      {/* minW 0 so a long title truncates instead of pushing the middle
          column off centre; the app's name never shrinks. Clipped, so
          whatever cannot shrink further is cut at the column's edge rather
          than drawn over the middle. */}
      <HStack gap="2" minW="0" justifySelf="start" maxW="full" overflow="hidden">
        <Heading size="lg" flexShrink="0">
          <Link asChild>
            <NextLink href="/home">Storyteller</NextLink>
          </Link>
        </Heading>
        {title && (
          <>
            <Text aria-hidden textStyle="lg" color="fg.muted">
              /
            </Text>
            {/* Text, not a heading: the waiting room already has the
                title as its h1, and a header should not compete with the
                page for that. */}
            <Text textStyle="lg" fontWeight="medium" flexShrink="4" truncate title={title}>
              {title}
            </Text>
          </>
        )}
        {session !== undefined && (
          <>
            <Text aria-hidden textStyle="lg" color="fg.muted">
              —
            </Text>
            {/* The title gives way before the session does: which session
                is running matters more at the table than the whole name.
                The session still shrinks once the title is down to its
                ellipsis, rather than holding the column open. */}
            <Text
              textStyle="lg"
              color={session === null ? "fg.muted" : undefined}
              flexShrink="1"
              minW="0"
              maxW="50%"
              truncate
              title={session ?? "No active session"}
            >
              {session ?? "None"}
            </Text>
          </>
        )}
        {afterSession}
      </HStack>
      <Box>{center}</Box>
      <Box justifySelf="end">
        <NavActions />
      </Box>
    </Grid>
  );
}
