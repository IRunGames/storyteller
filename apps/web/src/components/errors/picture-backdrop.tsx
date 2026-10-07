import type { ReactNode } from "react";
import { Box, Flex, Stack } from "@chakra-ui/react";

type Props = {
  /** The picture that fills the window. */
  imageUrl: string;
  /** What the panel holds. */
  children: ReactNode;
};

// The full-window picture the not-found and error pages put behind their
// message, with the message on a panel near the bottom, below the figure
// each picture has in its middle. The pictures are dark throughout and the
// same in every theme, so the panel keeps its own colours, as the waiting
// room's does. No "use client": the not-found page is a server component
// and the error page a client one, and both draw this.
export function PictureBackdrop({ imageUrl, children }: Props) {
  return (
    <Flex position="relative" minH="100vh" direction="column" bg="bg.subtle">
      <Box
        aria-hidden
        position="absolute"
        inset="0"
        bgSize="cover"
        bgPos="center"
        style={{ backgroundImage: `url("${imageUrl}")` }}
      />
      <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.500" />
      <Flex position="relative" flex="1" align="end" justify="center" px="4" py="10">
        <Stack
          gap="4"
          maxW="md"
          w="full"
          p={{ base: "5", md: "8" }}
          bg="bg.panel"
          borderWidth="1px"
          rounded="xl"
          shadow="lg"
          textAlign="center"
          align="center"
        >
          {children}
        </Stack>
      </Flex>
    </Flex>
  );
}
