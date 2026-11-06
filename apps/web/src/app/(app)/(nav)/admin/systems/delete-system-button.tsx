"use client";

import { DeleteButton } from "@/components/confirm/delete-button";
import { sa_deleteSystem, type AdminSystem } from "./actions";

/**
 * The trashcan on a Systems row, and the dialog that asks first (DeleteButton).
 * The action keeps a system any story is run in, or that is on somebody's
 * list, and the refusal says how many; a system nothing uses goes with its
 * definition, which is the part that cannot come back.
 */
export function DeleteSystemButton({
  system,
  onDeleted,
}: {
  system: AdminSystem;
  onDeleted: () => void;
}) {
  return (
    <DeleteButton
      thing={system.label}
      label={`Delete ${system.label}`}
      onDelete={() => sa_deleteSystem(system.idSystem)}
      onDeleted={onDeleted}
    />
  );
}
