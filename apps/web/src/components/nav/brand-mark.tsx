import NextLink from "next/link";
import { Box, HStack, Text } from "@chakra-ui/react";
import { BerryIcon, PumpkinIcon, SparkleIcon } from "./icons";

// Both marks are always in the DOM and the theme class on <html> picks
// which one shows. Reading the theme on the client instead would mean a
// ClientOnly skeleton in the header on every load, since the server does
// not know the theme; a CSS rule is settled before first paint.
//
// The selector is written out (".halloween &") rather than the `_halloween`
// condition theme.ts declares because Chakra only types custom conditions
// after its typegen CLI has written them into node_modules, which this repo
// does not run. Tokens in theme.ts are untyped and can use `_halloween`.
//
// The mark is the link to /home, which is not in NAV_ITEMS, so it takes the
// same accent-on-tint pill as an active NavLink when the user is there. The
// pill's padding is always applied and pulled back with a negative margin,
// so the mark sits in the same place whether or not it is highlighted.
export function BrandMark({ active }: { active: boolean }) {
  return (
    <HStack
      asChild
      gap="3.5"
      h="11"
      px="3"
      mx="-3"
      rounded="10px"
      color={active ? "nav.accent" : "nav.fg"}
      bg={active ? "nav.accentTint" : "transparent"}
      textDecoration="none"
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "nav.accent",
        outlineOffset: "2px",
      }}
    >
      <NextLink href="/home" aria-current={active ? "page" : undefined}>
        <Box
          as="span"
          display="inline-flex"
          color="nav.accent"
          css={{ ".halloween &, .blackberry &": { display: "none" } }}
        >
          <SparkleIcon />
        </Box>
        <Box
          as="span"
          display="none"
          color="nav.accent"
          css={{ ".halloween &": { display: "inline-flex" } }}
        >
          <PumpkinIcon />
        </Box>
        <Box
          as="span"
          display="none"
          color="nav.accent"
          css={{ ".blackberry &": { display: "inline-flex" } }}
        >
          <BerryIcon />
        </Box>
        <Text
          as="span"
          fontSize="2xl"
          fontWeight="bold"
          letterSpacing="-0.01em"
          whiteSpace="nowrap"
        >
          Storyteller
        </Text>
      </NextLink>
    </HStack>
  );
}
