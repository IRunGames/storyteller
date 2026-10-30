"use client";

import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Link2 } from "lucide-react";
import { toaster } from "@/components/ui/toaster";

/**
 * Puts an invitation's link on the clipboard and says so. The link is built
 * from the page's own origin, as the join link is (join-link-button.tsx),
 * and only at the moment of copying: a row rendered on the server has no
 * window to read it from.
 */
export async function copyInviteLink(token: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    toaster.create({ title: "Link copied.", type: "success" });
    return true;
  } catch {
    return false;
  }
}

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
