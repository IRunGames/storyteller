"use client";

import NextLink from "next/link";
import { Box } from "@chakra-ui/react";

interface NavLinkProps {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onNavigate?: () => void;
}

// One pill in the primary nav. The active pill is accent-on-tint; the rest are
// muted text on nothing.
export function NavLink({ href, active, children, onNavigate }: NavLinkProps) {
  return (
    <Box
      asChild
      display="flex"
      alignItems="center"
      h="11"
      px="3.5"
      rounded="10px"
      fontSize="lg"
      fontWeight="semibold"
      textDecoration="none"
      color={active ? "nav.accent" : "nav.fgMuted"}
      bg={active ? "nav.accentTint" : "transparent"}
      _hover={{ color: "nav.accent" }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "nav.accent",
        outlineOffset: "2px",
      }}
    >
      <NextLink
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
      >
        {children}
      </NextLink>
    </Box>
  );
}
