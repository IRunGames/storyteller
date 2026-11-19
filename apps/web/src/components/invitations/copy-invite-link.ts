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
