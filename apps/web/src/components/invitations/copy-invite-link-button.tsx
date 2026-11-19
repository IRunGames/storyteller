"use client";

import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Link2 } from "lucide-react";
import { copyInviteLink } from "./copy-invite-link";

/** The copy button on a listed invitation, a link icon with its tooltip above. */
export function CopyInviteLinkButton({ token, email }: { token: string; email: string }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={`Copy the link for ${email}`}
          variant="ghost"
          size="xs"
          onClick={() => void copyInviteLink(token)}
        >
          <Link2 />
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>Copy link</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
