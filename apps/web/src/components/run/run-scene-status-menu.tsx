"use client";

import { createElement, useId } from "react";
import { Menu, Portal } from "@chakra-ui/react";
import { Ban, Circle, CircleCheck, EyeOff, RotateCw, type LucideIcon } from "lucide-react";
import { isSceneElementStatus, SCENE_ELEMENT_STATUSES, type SceneElementStatus } from "@/lib/run";
import { statusLabel } from "@/lib/status";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";

type Props = {
  /** What the pill calls the element, for the button's name. */
  label: string;
  /** The status the link holds now. */
  status: string;
  /** A status chosen from the menu, other than the one held. */
  onChange: (status: SceneElementStatus) => void;
};

/**
 * The icon that stands for each status, on the button and in the menu: in
 * play, hidden from the players, tapped (turned, as a card that has been
 * used is), switched off.
 */
const STATUS_ICONS: Record<SceneElementStatus, LucideIcon> = {
  READY: CircleCheck,
  INVISIBLE: EyeOff,
  TAPPED: RotateCw,
  DISABLED: Ban,
};

/** The icon for a status, or a plain circle for one the workflow no longer lists. */
export function sceneStatusIcon(status: string): LucideIcon {
  return isSceneElementStatus(status) ? STATUS_ICONS[status] : Circle;
}

/**
 * A pill's status, left of its name: an icon button showing the status the
 * link holds, with the status's name as its tooltip, that opens a menu of
 * the workflow's four statuses with their icons. Choosing one is reported;
 * the pill moves the link and shows the change (RunPlayPill).
 */
export function RunSceneStatusMenu({ label, status, onChange }: Props) {
  const triggerId = useId();
  const name = statusLabel(status);

  return (
    <Menu.Root
      ids={{ trigger: triggerId }}
      positioning={{ placement: "bottom-start" }}
      onSelect={(details) => {
        if (isSceneElementStatus(details.value) && details.value !== status) {
          onChange(details.value);
        }
      }}
    >
      {/* Named for the status it shows and what a press does, since the icon
          alone says only the first. The icon is chosen by status, so it is made
          with createElement rather than as a tag that changes from render to
          render. */}
      <IconButtonWithTooltip
        label={`${name}: change ${label}'s status`}
        tooltip={name}
        menuTrigger={triggerId}
      >
        {createElement(sceneStatusIcon(status))}
      </IconButtonWithTooltip>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="10rem">
            <Menu.RadioItemGroup value={status}>
              {SCENE_ELEMENT_STATUSES.map((each) => {
                const EachIcon = STATUS_ICONS[each];
                return (
                  <Menu.RadioItem key={each} value={each}>
                    <Menu.ItemIndicator />
                    <EachIcon size={14} aria-hidden />
                    <Menu.ItemText>{statusLabel(each)}</Menu.ItemText>
                  </Menu.RadioItem>
                );
              })}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
