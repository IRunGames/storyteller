"use client";

import type { ComponentProps } from "react";
import { IconButton } from "@chakra-ui/react";
import { Heart } from "lucide-react";
import { sa_setFavorite } from "@/app/(app)/(nav)/stories/actions";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";

type Props = {
  idStory: number;
  /** Whether the story is among the viewer's favorites now. */
  isFavorite: boolean;
  /** True when the heart sits on a cover picture: white on a dark disc, red when pressed. */
  onImage?: boolean;
  /** sm on a card and the story page, xs in a table row. */
  size?: "xs" | "sm";
  /**
   * A list that owns the story: the press is handed to it (useFavorites),
   * since other cards and sections change with it, and `pending` says a
   * save is still out. Left out, the heart saves for itself and toasts a
   * refusal, as on the story page, where nothing else shows the favorite.
   */
  onToggle?: (isFavorite: boolean) => void;
  pending?: boolean;
} & Pick<ComponentProps<typeof IconButton>, "position" | "top" | "right" | "zIndex" | "flexShrink">;

/**
 * The heart on a story card, in a table row and on the story page: pressed
 * while the story is among the viewer's favorites, and a press either way
 * saves at once and shows the answer. aria-pressed rather than a checkbox,
 * since it is a toggle on a thing and not a form field. aria-disabled while
 * a save is out: a disabled button drops out of the tab order, so a keyboard
 * user would lose their place mid-toggle, and the click handler refuses
 * instead. The click stops where it is, so a card's link under the heart
 * never opens.
 */
export function StoryFavoriteButton({
  idStory,
  isFavorite,
  onImage = false,
  size = "sm",
  onToggle,
  pending,
  ...placement
}: Props) {
  const [shown, choose, saving] = useOptimisticAction(
    isFavorite,
    async (next) => {
      const result = await sa_setFavorite(idStory, next);
      return result.ok ? { ok: true, value: result.isFavorite } : result;
    },
    { failed: "Could not change your favorites. Try again." },
  );
  const own = onToggle === undefined;
  const pressed = own ? shown : isFavorite;
  const isPending = own ? saving : pending === true;
  const label = pressed ? "Remove from Favorites" : "Add to Favorites";

  return (
    <IconButtonWithTooltip
      label={label}
      type="button"
      aria-pressed={pressed}
      aria-disabled={isPending}
      size={size}
      color={pressed ? (onImage ? "red.300" : "red.fg") : onImage ? "whiteAlpha.900" : "fg.muted"}
      bg={onImage ? "blackAlpha.400" : undefined}
      _hover={onImage ? { bg: "blackAlpha.600" } : undefined}
      opacity={isPending ? "0.6" : undefined}
      cursor={isPending ? "not-allowed" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (isPending) return;
        if (onToggle) onToggle(!isFavorite);
        else choose(!shown);
      }}
      {...placement}
    >
      <Heart size={size === "sm" ? 22 : undefined} fill={pressed ? "currentColor" : "none"} />
    </IconButtonWithTooltip>
  );
}
