import NextLink from "next/link";
import { HStack, Image, Text } from "@chakra-ui/react";

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
        <LogoMark />
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

/** Where the logo is served from; a copy of the iRun blog's public/logo.png. */
export const LOGO_URL = "/images/storyteller-logo.png";

/**
 * The Storyteller logo alone, with no link or name: the brand mark's icon,
 * and the display table's (/table/[id]), which shows it over the scene. The
 * same on every theme, being the app's mark rather than the theme's; the
 * theme menu's button shows which theme is in force. Decorative, as the name
 * beside it says what it is. The size is the caller's.
 */
export function LogoMark({ size = "8" }: { size?: string }) {
  return <Image src={LOGO_URL} alt="" boxSize={size} rounded="md" flexShrink="0" />;
}
