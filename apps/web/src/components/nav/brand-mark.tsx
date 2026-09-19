import NextLink from "next/link";
import { Box, HStack, Text } from "@chakra-ui/react";
import { SparkleIcon } from "./icons";

export function BrandMark() {
  return (
    <HStack asChild gap="3.5" color="nav.fg" textDecoration="none">
      <NextLink href="/home">
        <Box as="span" display="inline-flex" color="nav.accent">
          <SparkleIcon />
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
