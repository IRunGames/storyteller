"use client";

import { Box, IconButton, Tooltip } from "@chakra-ui/react";
import { Bell } from "lucide-react";

// The header's notifications button. Notifications do not exist yet, so it
// is disabled with a "Coming soon" tooltip; when they arrive, this is the one
// file that changes.
export function NavNotificationsBell() {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        {/* A disabled button swallows pointer events, so the wrapper is what
            the tooltip listens to. */}
        <Box as="span" display="inline-flex">
          <IconButton
            aria-label="Notifications"
            variant="ghost"
            boxSize="11"
            rounded="10px"
            color="nav.icon"
            disabled
          >
            <Bell />
          </IconButton>
        </Box>
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content>Coming soon</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  );
}
