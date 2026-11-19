"use client";

import { DeleteButton } from "@/components/confirm/delete-button";
import { sa_deleteNews, type AdminNews } from "./actions";

/**
 * The trashcan on a row of the News table, and the popover that asks first
 * (DeleteButton). The record of who has read the item goes with it, which
 * the popover says, and it points at archiving for an item to keep.
 */
export function DeleteNewsButton({ item, onDeleted }: { item: AdminNews; onDeleted: () => void }) {
  return (
    <DeleteButton
      thing={item.title}
      label={`Delete ${item.title}`}
      onDelete={() => sa_deleteNews(item.idNews)}
      onDeleted={onDeleted}
    >
      It comes off the home page, and the record of who has read it goes with it. Archive it instead
      to take it down and keep it. This cannot be undone.
    </DeleteButton>
  );
}
