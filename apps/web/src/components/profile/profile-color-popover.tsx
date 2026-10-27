"use client";

import { useId, useState } from "react";
import { IconButton, Popover, Portal, SimpleGrid, Tooltip, chakra } from "@chakra-ui/react";
import { Check, Pencil } from "lucide-react";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { PROFILE_COLORS, PROFILE_PREFERENCE_KEYS, profileColor } from "@/lib/profile";
import { profileColorSchema } from "@/lib/profile-schemas";

/**
 * The pencil on the profile banner and the palette it opens. Picking a
 * swatch saves it straight to the preferences, which paint the banner at once
 * and put the old colour back if the server refuses.
 *
 * The swatches are buttons with role="radio" in a radiogroup rather than a
 * RadioGroup, as the standards ask for a choice that is shown, not labelled:
 * the colour is the whole of each option, and its name is the accessible
 * name and the tooltip.
 */
export function ProfileColorPopover() {
  const preferences = useUserPreferences();
  const current = profileColor(preferences.get(PROFILE_PREFERENCE_KEYS.color));
  const [open, setOpen] = useState(false);
  // Tooltip and popover each look their trigger up by id; one shared id
  // keeps the popover anchored to the pencil (see nav-theme-menu.tsx).
  const triggerId = useId();

  function choose(value: string) {
    const parsed = profileColorSchema.safeParse(value);
    if (!parsed.success) return;
    void preferences.set(PROFILE_PREFERENCE_KEYS.color, parsed.data);
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "bottom-end" }}
      ids={{ trigger: triggerId }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label="Change banner color"
              size="sm"
              rounded="full"
              variant="subtle"
              bg="blackAlpha.500"
              color="white"
              _hover={{ bg: "blackAlpha.700" }}
            >
              <Pencil />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Change banner color</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      {/* Not portalled, unlike the standards' other floating layers: it
          opens inside the profile dialog, which hides everything outside
          itself from assistive technology and traps focus within, so a
          portalled popover could be neither read nor typed into. */}
      <Popover.Positioner>
        <Popover.Content w="auto">
          <Popover.Arrow />
          <Popover.Header fontWeight="semibold">
            <Popover.Title>Banner color</Popover.Title>
          </Popover.Header>
          <Popover.Body pt="0">
            <SimpleGrid role="radiogroup" aria-label="Banner color" columns={6} gap="2">
              {PROFILE_COLORS.map(({ value, label }) => {
                const checked = value === current;
                return (
                  <chakra.button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={label}
                    title={label}
                    boxSize="8"
                    rounded="full"
                    bg={value}
                    color="white"
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    outline={checked ? "2px solid" : undefined}
                    outlineColor="fg"
                    outlineOffset="2px"
                    _focusVisible={{ outline: "2px solid", outlineColor: "fg" }}
                    onClick={() => choose(value)}
                  >
                    {checked && <Check size={16} />}
                  </chakra.button>
                );
              })}
            </SimpleGrid>
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}
