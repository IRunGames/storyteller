"use client";

import { useCallback, useState } from "react";
import type { PlayItem } from "@/lib/run";
import type { ScenePulseEvent } from "@/components/play/use-play-scene";
import { AttachmentPreviewDialog } from "@/components/uploads/attachment-preview";

/**
 * The picture the storyteller has put up full size from a pill's tack, as
 * the tables that follow them hold it: the preview.open pulse names the
 * link, since an element may be in the scene more than once, and
 * preview.close takes it down. An action this build does not know is left
 * alone, so an older table keeps working when a newer storyteller's page
 * sends something new. `open` is for a table that also opens a picture of
 * its own choosing, and `close` for the viewer closing it for themselves;
 * either way one picture is up at a time, and a fresh open swaps it.
 */
export function usePulsedPicture() {
  const [idSceneElement, setIdSceneElement] = useState<number | null>(null);
  const onPulse = useCallback((event: ScenePulseEvent) => {
    if (event.custom.action === "preview.open") setIdSceneElement(event.idSceneElement);
    else if (event.custom.action === "preview.close") setIdSceneElement(null);
  }, []);
  const close = useCallback(() => setIdSceneElement(null), []);
  return { idSceneElement, onPulse, open: setIdSceneElement, close };
}

type Props = {
  /** What the table holds; the picture shown is one of these. */
  items: PlayItem[];
  /** The link whose picture is up, or null for none. */
  idSceneElement: number | null;
  /** The viewer closed the picture for themselves. */
  onClose: () => void;
};

/**
 * The picture itself, open over the whole table in the same preview a
 * thumbnail opens (AttachmentPreviewDialog), until it is taken down or
 * closed. A link the table does not hold, or one without a picture, shows
 * nothing. Keyed by the item, so a change of picture is a fresh dialog
 * rather than one whose image swaps under it. No tags: the picture's tags
 * are the attachment's, not the element's, as the pill's preview says.
 */
export function PulsedPicture({ items, idSceneElement, onClose }: Props) {
  const shown =
    idSceneElement === null
      ? null
      : (items.find((item) => item.idSceneElement === idSceneElement && item.imageUrl) ?? null);
  if (!shown?.imageUrl) return null;
  return (
    <AttachmentPreviewDialog
      key={shown.key}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      url={shown.imageUrl}
      label={shown.label}
      tags={[]}
      isCover={false}
      showTags={false}
    />
  );
}
