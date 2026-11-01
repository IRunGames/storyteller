"use client";

import { Button, Portal, Tooltip } from "@chakra-ui/react";

/**
 * "About Storyteller" on the landing page and the login page. There is
 * nothing behind it yet: a video is on its way, and this is the one file
 * that changes when it arrives, into a link to it. Until then it is drawn
 * as a link but kept out of action with aria-disabled rather than disabled,
 * so it stays focusable and the tooltip can say why.
 */
export function AboutStorytellerLink() {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <Button
          type="button"
          variant="plain"
          size="sm"
          px="0"
          h="auto"
          color="fg.muted"
          textDecoration="underline"
          textUnderlineOffset="3px"
          cursor="not-allowed"
          aria-disabled="true"
          onClick={(event) => event.preventDefault()}
        >
          About Storyteller
        </Button>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>Coming soon</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
