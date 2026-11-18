"use client";

import { sa_setStoryActive } from "@/app/(app)/(nav)/stories/actions";
import { StatusMenuPill } from "@/components/status/status-menu-pill";
import { StatusPillSpan } from "@/components/status/pill-style";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import type { StatusOption } from "@/lib/status";

type Props = {
  idStory: number;
  isActive: boolean;
  /** The viewer runs the story, or is an administrator: the pill is a menu with the other state. */
  canEdit: boolean;
  /** The flag as the action took it, so the list can keep up. */
  onChanged?: (isActive: boolean) => void;
};

// A story has no status workflow, only the is_active flag, so the pill's
// two states are named here, as the words the Stories page already uses.
const ACTIVE: StatusOption = { key: "ACTIVE", label: "Active", description: null, from: null };
const INACTIVE: StatusOption = {
  key: "INACTIVE",
  label: "Inactive",
  description: null,
  from: null,
};

/**
 * A story's Active or Inactive on the Stories list, drawn as every status
 * pill is. For the storyteller of the story, and for an administrator, it is
 * also the way to retire the story or bring it back: a menu with the other
 * state (StatusMenuPill), which takes effect at once and is put back with a
 * word if the save is refused (sa_setStoryActive). Everyone else sees the
 * same pill without the menu.
 */
export function StoryActivePill({ idStory, isActive, canEdit, onChanged }: Props) {
  const [shown, choose] = useOptimisticAction(
    isActive,
    async (next) => {
      const result = await sa_setStoryActive(idStory, next);
      return result.ok ? { ok: true, value: result.isActive } : result;
    },
    { onShow: onChanged, failed: "The story's status could not be changed. Try again." },
  );
  const current = shown ? ACTIVE : INACTIVE;

  if (!canEdit) {
    return <StatusPillSpan data-status={current.key}>{current.label}</StatusPillSpan>;
  }
  return (
    <StatusMenuPill
      label={current.label}
      value={current.key}
      moves={[shown ? INACTIVE : ACTIVE]}
      onChoose={(next) => choose(next === ACTIVE.key)}
    />
  );
}
