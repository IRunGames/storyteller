"use client";

import { useState } from "react";
import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Heart } from "lucide-react";
import { sa_setFavorite } from "@/app/(app)/(nav)/stories/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  /** Whether the story is among the viewer's favorites as the page loaded. */
  isFavorite: boolean;
  /** True when the button sits on the dark panel over a cover image. */
  onImage: boolean;
};

/**
 * The story card's heart, alone in the story page's top corner as it is in
 * the card's: pressed while the
 * story is among the viewer's favorites, and a press either way saves at
 * once (sa_setFavorite) and shows the answer. aria-pressed rather than a
 * checkbox, as the card has it, since it is a toggle on a thing and not a
 * form field. aria-disabled while a save is out, for the card's reason: a
 * disabled button drops out of the tab order, so a keyboard user would lose
 * their place mid-toggle. A refusal puts the heart back and says so.
 */
export function StoryFavoriteButton({ idStory, isFavorite: initial, onImage }: Props) {
  const [isFavorite, setFavorite] = useState(initial);
  const [isPending, setPending] = useState(false);
  const label = isFavorite ? "Remove from Favorites" : "Add to Favorites";

  async function toggle() {
    if (isPending) return;
    const wanted = !isFavorite;
    setPending(true);
    setFavorite(wanted);
    try {
      const result = await sa_setFavorite(idStory, wanted);
      setFavorite(result.isFavorite);
    } catch {
      setFavorite(!wanted);
      toaster.create({ title: "Could not change your favorites. Try again.", type: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          type="button"
          aria-label={label}
          aria-pressed={isFavorite}
          aria-disabled={isPending}
          variant="ghost"
          size="sm"
          rounded="full"
          flexShrink="0"
          color={
            isFavorite ? (onImage ? "red.300" : "red.500") : onImage ? "whiteAlpha.900" : "fg.muted"
          }
          bg={onImage ? "blackAlpha.400" : undefined}
          _hover={onImage ? { bg: "blackAlpha.600" } : undefined}
          opacity={isPending ? "0.6" : undefined}
          onClick={() => void toggle()}
        >
          <Heart size={22} fill={isFavorite ? "currentColor" : "none"} />
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
