"use client";

import { useState } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { toaster } from "@/components/ui/toaster";
import { sa_setNewsArchived, type AdminNews } from "./actions";

/**
 * The archive button on a row of the News table: takes the item off the home
 * page and keeps it, and on an archived row puts it back. Nothing is lost
 * either way, so it does not ask first, and the row's status says it took.
 * It waits for the action rather than showing the change first, since the
 * status a restored item goes back to (scheduled, live or expired) is the
 * server's to work out. A refusal is a toast: there is nothing on the row to
 * correct.
 */
export function ArchiveNewsButton({
  item,
  onChanged,
}: {
  item: AdminNews;
  onChanged: (news: AdminNews) => void;
}) {
  const [isBusy, setBusy] = useState(false);
  const verb = item.isArchived ? "Restore" : "Archive";

  async function toggle() {
    setBusy(true);
    try {
      const result = await sa_setNewsArchived(item.idNews, !item.isArchived);
      if (result.ok) onChanged(result.news);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: `${item.title} could not be changed. Try again.`, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconButtonWithTooltip
      label={`${verb} ${item.title}`}
      tooltip={item.isArchived ? "Restore to the home page" : "Archive"}
      loading={isBusy}
      onClick={() => void toggle()}
    >
      {item.isArchived ? <ArchiveRestore /> : <Archive />}
    </IconButtonWithTooltip>
  );
}
