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
  /**
   * Drawn in the session's place when given: the storyteller's table puts
   * its rename-in-place title here. The session string still decides
   * whether there is one.
   */
  sessionContent?: ReactNode;
  /** What sits in the middle of the header; the table puts its panel toggles here. */
  center?: ReactNode;
  /** What follows the session on the left; the storyteller's table puts the session's status chip here. */
  afterSession?: ReactNode;
  /**
   * Below sm, move the middle into the hamburger's drawer as well, its
   * buttons drawn with their names. For the tables, whose toggles a phone has
   * no room for beside the title. The user's buttons fold into the drawer
   * below sm on every one of these headers (NavActions).
   */
  centerInMenu?: boolean;
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
//
// Below sm the right column is only as wide as what is in it, the hamburger
// alone once the user's buttons fold into the drawer, so the title and
// session have the rest of the row rather than half of it. Nothing needs
// centring there: the tables' toggles are in the drawer too. The gap is
// smaller as well, since an empty middle column still has one on each side.
//
// The middle is laid out in a row here and in a column in the drawer, so a
// center that goes into the menu is a list of buttons with no row of its own.
export function PlayHeader({
  title,
  session,
  sessionContent,
  center,
  afterSession,
  centerInMenu = false,
}: Props) {
  return (
    <Grid
      as="header"
      templateColumns={{
        base: "minmax(0, 1fr) auto auto",
        sm: "minmax(0, 1fr) auto minmax(0, 1fr)",
      }}
      alignItems="center"
      gap={{ base: "2", sm: "4" }}
      minH="16"
      px="4"
      borderBottomWidth="1px"
      bg="bg.subtle"
    >
      {/* minW 0 so a long title truncates instead of pushing the middle
          column off centre; the app's name never shrinks. Clipped, so
          whatever cannot shrink further is cut at the column's edge rather
          than drawn over the middle. The full width of its column rather
          than the width of its content: the session's maxW 50% is a share of
          this, and of a content-sized row it came to almost nothing, the
          title gave way to zero and the rest of the column sat empty. */}
      <HStack gap="2" minW="0" w="full" overflow="hidden">
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
            {session !== null && sessionContent ? (
              // The same room as the plain text below, so the title still
              // gives way first.
              <Box display="flex" flexShrink="1" minW="0" maxW="50%">
                {sessionContent}
              </Box>
            ) : (
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
            )}
          </>
        )}
        {afterSession}
      </HStack>
      <HStack gap="1" hideBelow={centerInMenu ? "sm" : undefined}>
        {center}
      </HStack>
      {/* Placed in the last column by name: below sm the middle is hidden,
          and a hidden item leaves the grid, so this would otherwise flow
          into the middle column and sit beside the title. */}
      <Box gridColumn="3" justifySelf="end">
        <NavActions foldBelow="sm" menu={centerInMenu ? center : undefined} />
      </Box>
    </Grid>
  );
}
